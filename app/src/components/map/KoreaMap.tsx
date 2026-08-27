import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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

export function KoreaMap({ region, highlight, pins, selectedId, correctId, revealed, disabled, onSelect }: KoreaMapProps) {
  // 컨테이너 화면비에 맞춰 지리 범위를 확장한다.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1);
  const [containerHeightPx, setContainerHeightPx] = useState(0);
  const [containerWidthPx, setContainerWidthPx] = useState(0);
  useEffect(() => {
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

  const clampedAspect = Math.max(aspect, MIN_CONTAINER_ASPECT);
  const projection = useMemo(
    () => (region ? createProjection(fitBoundsToAspect(region.bounds, clampedAspect)) : null),
    [region, clampedAspect],
  );

  const landPaths = useMemo(() => {
    if (!region || !projection) return [];
    return region.rings.map((ring) => polygonPath(ring.map(([lng, lat]) => projection.project({ lat, lng }))));
  }, [region, projection]);

  const projectedPins = useMemo(() => {
    if (!projection) return [];
    return pins.map((pin) => ({ id: pin.id, label: pin.label, p: projection.project(pin.center) }));
  }, [pins, projection]);

  // 충돌 계산은 가변 viewBox가 아닌 화면 px 기준으로 한다.
  const pxScale = projection && containerHeightPx > 0 ? containerHeightPx / projection.height : 1;

  // 실제 좌표는 유지하고 겹친 핀의 표시 위치만 반발시킨다.
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

    // 아래쪽부터 실제 충돌이 없는 첫 자리를 선택한다.
    const placedRects: { left: number; right: number; top: number; bottom: number }[] = [];
    const order = [...ids].sort((a, b) => px.get(b)!.y - px.get(a)!.y);
    for (const id of order) {
      const p = px.get(id)!;
      const halfW = estimateLabelHalfWidth(labelById.get(id)!) + 4;
      let dir: 'above' | 'below' = 'below';
      let level = 0;
      let dy = 0;
      let rect = { left: 0, right: 0, top: 0, bottom: 0 };
      let found = false;
      // 빈자리가 없으면 충돌 점수가 가장 낮은 후보를 쓴다.
      let bestScore = Infinity;
      let bestDir: 'above' | 'below' = dir;
      let bestLevel = level;
      let bestDy = dy;
      let bestRect = rect;
      for (let attempt = 0; attempt < 8 && !found; attempt++) {
        dir = attempt % 2 === 0 ? 'below' : 'above';
        level = Math.floor(attempt / 2);
        dy = dir === 'below' ? belowBase + level * LABEL_STEP : -(aboveBase + level * LABEL_STEP);
        rect = { left: p.x - halfW, right: p.x + halfW, top: p.y + dy, bottom: p.y + dy + LABEL_LINE_PX };
        const hitsPin = ids.some((otherId) => {
          if (otherId === id) return false;
          const op = px.get(otherId)!;
          const closestX = Math.max(rect.left, Math.min(op.x, rect.right));
          const closestY = Math.max(rect.top, Math.min(op.y, rect.bottom));
          const dx = op.x - closestX;
          const dyy = op.y - closestY;
          return dx * dx + dyy * dyy < pinRadiusPx * pinRadiusPx;
        });
        const hitsLabel = placedRects.some(
          (r) => rect.left < r.right && rect.right > r.left && rect.top < r.bottom && rect.bottom > r.top,
        );
        // 라벨 충돌과 지도 밖 잘림을 함께 검사한다.
        const hitsTopEdge = containerHeightPx > 0 && rect.top < EDGE_MARGIN_PX;
        const hitsBottomEdge = containerHeightPx > 0 && rect.bottom > containerHeightPx - EDGE_MARGIN_PX;
        found = !hitsLabel && !hitsTopEdge && !hitsBottomEdge;
        // 핀, 라벨, 테두리 순으로 충돌 비용을 매긴다.
        const score = (hitsPin ? 100 : 0) + (hitsLabel ? 10 : 0) + (hitsTopEdge || hitsBottomEdge ? 1 : 0);
        if (score < bestScore) {
          bestScore = score;
          bestDir = dir;
          bestLevel = level;
          bestDy = dy;
          bestRect = rect;
        }
      }
      if (!found) {
        dir = bestDir;
        level = bestLevel;
        dy = bestDy;
        rect = bestRect;
      }
      placedRects.push(rect);
      placement.set(id, { dy, dx: 0, needsLeader: !(dir === 'below' && level === 0) });
    }

    // 좌우 테두리를 넘는 만큼 라벨을 안쪽으로 민다.
    if (containerWidthPx > 0) {
      for (const id of ids) {
        const placed = placement.get(id)!;
        const p = px.get(id)!;
        const halfW = estimateLabelHalfWidth(labelById.get(id)!) + 4;
        const left = p.x - halfW;
        const right = p.x + halfW;
        let dx = 0;
        if (left < EDGE_MARGIN_PX) dx = EDGE_MARGIN_PX - left;
        else if (right > containerWidthPx - EDGE_MARGIN_PX) dx = containerWidthPx - EDGE_MARGIN_PX - right;
        if (dx !== 0) placement.set(id, { ...placed, dx, needsLeader: true });
      }
    }

    return placement;
  }, [projectedPins, nudgedPositions, pxScale, containerHeightPx, containerWidthPx]);

  // 분리 렌더링하는 라벨과 핀의 공통 상태를 계산한다.
  const pinViews = useMemo(() => {
    if (!projection) return [];
    return pins.map((pin) => {
      const isSelected = selectedId === pin.id;
      const isCorrect = revealed && pin.id === correctId;
      const isWrongPick = revealed && isSelected && pin.id !== correctId;
      return {
        pin,
        p: nudgedPositions.get(pin.id) ?? projection.project(pin.center),
        isSelected,
        isCorrect,
        isWrongPick,
        placement: labelPlacement.get(pin.id) ?? { dy: LABEL_BELOW_BASE, dx: 0, needsLeader: false },
      };
    });
  }, [pins, projection, nudgedPositions, selectedId, revealed, correctId, labelPlacement]);

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
    const leftPct = `${(p.x / projection.width) * 100}%`;
    const topPct = `${(p.y / projection.height) * 100}%`;
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
                left: leftPct,
                top: topPct,
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
              left: leftPct,
              top: topPct,
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

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.grid} />

      <svg
        className={styles.svg}
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
