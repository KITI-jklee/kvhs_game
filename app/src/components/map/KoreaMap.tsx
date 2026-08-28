import { Fragment, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Bounds, LatLng, Point } from '../../lib/geo';
import { createProjection, fitBoundsToAspect } from '../../lib/geo';
import { cx } from '../../lib/cx';
import styles from './KoreaMap.module.css';

/** "가장 가까운 위탁병원 찾기" 게임용 확대 지도 - 관련된 도(道) 경계를 배경으로 보여준다. */
export interface MapRegion {
  /** GeoJSON 관례대로 [lng, lat] 순서인 다각형 외곽선들. */
  rings: [number, number][][];
  bounds: Bounds;
}

/** 병원 후보 핀 하나. */
export interface MapPin {
  id: string;
  center: LatLng;
  /** 핀 아래 표시되는 병원 이름. */
  label: string;
}

/** 강조할 읍/면/동 경계. */
export interface MapHighlight {
  /** GeoJSON 관례대로 [lng, lat] 순서인 다각형 외곽선들. */
  rings: [number, number][][];
}

/** 핀에 가리지 않을 강조 영역의 최소 크기. */
const MIN_HIGHLIGHT_SIZE_PX = 32;

/** 지나치게 좁은 화면비에서도 핀 간격을 유지하기 위한 하한. */
const MIN_CONTAINER_ASPECT = 0.62;

/** 핀 원의 반지름(뷰박스 단위) - 핀 그래픽과 라벨 배치 계산이 모두 이 값을 같이 쓴다. */
const PIN_VISUAL_RADIUS = 7;

/** 연결선을 시작할 핀 가장자리 간격. */
const PIN_LABEL_GAP = 7;

/** 라벨의 최소 상하 간격. */
const LABEL_BELOW_BASE = 6;
const LABEL_ABOVE_BASE = 18;
const LABEL_STEP = 14;

/** 라벨 이동량과 연결선 여부. */
interface LabelPlacement {
  dy: number;
  dx: number;
  needsLeader: boolean;
}

/** 실제 좌표는 유지하며 화면의 핀만 떨어뜨릴 최소 거리. */
const MIN_PIN_SEPARATION_PX = 26;

/** 글자 수로 라벨 충돌 폭을 추정한다. */
function estimateLabelHalfWidth(label: string): number {
  let width = 0;
  for (const ch of label) width += ch === ' ' ? 5 : 10.5; // 폰트 10.5px 기준 대략치
  return width / 2;
}

/** 라벨 한 줄의 추정 높이. */
const LABEL_LINE_PX = 16;
/** 지도 테두리에서 이 정도는 남기고 라벨 방향을 반대로 뒤집는다. */
const EDGE_MARGIN_PX = 4;

interface KoreaMapProps {
  /** 아직 로딩 중이면 null - 로딩 스켈레톤을 보여준다. */
  region: MapRegion | null;
  /** 강조할 읍/면/동 영역. */
  highlight: MapHighlight | null;
  pins: MapPin[];
  selectedId: string | null;
  /** `revealed`가 true일 때만 의미 있음. */
  correctId: string | null;
  /** 1등과는 다른 핀을 골랐지만 거리가 사실상 같아 정답으로 인정된 경우 - `revealed`가
   * true일 때만 의미 있고, 이때는 고른 핀도 오답(✕)이 아니라 정답으로 그려야 한다. */
  tieCredited?: boolean;
  revealed: boolean;
  disabled?: boolean;
  onSelect: (id: string) => void;
}

/** 행정 경계는 실측 경계선이라 곡선으로 다듬지 않고 꼭짓점을 직선으로 잇는다. */
function polygonPath(points: Point[]): string {
  if (points.length < 3) return '';
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')} Z`;
}

