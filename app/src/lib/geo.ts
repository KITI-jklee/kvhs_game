/**
 * Geo helpers for 게임① 보훈병원 위치감각게임.
 *
 * `project`/`unproject` implement the "대한민국 SVG 지도 위 좌표 변환"
 * required by NFR-03 (별도 지도 SDK 없이) - both the hand-drawn coastline in
 * `KoreaMap.tsx` and every pin on it are produced by running real
 * lat/lng through this exact projection, so a click's pixel position can be
 * converted back to lat/lng and scored with real-world haversine distance
 * (FR-G1-03), not a screen-pixel distance.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Bounding box covering every hospital in hospital_locations.json, plus a small margin. */
export const KOREA_BOUNDS = {
  latMin: 32.8,
  latMax: 38.8,
  lonMin: 124.3,
  lonMax: 131.3,
};

const meanLatRad = (((KOREA_BOUNDS.latMin + KOREA_BOUNDS.latMax) / 2) * Math.PI) / 180;
const latSpanKm = (KOREA_BOUNDS.latMax - KOREA_BOUNDS.latMin) * 111.32;
const lonSpanKm = (KOREA_BOUNDS.lonMax - KOREA_BOUNDS.lonMin) * 111.32 * Math.cos(meanLatRad);

/** Map viewBox sized so 1 SVG unit ≈ 1 SVG unit in both axes represents the same real-world km (minimal shape distortion). */
export const MAP_VIEW_HEIGHT = 520;
export const MAP_VIEW_WIDTH = Math.round(MAP_VIEW_HEIGHT * (lonSpanKm / latSpanKm));

export function project({ lat, lng }: LatLng): Point {
  const xFrac = (lng - KOREA_BOUNDS.lonMin) / (KOREA_BOUNDS.lonMax - KOREA_BOUNDS.lonMin);
  const yFrac = (KOREA_BOUNDS.latMax - lat) / (KOREA_BOUNDS.latMax - KOREA_BOUNDS.latMin);
  return { x: xFrac * MAP_VIEW_WIDTH, y: yFrac * MAP_VIEW_HEIGHT };
}

export function unproject({ x, y }: Point): LatLng {
  const xFrac = x / MAP_VIEW_WIDTH;
  const yFrac = y / MAP_VIEW_HEIGHT;
  return {
    lng: KOREA_BOUNDS.lonMin + xFrac * (KOREA_BOUNDS.lonMax - KOREA_BOUNDS.lonMin),
    lat: KOREA_BOUNDS.latMax - yFrac * (KOREA_BOUNDS.latMax - KOREA_BOUNDS.latMin),
  };
}

export interface Bounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

export interface Projection {
  width: number;
  height: number;
  project(p: LatLng): Point;
  unproject(p: Point): LatLng;
}

/**
 * 시/군 단위 확대 지도(FR-G1-02 개선)를 위한 범용 투영. `project`/`unproject`와
 * 동일한 등장방형 투영을 임의의 `bounds`에 대해 만들어 준다 - 위경도 비율에
 * 맞춰 폭을 계산해 모양이 찌그러지지 않는다.
 */
