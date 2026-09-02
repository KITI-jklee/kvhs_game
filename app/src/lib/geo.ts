/** 위치 게임의 거리·지도 투영 도우미. */

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

/** x/y 축척이 같은 등장방형 투영을 만든다. */
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

/** 모든 점을 감싸는 bbox를 만든다. */
export function bboxOfPoints(points: LatLng[]): RegionBbox {
  return {
    lonMin: Math.min(...points.map((p) => p.lng)),
    lonMax: Math.max(...points.map((p) => p.lng)),
    latMin: Math.min(...points.map((p) => p.lat)),
    latMax: Math.max(...points.map((p) => p.lat)),
  };
}

/** 점들을 감싸되 `minSpanKm`만큼의 라벨 여유를 보장한다. */
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

/** 중심을 유지하며 짧은 축을 늘려 목표 화면비에 맞춘다. */
export function fitBoundsToAspect(bounds: Bounds, aspectRatio: number): Bounds {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return bounds;
  const meanLatRad = (((bounds.latMin + bounds.latMax) / 2) * Math.PI) / 180;
  const latSpanKm = (bounds.latMax - bounds.latMin) * 111.32;
  const lonSpanKm = (bounds.lonMax - bounds.lonMin) * 111.32 * Math.cos(meanLatRad);
  const currentRatio = lonSpanKm / latSpanKm;
  const centerLat = (bounds.latMin + bounds.latMax) / 2;
  const centerLng = (bounds.lonMin + bounds.lonMax) / 2;
  if (currentRatio < aspectRatio) {
    const targetLonSpanKm = latSpanKm * aspectRatio;
    const dLng = targetLonSpanKm / 2 / (111.32 * Math.cos(meanLatRad));
    return { ...bounds, lonMin: centerLng - dLng, lonMax: centerLng + dLng };
  }
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

// ray casting - dongOutline.ts의 findDongName도 이 함수를 그대로 가져다 쓴다
// (동/시군 경계 안/밖 판정 로직을 여기 한 곳에만 둔다 - build-dong-outlines.cjs
// 스크립트는 빌드타임 전용이라 여전히 별도 복사본을 갖고 있다).
export function pointInRing(px: number, py: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi === yj) continue;
    if (py < Math.min(yi, yj) || py >= Math.max(yi, yj)) continue;
    const xIntersect = xi + ((py - yi) / (yj - yi)) * (xj - xi);
    if (px < xIntersect) inside = !inside;
  }
  return inside;
}

/** 점 p에서 선분 a-b까지의 최소거리(km) - 위경도를 로컬 등장방형 평면(kx/ky)으로
 * 근사 투영해 계산한다. 동/시군 단위의 작은 영역에서는 이 근사가 충분히 정확하다. */
function pointToSegmentKm(p: LatLng, a: LatLng, b: LatLng, kx: number, ky: number): number {
  const ax = a.lng * kx;
  const ay = a.lat * ky;
  const bx = b.lng * kx;
  const by = b.lat * ky;
  const px = p.lng * kx;
  const py = p.lat * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** 병원이 다각형(읍/면/동 경계) 안에 있으면 0, 밖이면 가장 가까운 경계선까지의
 * 최소거리(km) - "보훈 대상자가 OO동 인근에 있습니다"는 사람이 그 동 전체
 * 어딘가에 있을 수 있다는 뜻이라, 중심점 한 점까지의 거리보다 이 방식이 실제
 * 설정과 더 잘 맞는다(중심점 기준으로는 동이 길쭉하거나 찌그러진 모양일 때
 * "중심에서 더 가까운 병원"이 "경계에서 가장 먼저 만나는 병원"과 달라지는
 * 경우가 잦았다 - 시뮬레이션으로 전국 동의 15.5%에서 정답이 바뀌는 걸 확인). */
export function distanceToRegionKm(rings: [number, number][][], point: LatLng, regionCenter: LatLng): number {
  const inside = rings.some((ring) => pointInRing(point.lng, point.lat, ring));
  if (inside) return 0;
  const kx = 111.32 * Math.cos((regionCenter.lat * Math.PI) / 180);
  const ky = 111.32;
  let minKm = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[(i + 1) % ring.length];
      const d = pointToSegmentKm(point, { lng: ax, lat: ay }, { lng: bx, lat: by }, kx, ky);
      if (d < minKm) minKm = d;
    }
  }
  return minKm;
}