export function KoreaMap({
  region,
  highlight,
  pins,
  selectedId,
  correctId,
  tieCredited = false,
  revealed,
  disabled,
  onSelect,
}: KoreaMapProps) {
  // 컨테이너 화면비에 맞춰 지리 범위를 확장한다.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1);
  const [containerHeightPx, setContainerHeightPx] = useState(0);
  const [containerWidthPx, setContainerWidthPx] = useState(0);
  // useEffect(페인트 후 실행)가 아니라 useLayoutEffect(페인트 전 실행)를 써야
  // 마운트 첫 프레임에 SVG가 0x0(빈 지도)로 잠깐 그려지는 걸 막을 수 있다.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setAspect(rect.width / rect.height);
        setContainerHeightPx(rect.height);
        setContainerWidthPx(rect.width);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 세로로 긴 화면에서도 지도의 최소 비율을 유지해 거리 왜곡을 막는다.
  const clampedAspect = Math.max(aspect, MIN_CONTAINER_ASPECT);
  const projection = useMemo(
    () => (region ? createProjection(fitBoundsToAspect(region.bounds, clampedAspect)) : null),
    [region, clampedAspect],
  );

  // 지도 비율을 유지하며 컨테이너에 들어가는 최대 영역을 계산한다.
  const contentBox = useMemo(() => {
    if (!projection || containerWidthPx <= 0 || containerHeightPx <= 0) {
      return { width: containerWidthPx, height: containerHeightPx, offsetX: 0, offsetY: 0 };
    }
    const contentAspect = projection.width / projection.height;
    const containerAspect = containerWidthPx / containerHeightPx;
    if (containerAspect > contentAspect) {
      // 좌우 여백을 둔다.
      const height = containerHeightPx;
      const width = height * contentAspect;
      return { width, height, offsetX: (containerWidthPx - width) / 2, offsetY: 0 };
    }
    // 위아래 여백을 둔다.
    const width = containerWidthPx;
    const height = width / contentAspect;
    return { width, height, offsetX: 0, offsetY: (containerHeightPx - height) / 2 };
  }, [projection, containerWidthPx, containerHeightPx]);

  const landPaths = useMemo(() => {
    if (!region || !projection) return [];
    return region.rings.map((ring) => polygonPath(ring.map(([lng, lat]) => projection.project({ lat, lng }))));
  }, [region, projection]);

  const projectedPins = useMemo(() => {
    if (!projection) return [];
    return pins.map((pin) => ({ id: pin.id, label: pin.label, p: projection.project(pin.center) }));
  }, [pins, projection]);

  // 충돌은 여백을 제외한 실제 지도 영역의 px 기준으로 계산한다.
  const pxScale = projection && contentBox.height > 0 ? contentBox.height / projection.height : 1;

  // 실제 좌표는 유지하고 겹친 핀의 표시 위치만 반발시킨다.
  // 주의: 이건 화면 px 기준 뭉침/겹침 방지이고, 실제 위경도(km) 기준 뭉침 방지는
  // lib/nearestHospital.ts의 selectNearestChoices(clusterRadiusKm/wouldCluster)가
  // 별도로 담당한다. 두 로직은 서로 참조하지 않는 독립된 안전장치이니, 한쪽을
  // 단순화하거나 제거할 때는 반드시 다른 쪽이 같은 문제를 커버하는지 확인할 것.
  const nudgedPositions = useMemo(() => {
    const positions = new Map(projectedPins.map(({ id, p }) => [id, { ...p }]));
    const ids = projectedPins.map((p) => p.id);
    const minSepUnits = MIN_PIN_SEPARATION_PX / pxScale;
    for (let iter = 0; iter < 6; iter++) {
      let moved = false;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = positions.get(ids[i])!;
          const b = positions.get(ids[j])!;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          if (dist >= minSepUnits) continue;
          moved = true;
          if (dist < 0.001) {
            dx = 1;
            dy = 0;
            dist = 1;
          }
          const push = (minSepUnits - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
        }
      }
      if (!moved) break;
    }
    return positions;
  }, [projectedPins, pxScale]);

  // 핀과 라벨 충돌을 같은 화면 px 단위로 계산한다.
  const labelPlacement = useMemo(() => {
    const placement = new Map<string, LabelPlacement>();
    const ids = projectedPins.map((p) => p.id);
    if (!ids.length) return placement;
    const labelById = new Map(projectedPins.map((p) => [p.id, p.label]));
    const px = new Map(ids.map((id) => {
      const p = nudgedPositions.get(id)!;
      return [id, { x: p.x * pxScale, y: p.y * pxScale }];
    }));
    // 충돌 검사에 쓸 핀 반지름과 최소 여유.
    const pinRadiusPx = PIN_VISUAL_RADIUS * pxScale + 3;
    // 배율이 커져도 라벨이 자기 핀을 벗어나게 최소 간격을 보정한다.
    const visualPinRadiusPx = PIN_VISUAL_RADIUS * pxScale + 2;
    const clearanceMarginPx = 1;
    const belowBase = Math.max(LABEL_BELOW_BASE, visualPinRadiusPx + clearanceMarginPx);
    const aboveBase = Math.max(LABEL_ABOVE_BASE, visualPinRadiusPx + clearanceMarginPx + LABEL_LINE_PX);

    // 좌우 라벨의 핀 중심 기준 간격.
    const sideGapPx = visualPinRadiusPx + clearanceMarginPx + 3;

    // 충돌 없는 후보 중 핀에서 가장 가까운 위치를 고른다.
    type Direction = 'below' | 'above' | 'left' | 'right';
    type Candidate = { dir: Direction; level: number; dx: number; dy: number; rect: { left: number; right: number; top: number; bottom: number } };

    const rectFor = (p: { x: number; y: number }, halfW: number, dir: Direction, level: number) => {
      if (dir === 'below' || dir === 'above') {
        const dy = dir === 'below' ? belowBase + level * LABEL_STEP : -(aboveBase + level * LABEL_STEP);
        return { dx: 0, dy, rect: { left: p.x - halfW, right: p.x + halfW, top: p.y + dy, bottom: p.y + dy + LABEL_LINE_PX } };
      }
      // 좌우 라벨은 핀 옆에 세로 중앙 정렬한다.
      const sideOffset = sideGapPx + halfW + level * LABEL_STEP;
      const dx = dir === 'left' ? -sideOffset : sideOffset;
      const dy = -LABEL_LINE_PX / 2;
      return { dx, dy, rect: { left: p.x + dx - halfW, right: p.x + dx + halfW, top: p.y + dy, bottom: p.y + dy + LABEL_LINE_PX } };
    };

    // 주어진 순서로 라벨을 배치하고 최대 핀-라벨 거리를 계산한다.
    const computeForOrder = (order: string[]) => {
      const placedRects: { left: number; right: number; top: number; bottom: number }[] = [];
      const result = new Map<string, LabelPlacement>();
      let maxDist = 0;
      for (const id of order) {
        const p = px.get(id)!;
        const halfW = estimateLabelHalfWidth(labelById.get(id)!) + 4;
        const candidates: { dir: Direction; level: number }[] = [];
        for (let level = 0; level < 4; level++) {
          candidates.push({ dir: 'below', level });
          candidates.push({ dir: 'above', level });
          candidates.push({ dir: 'left', level });
          candidates.push({ dir: 'right', level });
        }

        let bestFound: Candidate | null = null;
        let bestFoundDist = Infinity;
        // 빈자리가 없으면 충돌 점수가 가장 낮은 후보를 쓴다.
        let bestFallback: Candidate | null = null;
        let bestFallbackScore = Infinity;
        for (const { dir, level } of candidates) {
          const { dx, dy, rect } = rectFor(p, halfW, dir, level);
          const hitsPin = ids.some((otherId) => {
            if (otherId === id) return false;
            const op = px.get(otherId)!;
            const closestX = Math.max(rect.left, Math.min(op.x, rect.right));
            const closestY = Math.max(rect.top, Math.min(op.y, rect.bottom));
            const dxp = op.x - closestX;
            const dyy = op.y - closestY;
            return dxp * dxp + dyy * dyy < pinRadiusPx * pinRadiusPx;
          });
          const hitsLabel = placedRects.some(
            (r) => rect.left < r.right && rect.right > r.left && rect.top < r.bottom && rect.bottom > r.top,
          );
          // 실제 지도 영역을 기준으로 충돌과 잘림을 검사한다.
          const hitsTopEdge = contentBox.height > 0 && rect.top < EDGE_MARGIN_PX;
          const hitsBottomEdge = contentBox.height > 0 && rect.bottom > contentBox.height - EDGE_MARGIN_PX;
          const attemptFound = !hitsLabel && !hitsTopEdge && !hitsBottomEdge;
          const candidate: Candidate = { dir, level, dx, dy, rect };
          if (attemptFound) {
            const dist = Math.hypot(dx, dy + LABEL_LINE_PX / 2);
            if (dist < bestFoundDist) {
              bestFoundDist = dist;
              bestFound = candidate;
            }
            continue;
          }
          // 핀, 라벨, 테두리 순으로 충돌 비용을 매긴다.
          const score = (hitsPin ? 100 : 0) + (hitsLabel ? 10 : 0) + (hitsTopEdge || hitsBottomEdge ? 1 : 0);
          if (score < bestFallbackScore) {
            bestFallbackScore = score;
            bestFallback = candidate;
          }
        }
        const chosen = bestFound ?? bestFallback!;
        placedRects.push(chosen.rect);
        const isAdjacent = ((chosen.dir === 'below' || chosen.dir === 'left' || chosen.dir === 'right') && chosen.level === 0);
        result.set(id, { dy: chosen.dy, dx: chosen.dx, needsLeader: !isAdjacent });
        const chosenDist = Math.hypot(chosen.dx, chosen.dy + LABEL_LINE_PX / 2);
        if (chosenDist > maxDist) maxDist = chosenDist;
      }
      return { result, maxDist };
    };

    // 여러 처리 순서 중 최대 핀-라벨 거리가 가장 짧은 결과를 쓴다.
    const orderCandidates: string[][] = [
      [...ids].sort((a, b) => px.get(b)!.y - px.get(a)!.y),
      [...ids].sort((a, b) => px.get(a)!.y - px.get(b)!.y),
      [...ids].sort((a, b) => px.get(a)!.x - px.get(b)!.x),
      [...ids].sort((a, b) => px.get(b)!.x - px.get(a)!.x),
    ];
    let best = computeForOrder(orderCandidates[0]);
    for (let i = 1; i < orderCandidates.length; i++) {
      const candidate = computeForOrder(orderCandidates[i]);
      if (candidate.maxDist < best.maxDist) best = candidate;
    }
    for (const [id, value] of best.result) placement.set(id, value);

    // 지도 좌우 경계를 넘는 라벨은 안쪽으로 민다 - 다만 그 이동으로 다른 핀/라벨과
    // 새로 겹치게 되면 밀지 않는다(화면 밖으로 살짝 넘치는 것보다 다른 라벨/핀과
    // 겹치는 쪽이 더 눈에 띄는 문제라, 앞서 고른 충돌 없는 배치를 깨지 않는다).
    if (contentBox.width > 0) {
      const currentRect = (id: string) => {
        const placed = placement.get(id)!;
        const p = px.get(id)!;
        const halfW = estimateLabelHalfWidth(labelById.get(id)!) + 4;
        return {
          left: p.x + placed.dx - halfW,
          right: p.x + placed.dx + halfW,
          top: p.y + placed.dy,
          bottom: p.y + placed.dy + LABEL_LINE_PX,
        };
      };
      for (const id of ids) {
        const placed = placement.get(id)!;
        const p = px.get(id)!;
        const halfW = estimateLabelHalfWidth(labelById.get(id)!) + 4;
        const left = p.x + placed.dx - halfW;
        const right = p.x + placed.dx + halfW;
        let dx = placed.dx;
        if (left < EDGE_MARGIN_PX) dx = placed.dx + (EDGE_MARGIN_PX - left);
        else if (right > contentBox.width - EDGE_MARGIN_PX) dx = placed.dx + (contentBox.width - EDGE_MARGIN_PX - right);
        if (dx === placed.dx) continue;
        const shiftedRect = { left: p.x + dx - halfW, right: p.x + dx + halfW, top: p.y + placed.dy, bottom: p.y + placed.dy + LABEL_LINE_PX };
        const hitsOtherPin = ids.some((otherId) => {
          if (otherId === id) return false;
          const op = px.get(otherId)!;
          const closestX = Math.max(shiftedRect.left, Math.min(op.x, shiftedRect.right));
          const closestY = Math.max(shiftedRect.top, Math.min(op.y, shiftedRect.bottom));
          const dxp = op.x - closestX;
          const dyy = op.y - closestY;
          return dxp * dxp + dyy * dyy < pinRadiusPx * pinRadiusPx;
        });
        const hitsOtherLabel = ids.some((otherId) => {
          if (otherId === id) return false;
          const r = currentRect(otherId);
          return shiftedRect.left < r.right && shiftedRect.right > r.left && shiftedRect.top < r.bottom && shiftedRect.bottom > r.top;
        });
        if (!hitsOtherPin && !hitsOtherLabel) placement.set(id, { ...placed, dx, needsLeader: true });
      }
    }

    return placement;
  }, [projectedPins, nudgedPositions, pxScale, contentBox]);

  // 분리 렌더링하는 라벨과 핀의 공통 상태를 계산한다.
  const pinViews = useMemo(() => {
    if (!projection) return [];
    return pins.map((pin) => {
      const isSelected = selectedId === pin.id;
      // 1등 핀은 항상 정답으로 표시하고, 1등과 다른 핀이라도 거리가 미미해 정답으로
      // 인정된 픽(tieCredited)이면 오답(✕)이 아니라 정답으로 그린다 - 점수/문구와
      // 지도 표시가 서로 다른 답을 말하는 모순을 막는다.
      const isTiedPick = revealed && isSelected && tieCredited && pin.id !== correctId;
      const isCorrect = revealed && (pin.id === correctId || isTiedPick);
      const isWrongPick = revealed && isSelected && pin.id !== correctId && !isTiedPick;
      return {
        pin,
        p: nudgedPositions.get(pin.id) ?? projection.project(pin.center),
        isSelected,
        isCorrect,
        isWrongPick,
        placement: labelPlacement.get(pin.id) ?? { dy: LABEL_BELOW_BASE, dx: 0, needsLeader: false },
      };
    });
  }, [pins, projection, nudgedPositions, selectedId, revealed, correctId, tieCredited, labelPlacement]);

  const highlightPaths = useMemo(() => {
    if (!highlight || !projection) return [];
    const projectedRings = highlight.rings.map((ring) => ring.map(([lng, lat]) => projection.project({ lat, lng })));
    const allPoints = projectedRings.flat();
    if (!allPoints.length) return [];

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of allPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const scale = Math.max(1, MIN_HIGHLIGHT_SIZE_PX / width, MIN_HIGHLIGHT_SIZE_PX / height);
    if (scale <= 1) return projectedRings.map((ring) => polygonPath(ring));

    // 너무 작으면 중심 기준으로 확대 - 모양은 그대로 유지하고 크기만 키운다.
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return projectedRings.map((ring) =>
      polygonPath(ring.map((p) => ({ x: centerX + (p.x - centerX) * scale, y: centerY + (p.y - centerY) * scale }))),
    );
  }, [highlight, projection]);

  if (!region || !projection) {
    return (
      <div className={styles.wrap} ref={wrapRef}>
        <div className={styles.grid} />
      </div>
    );
  }

  // 선택 전에는 핀을, 공개 후에는 라벨을 위에 그린다.
  const labelElements = pinViews.map(({ pin, p, isSelected, isCorrect, isWrongPick, placement }) => {
    const labelClass = cx(
      styles.pinLabel,
      isCorrect && styles.pinLabelCorrect,
      isWrongPick && styles.pinLabelWrong,
      isSelected && !isCorrect && !isWrongPick && styles.pinLabelSelected,
    );
    const dyPx = placement.dy;
    const dxPx = placement.dx;
    // 라벨 위치는 핀과 동일하게 실제 지도 영역의 px 좌표를 사용한다.
    const leftPx = contentBox.offsetX + (p.x / projection.width) * contentBox.width;
    const topPx = contentBox.offsetY + (p.y / projection.height) * contentBox.height;
    const leftCss = `${leftPx}px`;
    const topCss = `${topPx}px`;
    // 연결선은 핀 가장자리부터 라벨의 가까운 끝까지만 그린다.
    const lineTop = dyPx > 0 ? PIN_LABEL_GAP : dyPx + LABEL_LINE_PX;
    const lineLength = Math.max(0, dyPx > 0 ? dyPx - PIN_LABEL_GAP : -PIN_LABEL_GAP - (dyPx + LABEL_LINE_PX));
    return (
      <Fragment key={pin.id}>
        {placement.needsLeader && (
          <span
            className={cx(styles.pinLeader, labelClass)}
            style={
              {
                left: leftCss,
                top: topCss,
                transform: `translate(calc(-50% + ${dxPx}px), ${lineTop}px)`,
                height: `${lineLength}px`,
              } as CSSProperties
            }
            aria-hidden
          />
        )}
        <span
          className={labelClass}
          style={
            {
              left: leftCss,
              top: topCss,
              '--label-dy': `${dyPx}px`,
              '--label-dx': `${dxPx}px`,
            } as CSSProperties
          }
        >
          {pin.label}
        </span>
      </Fragment>
    );
  });

  // 배경과 핀 SVG에 같은 영역을 적용해 지도 비율을 유지한다.
  const svgBoxStyle: CSSProperties = {
    left: contentBox.offsetX,
    top: contentBox.offsetY,
    width: contentBox.width,
    height: contentBox.height,
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.grid} />

      <svg
        className={styles.svg}
        style={svgBoxStyle}
        viewBox={`0 0 ${projection.width} ${projection.height}`}
        preserveAspectRatio="none"
        role="presentation"
      >
        {landPaths.map((d, i) => (
          <path key={i} className={styles.landmass} d={d} />
        ))}

        {highlightPaths.map((d, i) => (
          <path key={i} className={styles.highlight} d={d} />
        ))}
      </svg>

      {!revealed && labelElements}

      <svg
        className={styles.svg}
        style={svgBoxStyle}
        viewBox={`0 0 ${projection.width} ${projection.height}`}
        preserveAspectRatio="none"
        role="presentation"
      >
        {pinViews.map(({ pin, p, isSelected, isCorrect, isWrongPick }) => {
          const groupClass = cx(
            styles.pinBtn,
            (disabled || revealed) && styles.pinDisabled,
            isCorrect && styles.pinCorrect,
            isWrongPick && styles.pinWrong,
            isSelected && !revealed && styles.pinSelected,
          );
          return (
            <g
              key={pin.id}
              className={groupClass}
              transform={`translate(${p.x} ${p.y})`}
              onClick={() => {
                if (!disabled && !revealed) onSelect(pin.id);
              }}
            >
              <circle className={styles.pinHit} r={18} />
              <circle className={styles.pinCircle} r={PIN_VISUAL_RADIUS} />
              {isCorrect && (
                <text className={styles.pinMark} y={2.8} textAnchor="middle">
                  ✓
                </text>
              )}
              {isWrongPick && (
                <text className={styles.pinMark} y={2.8} textAnchor="middle">
                  ✕
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {revealed && labelElements}

    </div>
  );
}
