/**
 * Geo helpers for 게임① 보훈병원 위치감각게임.
 *
 * "시작 지점에서 가장 가까운 위탁병원 찾기" 게임(lib/nearestHospital.ts)을
 * 위한 것들이다 - `haversineKm`으로 실제 최단거리 병원/오답 후보를 고르고,
 * `createProjection`/`boundsForBoxes`/`bboxOfPoints`로 시작 지점 + 병원
 * 후보들이 다 보이는 지도 투영 범위를 만든다.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Point {
  x: number;
  y: number;
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
  /** 1km가 화면에서 몇 px인지 - 흐릿한 반경 원처럼 실제 km 단위 크기를 그릴 때 쓴다. */
  pixelsPerKm: number;
  project(p: LatLng): Point;
  unproject(p: Point): LatLng;
}

/**
 * 임의의 `bounds`에 대한 등장방형 투영을 만든다. 위경도 비율에 맞춰 폭을
 * 계산해 모양이 찌그러지지 않는다(즉 x/y 스케일이 같아서 `pixelsPerKm`도
 * 방향에 관계없이 하나의 값으로 쓸 수 있다).
 */
export function createProjection(bounds: Bounds, viewHeight = 520): Projection {
  const meanLatRad = (((bounds.latMin + bounds.latMax) / 2) * Math.PI) / 180;
  const latSpanKm = (bounds.latMax - bounds.latMin) * 111.32;
  const lonSpanKm = (bounds.lonMax - bounds.lonMin) * 111.32 * Math.cos(meanLatRad);
  const width = Math.max(1, Math.round(viewHeight * (lonSpanKm / latSpanKm)));
  const height = viewHeight;
  const pixelsPerKm = height / latSpanKm;
  return {
    width,
    height,
    pixelsPerKm,
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

export interface RegionBbox {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

/** 후보 도시 여러 곳의 bbox를 하나로 합쳐, 전부 다 보이는 지도 투영 범위를 만든다. */
export function boundsForBoxes(boxes: RegionBbox[], paddingRatio = 0.25): Bounds {
  const lonMin = Math.min(...boxes.map((b) => b.lonMin));
  const lonMax = Math.max(...boxes.map((b) => b.lonMax));
  const latMin = Math.min(...boxes.map((b) => b.latMin));
  const latMax = Math.max(...boxes.map((b) => b.latMax));
  const lonPad = (lonMax - lonMin) * paddingRatio || 0.05;
  const latPad = (latMax - latMin) * paddingRatio || 0.05;
  return {
    lonMin: lonMin - lonPad,
    lonMax: lonMax + lonPad,
    latMin: latMin - latPad,
    latMax: latMax + latPad,
  };
}

/** 점(위경도) 여러 개를 감싸는 bbox - 시작 지점과 병원 후보들이 다 들어가는 범위를 잡을 때 쓴다. */
export function bboxOfPoints(points: LatLng[]): RegionBbox {
  return {
    lonMin: Math.min(...points.map((p) => p.lng)),
    lonMax: Math.max(...points.map((p) => p.lng)),
    latMin: Math.min(...points.map((p) => p.lat)),
    latMax: Math.max(...points.map((p) => p.lat)),
  };
}

/**
 * 점들 주위로 "딱 맞게" 확대한 투영 범위를 만든다 - 배경으로 그리는 도(道)
 * 전체가 아니라 실제 후보 위치들 기준으로 줌을 잡는다. 병원 후보가 좁은
 * 지역에 몰려 있을 때도(예: 같은 구 안 여러 병원) 지도가 도 전체 크기로
 * 벌어져서 핀 라벨이 서로 겹치는 문제를 막는다 - `minSpanKm`로 최소 확대
 * 범위를 보장해, 점들이 아주 가까워도 라벨 놓을 여유는 남긴다.
 */
export function boundsForPoints(points: LatLng[], { minSpanKm = 8, paddingRatio = 0.35 } = {}): Bounds {
  const box = bboxOfPoints(points);
  const meanLatRad = (((box.latMin + box.latMax) / 2) * Math.PI) / 180;
  const wKm = (box.lonMax - box.lonMin) * 111.32 * Math.cos(meanLatRad);
  const hKm = (box.latMax - box.latMin) * 111.32;
  const halfWKm = Math.max(minSpanKm / 2, (wKm * (1 + paddingRatio)) / 2);
  const halfHKm = Math.max(minSpanKm / 2, (hKm * (1 + paddingRatio)) / 2);
  const centerLat = (box.latMin + box.latMax) / 2;
  const centerLng = (box.lonMin + box.lonMax) / 2;
  const dLat = halfHKm / 111.32;
  const dLng = halfWKm / (111.32 * Math.cos(meanLatRad));
  return {
    latMin: centerLat - dLat,
    latMax: centerLat + dLat,
    lonMin: centerLng - dLng,
    lonMax: centerLng + dLng,
  };
}

/**
 * `bounds`를 목표 가로/세로 비율(`aspectRatio` = 폭/높이)에 맞게, 중심은
 * 그대로 두고 짧은 쪽만 넓혀서 맞춘다. 지도를 실제로 보여주는 컨테이너의
 * 화면 비율에 맞춰 이걸 먼저 적용해두면, SVG viewBox 비율이 컨테이너 비율과
 * 정확히 같아져서 letterbox(빈 여백)도, 강제 늘림(원이 타원으로 찌그러짐)도
 * 둘 다 없이 지도를 꽉 채울 수 있다.
 */
export function fitBoundsToAspect(bounds: Bounds, aspectRatio: number): Bounds {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return bounds;
  const meanLatRad = (((bounds.latMin + bounds.latMax) / 2) * Math.PI) / 180;
  const latSpanKm = (bounds.latMax - bounds.latMin) * 111.32;
  const lonSpanKm = (bounds.lonMax - bounds.lonMin) * 111.32 * Math.cos(meanLatRad);
  const currentRatio = lonSpanKm / latSpanKm;
  const centerLat = (bounds.latMin + bounds.latMax) / 2;
  const centerLng = (bounds.lonMin + bounds.lonMax) / 2;
  if (currentRatio < aspectRatio) {
    // 가로가 더 넓어져야 한다 - lon 범위를 넓힌다.
    const targetLonSpanKm = latSpanKm * aspectRatio;
    const dLng = targetLonSpanKm / 2 / (111.32 * Math.cos(meanLatRad));
    return { ...bounds, lonMin: centerLng - dLng, lonMax: centerLng + dLng };
  }
  // 세로가 더 넓어져야 한다 - lat 범위를 넓힌다.
  const targetLatSpanKm = lonSpanKm / aspectRatio;
  const dLat = targetLatSpanKm / 2 / 111.32;
  return { ...bounds, latMin: centerLat - dLat, latMax: centerLat + dLat };
}

/** Great-circle distance in km - 오답 후보를 실제 거리 기준으로 추릴 때 쓴다. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
