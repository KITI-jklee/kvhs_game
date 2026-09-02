import type { LatLng } from './geo';
import { pointInRing } from './geo';
import { createCachedFetcher } from './fetchOnce';

export interface DongOutline {
  name: string;
  center: LatLng;
  rings: [number, number][][];
}

/** 시/군별 읍/면/동 경계를 한 번에 로드해 캐시한다. */
export const loadDongOutlines = createCachedFetcher<Record<string, DongOutline[]>>('/data/dong_outlines.json');

/** 좌표를 포함하는 동 이름을 찾는다. */
export function findDongName(dongList: DongOutline[], point: LatLng): string | null {
  for (const dong of dongList) {
    if (dong.rings.some((ring) => pointInRing(point.lng, point.lat, ring))) return dong.name;
  }
  return null;
}
