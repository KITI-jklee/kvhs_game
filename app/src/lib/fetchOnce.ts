/**
 * 정적 JSON을 모듈 스코프에 캐시한다. 갱신 파일의 재검증을 막는
 * `force-cache`는 쓰지 않고, 실패한 요청은 비워 다음 호출에서 재시도한다.
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
