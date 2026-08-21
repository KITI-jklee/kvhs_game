import type { RegionBbox } from './geo';

export interface ProvinceOutline {
  bbox: RegionBbox;
  rings: [number, number][][];
}

let cache: Record<string, ProvinceOutline> | null = null;
let inflight: Promise<Record<string, ProvinceOutline>> | null = null;

/**
 * 도(道) 단위 배경 지도 - 17개뿐이라 시/군 경계처럼 라운드마다 지연 로드하지
 * 않고 한 번에 받아 캐시한다(`scripts/build-province-outlines.cjs` 산출물).
 * "가장 가까운 위탁병원 찾기"는 후보가 시작 지점의 시/군 밖에 있는 경우가
 * 흔해서, 시/군 경계 대신 도 전체를 배경으로 그린다.
 */
export function loadProvinceOutlines(): Promise<Record<string, ProvinceOutline>> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    // `force-cache`는 쓰지 않는다 - 이 파일은 빌드 스크립트를 다시 돌리면
    // 내용이 바뀌는데, force-cache는 서버에 재검증도 안 하고 브라우저
    // 캐시를 무조건 써서 데이터를 고쳐도 옛 내용이 계속 뜨는 문제가 있었다
    // (사용자 피드백: "아직도 이렇게 안뜨는데?").
    inflight = fetch('/data/province_outlines.json')
      .then((res) => {
        if (!res.ok) throw new Error(`province outlines fetch failed: ${res.status}`);
        return res.json() as Promise<Record<string, ProvinceOutline>>;
      })
      .then((data) => {
        cache = data;
        return data;
      });
  }
  return inflight;
}
