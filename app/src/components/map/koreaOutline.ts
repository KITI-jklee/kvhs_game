import type { LatLng } from '../../lib/geo';

/**
 * Simplified South Korea coastline, expressed as real lat/lng vertices (not
 * hand-tuned pixels). `KoreaMap.tsx` runs every point through the same
 * `project()` used for scoring, so the drawn coastline and the haversine
 * math it supports always agree - accuracy here is "recognisable simplified
 * silhouette", not survey-grade cartography (NFR-03: no map SDK).
 */

const toLatLng = (pairs: [number, number][]): LatLng[] => pairs.map(([lat, lng]) => ({ lat, lng }));

export const MAINLAND_OUTLINE: LatLng[] = toLatLng([
  [37.75, 126.35], // 강화도
  [37.58, 126.5],
  [37.4, 126.55],
  [37.2, 126.55],
  [37.0, 126.45], // 남양만
  [36.85, 126.3],
  [36.75, 126.15], // 태안반도
  [36.6, 126.3],
  [36.33, 126.5], // 보령
  [36.0, 126.65], // 군산
  [35.75, 126.55],
  [35.62, 126.5], // 변산반도
  [35.4, 126.35],
  [35.1, 126.35], // 무안만
  [34.9, 126.3],
  [34.79, 126.39], // 목포
  [34.6, 126.55], // 해남
  [34.45, 126.75],
  [34.31, 126.75], // 완도
  [34.5, 127.0],
  [34.53, 127.28], // 고흥반도
  [34.7, 127.2],
  [34.74, 127.66], // 여수
  [34.85, 127.75],
  [34.75, 127.9], // 남해
  [34.9, 128.1],
  [34.83, 128.4], // 거제
  [35.0, 128.6],
  [35.1, 129.03], // 부산
  [35.3, 129.2],
  [35.54, 129.36], // 울산
  [35.85, 129.45],
  [36.02, 129.37], // 포항
  [36.3, 129.4],
  [36.53, 129.42],
  [36.99, 129.4], // 울진
  [37.3, 129.3],
  [37.45, 129.17],
  [37.75, 128.9], // 강릉
  [38.05, 128.65],
  [38.21, 128.59], // 속초
  [38.38, 128.47], // 고성
  [38.3, 127.9],
  [38.28, 127.5],
  [38.15, 127.1], // 철원
  [38.05, 126.8],
  [37.9, 126.68], // 임진강 하구
  [37.8, 126.5],
]);

export const JEJU_OUTLINE: LatLng[] = toLatLng([
  [33.55, 126.3],
  [33.53, 126.15],
  [33.3, 126.16],
  [33.17, 126.25],
  [33.24, 126.56],
  [33.2, 126.8],
  [33.3, 126.9],
  [33.5, 126.88],
  [33.55, 126.7],
  [33.52, 126.53],
]);

export const ULLEUNGDO: LatLng = { lat: 37.48, lng: 130.9 };
