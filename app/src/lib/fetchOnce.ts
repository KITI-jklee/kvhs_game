/**
 * 정적 JSON을 모듈 스코프에 캐시한다. 갱신 파일의 재검증을 막는
 * `force-cache`는 쓰지 않고, 실패한 요청은 비워 다음 호출에서 재시도한다.
 */
export function createCachedFetcher<T>(url: string): () => Promise<T> {
  // "아직 캐싱 안 됨"의 sentinel로 cache 자체의 초기값(null)을 재활용하면,
  // 정상 응답이 진짜 null일 때 그 응답과 구분이 안 된다 - cache !== null로
  // 비교해도 이 경우엔 여전히 truthy 검사와 똑같이 매번 재요청한다(코드리뷰로
  // 발견 - 이전 수정이 실제로는 이 케이스를 못 고쳤음). "캐싱됐는지" 자체를
  // 별도 플래그로 들고 다녀야 값이 무엇이든(null 포함) 정확히 구분된다.
  let cache: T | null = null;
  let hasCache = false;
  let inflight: Promise<T> | null = null;

  return function load(): Promise<T> {
    if (hasCache) return Promise.resolve(cache as T);
    if (!inflight) {
      inflight = fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`${url} fetch failed: ${res.status}`);
          return res.json() as Promise<T>;
        })
        .then((data) => {
          cache = data;
          hasCache = true;
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
