import type { LatLng } from './geo';
import { createCachedFetcher } from './fetchOnce';

export interface DongOutline {
  name: string;
  center: LatLng;
  rings: [number, number][][];
}

/** 시/군별 읍/면/동 경계를 한 번에 로드해 캐시한다. */
export const loadDongOutlines = createCachedFetcher<Record<string, DongOutline[]>>('/data/dong_outlines.json');

// ray casting - `scripts/build-dong-outlines.cjs`에서 쓴 것과 같은 알고리즘.
function pointInRing(px: number, py: number, ring: [number, number][]): boolean {
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

/** 좌표를 포함하는 동 이름을 찾는다. */
export function findDongName(dongList: DongOutline[], point: LatLng): string | null {
  for (const dong of dongList) {
    if (dong.rings.some((ring) => pointInRing(point.lng, point.lat, ring))) return dong.name;
  }
  return null;
}
