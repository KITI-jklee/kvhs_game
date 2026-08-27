/**
 * 정적 JSON을 1회만 받아 모듈 스코프에 캐시하는 공용 헬퍼
 * (`dongOutline.ts`/`provinceOutline.ts`/`nearestHospital.ts`의 지도 배경
 * 로더 3곳이 동일한 캐시+inflight promise 로직을 복붙해 갖고 있던 것을 정리).
 *
 * `force-cache`는 쓰지 않는다 - 이 파일들은 빌드 스크립트를 다시 돌리면
 * 내용이 바뀌는데, force-cache는 서버 재검증 없이 브라우저 캐시를 무조건
 * 써서 데이터를 고쳐도 옛 내용이 계속 뜨는 문제가 있었다(사용자 피드백:
 * "아직도 이렇게 안뜨는데?"). 기본 캐시 정책(필요시 서버에 재검증)이면
 * 이 문제가 없다.
 *
 * fetch 실패 시에는 실패한 promise를 캐시에 남겨두지 않는다 - 다음 호출이
 * 다시 fetch를 시도할 수 있어야 일시적 네트워크 오류에서도 재시도가 된다.
 */
export function createCachedFetcher<T>(url: string): () => Promise<T> {
  let cache: T | null = null;
  let inflight: Promise<T> | null = null;

  return function load(): Promise<T> {
    if (cache) return Promise.resolve(cache);
    if (!inflight) {
      inflight = fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`${url} fetch failed: ${res.status}`);
          return res.json() as Promise<T>;
        })
        .then((data) => {
          cache = data;
          return data;
        })
        .catch((err) => {
          inflight = null;
          throw err;
        });
    }
    return inflight;
  };
}
