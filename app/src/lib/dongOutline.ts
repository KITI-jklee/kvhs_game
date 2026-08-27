import type { LatLng } from './geo';
import { createCachedFetcher } from './fetchOnce';

export interface DongOutline {
  name: string;
  center: LatLng;
  rings: [number, number][][];
}

/**
 * addr_hint(시/군/구) -> 그 안에 속한 읍/면/동 목록(`scripts/build-dong-outlines.cjs`
 * 산출물). 시/군 전체를 옅게 채우면 병원 후보가 다 그 안에 들어와 "판단
 * 근거가 없다"는 사용자 피드백에 따라, 라운드마다 시/군이 아니라 그 안의
 * 동 하나만 옅게 강조해서 "보훈 대상자"의 대략적인 위치를 더 구체적으로
 * (그리고 실제 지명으로) 보여준다.
 *
 * 전국 읍/면/동(3500여 개)을 한 파일에 담아 900KB(gzip)쯛 되지만, 도(道)
 * 배경처럼 라운드마다 다른 시/군이 뽑힐 수 있어 지연 로드보다는 게임
 * 시작 시 1회 받아 캐시하는 쪽이 더 간단하다.
 */
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

/** 그 시/군 안의 동 목록에서, 좌표가 실제로 어느 동 경계 안에 들어가는지
 * 찾는다(역지오코딩) - 병원 주소를 "OO시"까지가 아니라 "OO시 OO동"까지
 * 보여달라는 요청(사용자 피드백)에 쓴다. 못 찾으면(경계 위 오차 등) null. */
export function findDongName(dongList: DongOutline[], point: LatLng): string | null {
  for (const dong of dongList) {
    if (dong.rings.some((ring) => pointInRing(point.lng, point.lat, ring))) return dong.name;
  }
  return null;
}
