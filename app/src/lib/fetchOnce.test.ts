import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCachedFetcher } from './fetchOnce';

function mockFetchOnce(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  });
}

afterEach(() => vi.restoreAllMocks());

describe('createCachedFetcher', () => {
  it('정상 응답을 캐싱해 두 번째 호출부터는 fetch를 다시 안 부른다', async () => {
    const fetchMock = mockFetchOnce({ a: 1 });
    vi.stubGlobal('fetch', fetchMock);
    const load = createCachedFetcher('/data/x.json');

    await expect(load()).resolves.toEqual({ a: 1 });
    await expect(load()).resolves.toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // 코드리뷰로 발견: cache의 "아직 안 받음" sentinel로 null을 그대로 쓰면,
  // 서버가 진짜 null을 내려준 정상 응답도 "아직 캐싱 안 됨"과 구분이 안 돼
  // 매번 재요청한다. hasCache 플래그로 분리한 뒤에도 이 케이스가 실제로
  // 고쳐졌는지 회귀 테스트로 고정해 둔다.
  it('응답이 null이어도 캐싱되어 두 번째 호출부터는 fetch를 다시 안 부른다', async () => {
    const fetchMock = mockFetchOnce(null);
    vi.stubGlobal('fetch', fetchMock);
    const load = createCachedFetcher<null>('/data/y.json');

    await expect(load()).resolves.toBeNull();
    await expect(load()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('실패한 요청은 캐싱하지 않고 다음 호출에서 재시도한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve(null) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ a: 1 }) });
    vi.stubGlobal('fetch', fetchMock);
    const load = createCachedFetcher('/data/z.json');

    await expect(load()).rejects.toThrow();
    await expect(load()).resolves.toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