export function createProjection(bounds: Bounds, viewHeight = 520): Projection {
  const meanLatRad = ((bounds.latMin + bounds.latMax) / 2) * Math.PI / 180;
  const latSpanKm = (bounds.latMax - bounds.latMin) * 111.32;
  const lonSpanKm = (bounds.lonMax - bounds.lonMin) * 111.32 * Math.cos(meanLatRad);
  const width = Math.max(1, Math.round(viewHeight * (lonSpanKm / latSpanKm)));
  const height = viewHeight;
  return {
    width,
    height,
    project({ lat, lng }) {
      const xFrac = (lng - bounds.lonMin) / (bounds.lonMax - bounds.lonMin);
      const yFrac = (bounds.latMax - lat) / (bounds.latMax - bounds.latMin);
      return { x: xFrac * width, y: yFrac * height };
    },
    unproject({ x, y }) {
      const xFrac = x / width;
      const yFrac = y / height;
      return {
        lng: bounds.lonMin + xFrac * (bounds.lonMax - bounds.lonMin),
        lat: bounds.latMax - yFrac * (bounds.latMax - bounds.latMin),
      };
    },
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export interface RegionBbox {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

/**
 * 병원이 속한 시/군의 경계 bbox로부터 확대 지도의 투영 범위를 만든다.
 * 신안군·완도군처럼 섬이 흩어진 광역 군은 bbox가 100km를 넘기도 해서 그대로
 * 쓰면 확대 효과가 없다 - `maxSpanKm`로 잘라 정답 병원 좌표를 중심으로 보여준다.
 */
export function boundsForRegion(
  bbox: RegionBbox,
  target: LatLng,
  { maxSpanKm = 55, minSpanKm = 14, paddingRatio = 0.22 } = {},
): Bounds {
  const meanLatRad = ((bbox.latMin + bbox.latMax) / 2) * Math.PI / 180;
  const bboxWKm = (bbox.lonMax - bbox.lonMin) * 111.32 * Math.cos(meanLatRad);
  const bboxHKm = (bbox.latMax - bbox.latMin) * 111.32;
  const halfWKm = clamp((bboxWKm * (1 + paddingRatio)) / 2, minSpanKm / 2, maxSpanKm / 2);
  const halfHKm = clamp((bboxHKm * (1 + paddingRatio)) / 2, minSpanKm / 2, maxSpanKm / 2);
  const fitsFully = bboxWKm <= maxSpanKm && bboxHKm <= maxSpanKm;
  const centerLat = fitsFully ? (bbox.latMin + bbox.latMax) / 2 : target.lat;
  const centerLng = fitsFully ? (bbox.lonMin + bbox.lonMax) / 2 : target.lng;
  const dLat = halfHKm / 111.32;
  const dLng = halfWKm / (111.32 * Math.cos(meanLatRad));
  return {
    latMin: centerLat - dLat,
    latMax: centerLat + dLat,
    lonMin: centerLng - dLng,
    lonMax: centerLng + dLng,
  };
}

/** `bounds`가 실제로 덮는 폭/높이를 km로 환산해 평균낸 값 - 지도의 "반경"을 구하는 데 쓴다. */
export function spanKmOfBounds(bounds: Bounds): number {
  const meanLatRad = ((bounds.latMin + bounds.latMax) / 2) * Math.PI / 180;
  const latSpanKm = (bounds.latMax - bounds.latMin) * 111.32;
  const lonSpanKm = (bounds.lonMax - bounds.lonMin) * 111.32 * Math.cos(meanLatRad);
  return (latSpanKm + lonSpanKm) / 2;
}

/** Great-circle distance in km (FR-G1-03) - real위경도 기준, 화면 픽셀 거리 아님. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 기능설계서 3-2: 오차 거리 → 라운드 점수.
 * 시/군 단위 확대 지도 도입 이후, 절대 km가 아니라 그 라운드 지도가 실제로
 * 보여주는 반경(`spanKm`의 절반) 대비 비율로 채점한다. 남동구처럼 작은 구는
 * 지도 폭 자체가 14km밖에 안 돼서 "5km 차이"가 화면상으로는 지도 절반 가까이
 * 벗어난 것과 같은데, 절대 km 기준(예: 10km 이하 100점)으로는 그런 큰 화면상
 * 오차도 만점 근처로 나와 체감과 어긋났다. `spanKm`를 넘기지 않으면 예전처럼
 * 전국 지도 스케일(KOREA_BOUNDS)을 기본값으로 써서 동작은 그대로 유지된다.
 */
export function scoreForDistanceKm(km: number, spanKm: number = spanKmOfBounds(KOREA_BOUNDS)): number {
  const radiusKm = spanKm / 2;
  const ratio = radiusKm > 0 ? km / radiusKm : 1;
  if (ratio <= 0.2) return 100;
  if (ratio <= 0.45) return 70;
  if (ratio <= 0.8) return 40;
  return 10;
}

/** null은 제한시간 내 확정된 위치가 없음을 의미하며 현행 정책상 0점이다. */
export function scoreForLocationAttempt(km: number | null, spanKm: number): number {
  return km === null ? 0 : scoreForDistanceKm(km, spanKm);
}
