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

/** "보훈 대상자"가 있는 동네(읍/면/동) 경계 - 시/군 전체를 강조하면 후보
 * 병원이 다 그 안에 들어와 판단 근거가 없어지므로(사용자 피드백), 시/군보다
 * 한 단계 더 좁은 동 하나만 옅게 강조해서 보여준다. */
export interface MapHighlight {
  /** GeoJSON 관례대로 [lng, lat] 순서인 다각형 외곽선들. */
  rings: [number, number][][];
}

/** 후보가 넓은 범위(도 경계 밖 여러 시/군)에 걸쳐 있는 라운드에서는 지도가
 * 그만큼 축소되는데, 그 시/군 안의 작은 동(예: 도심 동)은 실제 지리적
 * 크기가 작아서 화면에서 몇 px짜리 점으로 줄어든다 - 하필 정답 병원 핀이
 * (동 중심과 가장 가까운 병원이니 자주 그 위에) 그 작은 영역을 통째로
 * 덮어버려 강조 표시가 안 보이는 문제가 있었다(사용자 피드백: "인근 위치가
 * 안뜨는데?"). 강조 영역의 화면상 크기가 이 값보다 작으면 중심을 기준으로
 * 확대해서 최소한 이 정도는 보이게 한다. */
const MIN_HIGHLIGHT_SIZE_PX = 32;

/** 컨테이너 비율(가로/세로)을 그대로 fitBoundsToAspect에 넘기면, 후보들이
 * 남북으로 길게 퍼진 라운드(예: 해안선을 따라 늘어선 병원들)에서 컨테이너가
 * 세로로 좁고 길수록 지리적 범위(latSpan)까지 그만큼 늘어나 핀 간격이
 * 오히려 더 촘촘해진다(사용자 피드백: "위아래로 길거나 범위가 넓어서 잘
 * 안 보인다"). 컨테이너 비율에 이 값 이상의 하한을 둬서 latSpan이 필요
 * 이상으로 늘어나지 않게 하고, 남는 세로 공간은 위아래 여백(grid 배경)으로
 * 흡수한다 - letterbox가 조금 생기더라도 핀 사이 실제 간격을 지키는 쪽이
 * 낫다. */
const MIN_CONTAINER_ASPECT = 0.62;

/** 핀 원(반지름 9 + 테두리)이 실제로 차지하는 화면상 크기 - 라벨-핀 연결선을
 * 핀 중심이 아니라 원 바깥 가장자리부터 시작하게 해서 선이 원을 뚫고
 * 나오지 않게 한다. */
const PIN_LABEL_GAP = 11;

/** 핀 2개 이상이 겹칠 때 라벨을 전부 아래로만 계단식으로 쌓으면, 핀에서
 * 먼 라벨일수록 "이게 저 핀 이름이 맞나?" 헷갈려 보인다(사용자 피드백:
 * "붙어있을 땐 하나는 위에 적히고 하나는 아래에 적히고 그럼 되지 않나?").
 * 그래서 위/아래를 번갈아 배치한다 - 클러스터 안에서 몇 번째로 겹치는지에
 * 따라 짝수 번째는 아래, 홀수 번째는 위로 보내고, 같은 방향 안에서만 더
 * 멀리 밀어낸다(레벨). 위쪽은 라벨 한 줄 높이만큼 더 확보해야 핀 원 위로
 * 글자가 안 걸친다. */
const LABEL_BELOW_BASE = 14;
const LABEL_ABOVE_BASE = 26;
const LABEL_STEP = 22;

/** offsetIndex(클러스터 내 순번)를 라벨의 수직 오프셋(px, 부호로 위/아래
 * 구분)으로 바꾼다. */
function labelDy(offsetIndex: number): number {
  const level = Math.floor(offsetIndex / 2);
  const isAbove = offsetIndex % 2 === 1;
  return isAbove ? -(LABEL_ABOVE_BASE + level * LABEL_STEP) : LABEL_BELOW_BASE + level * LABEL_STEP;
}

interface KoreaMapProps {
  /** 아직 로딩 중이면 null - 로딩 스켈레톤을 보여준다. */
  region: MapRegion | null;
  /** "보훈 대상자"가 있는 동(읍/면/동) 영역 - 시/군 전체 지도 위에 그 동만
   * 옅게 강조해서, 후보 병원 중 그 동에서 가장 가까운 곳을 가늠하게 한다. */
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
  // 컨테이너가 실제로 차지하는 화면 비율을 측정해서, viewBox 비율을 거기에
  // 정확히 맞춘다(fitBoundsToAspect) - letterbox(빈 여백)도, 강제 늘림(핀이
  // 타원으로 찌그러짐)도 없이 지도를 꽉 채우려면 둘 중 하나가 아니라
  // "지리적 범위 자체"를 컨테이너 비율에 맞게 넓혀야 한다.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setAspect(rect.width / rect.height);
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

