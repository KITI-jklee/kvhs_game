import type { RegionBbox } from './geo';
import { createCachedFetcher } from './fetchOnce';

export interface ProvinceOutline {
  bbox: RegionBbox;
  rings: [number, number][][];
}

/**
 * 도(道) 단위 배경 지도 - 17개뿐이라 시/군 경계처럼 라운드마다 지연 로드하지
 * 않고 한 번에 받아 캐시한다(`scripts/build-province-outlines.cjs` 산출물).
 * "가장 가까운 위탁병원 찾기"는 후보가 시작 지점의 시/군 밖에 있는 경우가
 * 흔해서, 시/군 경계 대신 도 전체를 배경으로 그린다.
 */
export const loadProvinceOutlines = createCachedFetcher<Record<string, ProvinceOutline>>('/data/province_outlines.json');
