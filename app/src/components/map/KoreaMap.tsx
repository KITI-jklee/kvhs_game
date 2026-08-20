import { useMemo } from 'react';
import type { MouseEvent } from 'react';
import type { Bounds, LatLng, Point, Projection } from '../../lib/geo';
import { MAP_VIEW_HEIGHT, MAP_VIEW_WIDTH, createProjection, project, unproject } from '../../lib/geo';
import { JEJU_OUTLINE, MAINLAND_OUTLINE, ULLEUNGDO } from './koreaOutline';
import styles from './KoreaMap.module.css';

/** 라운드별 시/군/구 확대 지도 - `lib/cityOutline`에서 지연 로드해 전달한다. */
export interface MapRegion {
  /** GeoJSON 관례대로 [lng, lat] 순서인 다각형 외곽선들 (분구된 시는 구 여러 개, 다도해 군은 섬 여러 개). */
  rings: [number, number][][];
  bounds: Bounds;
  /** 지도 하단 캡션에 쓰이는 지역명, 예: "경기도 고양시". */
  label: string;
}

interface KoreaMapProps {
  /** 사용자가 찍은 지점(실제 위경도로 변환된 값). */
  pin: LatLng | null;
  /** 정답 위치 - `revealed`가 true일 때만 그려진다. */
  target: LatLng | null;
  targetLabel?: string;
  revealed: boolean;
  disabled?: boolean;
  onDropPin: (point: LatLng) => void;
  /** 없으면(로딩 중·매칭 실패) 전국 지도로 대체한다. */
  region?: MapRegion | null;
}

/** Catmull-Rom → 3차 베지어 변환으로 각진 좌표열을 부드러운 해안선처럼 그린다. */
function smoothClosedPath(points: Point[]): string {
  const n = points.length;
  if (n < 3) return '';
  const at = (i: number) => points[((i % n) + n) % n];
  let d = `M ${at(0).x} ${at(0).y}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
  }
  return `${d} Z`;
}

/** 행정 경계는 실측 경계선이라 Catmull-Rom으로 곡선화하지 않고 꼭짓점을 직선으로 잇는다. */
function polygonPath(points: Point[]): string {
  if (points.length < 3) return '';
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')} Z`;
}

const NATIONWIDE_MAINLAND_PATH = smoothClosedPath(MAINLAND_OUTLINE.map(project));
const NATIONWIDE_JEJU_PATH = smoothClosedPath(JEJU_OUTLINE.map(project));
const NATIONWIDE_ULLEUNGDO_POINT = project(ULLEUNGDO);

/** Ray-casting polygon test. Boundary-adjacent clicks are treated as land. */
function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x <= ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function KoreaMap({ pin, target, targetLabel, revealed, disabled, onDropPin, region }: KoreaMapProps) {
  const projection: Projection = useMemo(
    () => (region ? createProjection(region.bounds) : { width: MAP_VIEW_WIDTH, height: MAP_VIEW_HEIGHT, project, unproject }),
    [region],
  );

  const landPaths = useMemo(() => {
    if (!region) return [NATIONWIDE_MAINLAND_PATH, NATIONWIDE_JEJU_PATH];
    return region.rings.map((ring) => polygonPath(ring.map(([lng, lat]) => projection.project({ lat, lng }))));
  }, [region, projection]);

  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    if (disabled || revealed) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * projection.width;
    const y = ((event.clientY - rect.top) / rect.height) * projection.height;
    const clickPoint = { x, y };
    const landPolygons = region
      ? region.rings.map((ring) => ring.map(([lng, lat]) => projection.project({ lat, lng })))
      : [MAINLAND_OUTLINE.map(project), JEJU_OUTLINE.map(project)];
    const onLand = landPolygons.some((polygon) => isPointInPolygon(clickPoint, polygon));
    const onUlleungdo = !region
      && Math.hypot(x - NATIONWIDE_ULLEUNGDO_POINT.x, y - NATIONWIDE_ULLEUNGDO_POINT.y) <= 7;
    if (!onLand && !onUlleungdo) return;
    onDropPin(projection.unproject(clickPoint));
  };

  const pinPoint = pin ? projection.project(pin) : null;
  const targetPoint = revealed && target ? projection.project(target) : null;
  const mapCaption = region ? `${region.label} 지도 · 위치를 탭해 보세요` : '대한민국 지도 · 위치를 탭해 보세요';

  return (
    <div className={styles.wrap}>
      <div className={styles.grid} />
      <svg
        className={styles.svg}
        viewBox={`0 0 ${projection.width} ${projection.height}`}
        onClick={handleClick}
        role="presentation"
      >
        {landPaths.map((d, i) => (
          <path key={i} className={styles.landmass} d={d} />
        ))}
        {!region && (
          <circle
            className={styles.islet}
            cx={NATIONWIDE_ULLEUNGDO_POINT.x}
            cy={NATIONWIDE_ULLEUNGDO_POINT.y}
            r={4.5}
          />
        )}

        {pinPoint && targetPoint && (
          <line
            className={styles.link}
            x1={pinPoint.x}
            y1={pinPoint.y}
            x2={targetPoint.x}
            y2={targetPoint.y}
          />
        )}

        {pinPoint && (
          <g transform={`translate(${pinPoint.x} ${pinPoint.y})`}>
            <circle className={styles.pinRing} r={9} />
            <circle className={styles.pinDot} r={7} />
          </g>
        )}

        {targetPoint && (
          <g transform={`translate(${targetPoint.x} ${targetPoint.y})`}>
            <circle className={styles.answerDot} r={8} />
            <text className={styles.answerCheck} y={3.5} textAnchor="middle">
              ✓
            </text>
          </g>
        )}
      </svg>

      {targetPoint && targetLabel && (
        <span
          className={styles.answerLabel}
          style={{
            left: `${(targetPoint.x / projection.width) * 100}%`,
            top: `${(targetPoint.y / projection.height) * 100}%`,
          }}
        >
          {targetLabel}
        </span>
      )}

      <span className={styles.caption}>{mapCaption}</span>
    </div>
  );
}