  // 병원 후보가 실제로 서로 가까울 때(같은 동네에 여러 곳) 라벨(이름표)이
  // 겹쳐서 안 보이는 문제가 있었다(사용자 피드백) - 핀 좌표 사이 실제 거리가
  // 규칙(minSeparationKm)을 지켜도, 후보가 아주 넓게 퍼진 라운드에서는 지도가
  // 그만큼 축소되어 화면상 거리가 다시 가까워질 수 있다. 핀 자체 위치는
  // 정확해야 하니 그대로 두고, 라벨만 서로 겹치는 핀끼리 계단식으로 아래로
  // 내려서 겹치지 않게 한다.
  const labelOffsetIndex = useMemo(() => {
    if (!projection) return new Map<string, number>();
    const projected = pins.map((pin) => ({ id: pin.id, p: projection.project(pin.center) }));
    const CLUSTER_RADIUS = 42; // viewBox 단위 - 핀 히트 영역(18) + 라벨 폭 절반 정도
    const offsets = new Map<string, number>();
    for (let i = 0; i < projected.length; i++) {
      const { id, p } = projected[i];
      const usedIndices = new Set<number>();
      for (let j = 0; j < i; j++) {
        const other = projected[j];
        const dx = other.p.x - p.x;
        const dy = other.p.y - p.y;
        if (Math.hypot(dx, dy) < CLUSTER_RADIUS) usedIndices.add(offsets.get(other.id) ?? 0);
      }
      let idx = 0;
      while (usedIndices.has(idx)) idx++;
      offsets.set(id, idx);
    }
    return offsets;
  }, [pins, projection]);

  // 라벨(span)과 핀 원(svg circle)을 z-order 때문에 서로 다른 두 블록으로
  // 나눠 그리지만(아래 렌더 참고), 각 핀의 선택/정답/오답 판정과 화면 좌표는
  // 두 블록에 공통이므로 여기서 한 번만 계산해 재사용한다.
  const pinViews = useMemo(() => {
    if (!projection) return [];
    return pins.map((pin) => {
      const isSelected = selectedId === pin.id;
      const isCorrect = revealed && pin.id === correctId;
      const isWrongPick = revealed && isSelected && pin.id !== correctId;
      return {
        pin,
        p: projection.project(pin.center),
        isSelected,
        isCorrect,
        isWrongPick,
        offsetIndex: labelOffsetIndex.get(pin.id) ?? 0,
      };
    });
  }, [pins, projection, selectedId, revealed, correctId, labelOffsetIndex]);

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

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.grid} />

      {/* 땅/강조 영역은 그대로 라벨보다 아래에 둔다(불투명 색이라 라벨보다
         위로 가면 라벨이 통째로 안 보임). */}
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

      {/* 라벨(이름표)을 핀보다 먼저(=아래) 그린다 - 핀 후보가 서로 가까운
         동네에선 계단식 오프셋을 줘도 라벨이 옆 핀의 원까지 뒤덮는 경우가
         있었다(사용자 피드백: "모바일에서 클릭이 글자에 가려져서 안 보이는
         경우도 있네"). 클릭 판정은 라벨이 pointer-events:none이라 원래도
         막히지 않았지만, 핀 자체가 안 보이면 눌러야 할 위치를 알 수 없다 -
         핀 원을 별도 svg로 라벨 위에 그려서 어떤 라벨과 겹치든 클릭 대상이
         가려지지 않게 한다. */}
      {pinViews.map(({ pin, p, isSelected, isCorrect, isWrongPick, offsetIndex }) => {
        const labelClass = cx(
          styles.pinLabel,
          isCorrect && styles.pinLabelCorrect,
          isWrongPick && styles.pinLabelWrong,
          isSelected && !isCorrect && !isWrongPick && styles.pinLabelSelected,
        );
        const dyPx = labelDy(offsetIndex);
        const leftPct = `${(p.x / projection.width) * 100}%`;
        const topPct = `${(p.y / projection.height) * 100}%`;
        // 연결선은 "핀 원 가장자리"부터 "라벨 시작 지점"까지만 그린다 - 아래로
        // 밀린 라벨(dy > 0)이면 +GAP에서 dy까지, 위로 밀린 라벨(dy < 0)이면
        // dy에서 -GAP까지. 두 경우 다 선의 위쪽 끝(lineTop)에서 길이(length)만큼
        // 아래로 그으면 되도록 부호를 맞춰 정리한 값이다.
        const lineTop = dyPx > 0 ? PIN_LABEL_GAP : dyPx;
        const lineLength = Math.abs(dyPx) - PIN_LABEL_GAP;
        return (
          <Fragment key={pin.id}>
            {/* 핀 후보 3곳 이상이 실제로 서로 아주 가까울 때는 계단식으로
               내려간 라벨이 자기 핀에서 멀어 보여 "핀이랑 이름이 떨어져
               있다"는 오해를 산다(사용자 피드백) - 라벨이 원래 자리(dy=0)에서
               한 칸이라도 밀려났으면, 핀에서 라벨까지 얇은 선으로 이어서
               어느 라벨이 어느 핀 것인지 명확히 보여준다. */}
            {offsetIndex > 0 && (
              <span
                className={cx(styles.pinLeader, labelClass)}
                style={
                  {
                    left: leftPct,
                    top: topPct,
                    transform: `translate(-50%, ${lineTop}px)`,
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
                } as CSSProperties
              }
            >
              {pin.label}
            </span>
          </Fragment>
        );
      })}

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
              <circle className={styles.pinCircle} r={9} />
              {isCorrect && (
                <text className={styles.pinMark} y={3.5} textAnchor="middle">
                  ✓
                </text>
              )}
              {isWrongPick && (
                <text className={styles.pinMark} y={3.5} textAnchor="middle">
                  ✕
                </text>
              )}
            </g>
          );
        })}
      </svg>

    </div>
  );
}
