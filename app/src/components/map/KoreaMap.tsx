import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Bounds, LatLng, Point } from '../../lib/geo';
import { createProjection, fitBoundsToAspect } from '../../lib/geo';
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

  const projection = useMemo(
    () => (region ? createProjection(fitBoundsToAspect(region.bounds, aspect)) : null),
    [region, aspect],
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
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return projectedRings.map((ring) =>
      polygonPath(ring.map((p) => ({ x: cx + (p.x - cx) * scale, y: cy + (p.y - cy) * scale }))),
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
      <svg className={styles.svg} viewBox={`0 0 ${projection.width} ${projection.height}`} role="presentation">
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
      {pins.map((pin) => {
        const p = projection.project(pin.center);
        const isSelected = selectedId === pin.id;
        const isCorrect = revealed && pin.id === correctId;
        const isWrongPick = revealed && isSelected && pin.id !== correctId;
        const labelClass = [
          styles.pinLabel,
          isCorrect ? styles.pinLabelCorrect : '',
          isWrongPick ? styles.pinLabelWrong : '',
          isSelected && !isCorrect && !isWrongPick ? styles.pinLabelSelected : '',
        ]
          .filter(Boolean)
          .join(' ');
        const offsetIndex = labelOffsetIndex.get(pin.id) ?? 0;
        return (
          <span
            key={pin.id}
            className={labelClass}
            style={
              {
                left: `${(p.x / projection.width) * 100}%`,
                top: `${(p.y / projection.height) * 100}%`,
                '--label-dy': `${14 + offsetIndex * 22}px`,
              } as CSSProperties
            }
          >
            {pin.label}
          </span>
        );
      })}

      <svg className={styles.svg} viewBox={`0 0 ${projection.width} ${projection.height}`} role="presentation">
        {pins.map((pin) => {
          const p = projection.project(pin.center);
          const isSelected = selectedId === pin.id;
          const isCorrect = revealed && pin.id === correctId;
          const isWrongPick = revealed && isSelected && pin.id !== correctId;
          const groupClass = [
            styles.pinBtn,
            disabled || revealed ? styles.pinDisabled : '',
            isCorrect ? styles.pinCorrect : '',
            isWrongPick ? styles.pinWrong : '',
            isSelected && !revealed ? styles.pinSelected : '',
          ]
            .filter(Boolean)
            .join(' ');
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
