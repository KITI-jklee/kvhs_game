import type { LatLng } from './geo';
import { haversineKm } from './geo';
import { shuffle } from './array';
import { createCachedFetcher } from './fetchOnce';

export interface RegionsIndex {
  /** 도(道) 이름 -> 그 도에 속한 시/군/구 addr_hint 목록. */
  provinces: Record<string, string[]>;
  /** addr_hint -> 그 시/군/구 경계 bbox의 중심점(대략적 위치). "보훈 대상자"의 시작 위치로 쓴다. */
  centers: Record<string, LatLng>;
}

/** `_regions.json`(시/군/구 목록 + 중심점)을 1회만 받아 캐시한다. */
export const loadRegionsIndex = createCachedFetcher<RegionsIndex>('/data/city_outlines/_regions.json');

export interface HospitalPoint {
  id: string;
  name: string;
  center: LatLng;
  /** addr_hint의 도(道) 이름 - 배경 지도에 어느 도를 그려야 할지 정할 때 쓴다. */
  province: string;
  /** addr_hint 전체("도 시/군/구") - 정답/오답 병원이 실제로 어디 소속인지
   * 보여줄 때 쓴다. 테스트 픽스처에서는 생략 가능하도록 선택 필드로 둔다. */
  addr?: string;
}

export interface NearestChoice extends HospitalPoint {
  km: number;
}

/** 실제 거리 순위별 점수 - 1등(가장 가까움)이 [0], 순위가 밀릴수록 점수가 줄어든다. */
export const RANK_POINTS = [100, 60, 30, 10, 0] as const;

export interface NearestRound {
  /** 실제 거리순으로 정렬된 순서(1등이 [0]) - 순위 채점에 쓴다. */
  ranked: NearestChoice[];
  /** 화면에 보여줄 순서(무작위로 섞임). */
  shuffled: NearestChoice[];
}

/** 거리 비율과 핀 간격을 우선하고, 후보가 부족하면 조건을 단계적으로 완화한다. */
export function selectNearestChoices(
  hospitals: HospitalPoint[],
  origin: LatLng,
  decoyCount = 2,
  searchPoolSize = 30,
  minSeparationKm = 1.2,
  preferredGapMin = 1.15,
  preferredGapMax = 1.8,
): NearestRound {
  const distanced = hospitals
    .map((h) => ({ ...h, km: haversineKm(origin, h.center) }))
    .sort((a, b) => a.km - b.km);
  const correct = distanced[0];
  const searchPool = distanced.slice(1, 1 + searchPoolSize);

  const preferredMinKm = correct.km * preferredGapMin;
  const preferredMaxKm = correct.km * preferredGapMax;
  const preferredPool = shuffle(searchPool.filter((c) => c.km >= preferredMinKm && c.km <= preferredMaxKm));
  // 상한 완화 시에도 지나치게 먼 후보를 피하려고 거리순으로 채운다.
  const widenedPool = searchPool.filter((c) => c.km >= preferredMinKm).sort((a, b) => a.km - b.km);
  const fallbackPool = [...searchPool].sort((a, b) => a.km - b.km);

  // 지도 규모에 비례한 반경으로 핀 3개 이상이 몰리는 것을 막는다.
  const clusterRadiusKm = Math.max(correct.km * preferredGapMax * 0.18, 2);

  const chosen: NearestChoice[] = [correct];
  const tryFill = (pool: NearestChoice[], respectSeparation: boolean, respectCluster: boolean) => {
    for (const candidate of pool) {
      if (chosen.length - 1 >= decoyCount) break;
      if (chosen.some((c) => c.id === candidate.id)) continue;
      const tooClose = respectSeparation && chosen.some((c) => haversineKm(c.center, candidate.center) < minSeparationKm);
      // 후보 추가 후 전체 집합에서 3개 이상 뭉치는지 검사한다.
      const tentative = respectCluster ? [...chosen, candidate] : null;
      const wouldCluster =
        respectCluster &&
        tentative!.some(
          (p) => tentative!.filter((q) => q !== p && haversineKm(p.center, q.center) < clusterRadiusKm).length >= 2,
        );
      if (!tooClose && !wouldCluster) chosen.push(candidate);
    }
  };
  // 거리와 간격 조건을 단계적으로 완화해 후보 수를 채운다.
  tryFill(preferredPool, true, true);
  tryFill(widenedPool, true, true);
  tryFill(fallbackPool, true, true);
  tryFill(preferredPool, false, true);
  tryFill(widenedPool, false, true);
  tryFill(fallbackPool, false, true);
  tryFill(preferredPool, false, false);
  tryFill(widenedPool, false, false);
  tryFill(fallbackPool, false, false);

  const ranked = chosen.sort((a, b) => a.km - b.km);
  return { ranked, shuffled: shuffle(ranked) };
}

/** 1등과의 차이가 10% 또는 300m 이내면 동률로 인정한다. */
export function isTiedWithNearest(ranked: NearestChoice[], pickedId: string | null): boolean {
  if (!ranked.length || !pickedId) return false;
  const correct = ranked[0];
  if (pickedId === correct.id) return true;
  const picked = ranked.find((c) => c.id === pickedId);
  if (!picked) return false;
  const tolerance = Math.max(correct.km * 0.1, 0.3);
  return picked.km - correct.km <= tolerance;
}

/** 선택한 병원의 순위 점수를 반환하며, 동률은 1등으로 처리한다. */
export function pointsForPick(ranked: NearestChoice[], pickedId: string | null): number {
  if (isTiedWithNearest(ranked, pickedId)) return RANK_POINTS[0];
  const index = ranked.findIndex((c) => c.id === pickedId);
  if (index < 0 || index >= RANK_POINTS.length) return 0;
  return RANK_POINTS[index];
}
