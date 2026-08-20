import type { CityOutline } from '../data/types';

/**
 * 병원 `addr_hint`(예: "경기도 고양시")에 대한 시/군/구 경계 윤곽선을 필요할 때만
 * 가져온다. 전국 230개 지역을 한 번에 로드하지 않고 라운드마다 하나씩만
 * 받으므로, 세션당 최대 5회(ROUND_COUNT) 요청이 전부다. 같은 지역이 다시
 * 나오면 캐시에서 즉시 반환한다. 매칭이 없는 지역(데이터 갱신 등)이면 null을
 * 반환해 호출부가 전국 지도로 자연스럽게 대체할 수 있게 한다.
 */
const cache = new Map<string, CityOutline | null>();

export async function loadCityOutline(addrHint: string): Promise<CityOutline | null> {
  if (cache.has(addrHint)) return cache.get(addrHint) ?? null;
  try {
    const res = await fetch(`/data/city_outlines/${encodeURIComponent(addrHint)}.json`, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`city outline fetch failed: ${res.status}`);
    const data = (await res.json()) as CityOutline;
    cache.set(addrHint, data);
    return data;
  } catch {
    cache.set(addrHint, null);
    return null;
  }
}
