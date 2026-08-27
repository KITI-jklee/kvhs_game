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
   * 보여줄 때 쓴다(사용자 피드백: 병원 이름·거리만으론 왜 먼 지역 병원이
   * 후보로 나왔는지 알기 어려움). 테스트 픽스처에서는 생략 가능하도록
   * 선택 필드로 둔다. */
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

/**
 * 시작 지점에서 실제로 가장 가까운 병원(1등=정답) + 다음으로 가까운 후보들
 * 중 무작위로 오답 2개를 뽑는다(순수 함수 - 테스트하기 쉽게 병원 목록을
 * 인자로 받는다).
 *
 * 오답 조건, 우선순위 순서대로:
 * - `preferredGapMin`/`preferredGapMax`: 가장 좋은 오답은 정답 거리의
 *   1.15~1.8배 사이 - 너무 가까우면 판단 불가능한 문제가 되고(사용자
 *   피드백: 정답 3.6km/오답 4.1km는 지도로 구분 불가), 너무 멀면 "딱 봐도
 *   아니네"로 한눈에 배제되어 결국 화면상 거리만 재는 게임이 된다
 *   (사용자 피드백). 이 범위 안 후보만으로는 "가까운 편이지만 헷갈리는"
 *   문제가 만들어진다.
 * - `minSeparationKm`: 오답끼리도, 정답과도 너무 가까우면(거의 같은 위치) 지도
 *   위에서 핀/라벨이 서로 겹쳐 두 후보가 하나처럼 보이는 문제가 생긴다
 *   (사용자 피드백) - 이 조건은 거리 띠(band) 조건보다 먼저 지킨다. 거리
 *   띠를 넓혀서라도 안 겹치는 후보를 찾는 게, 띠는 지키되 겹치는 것보다
 *   낫기 때문.
 * 그래도(아주 밀집되었거나 반대로 아주 희소한 지역) 후보가 모자라면, 겹침
 * 허용까지 포함해 단계적으로 완화해서 채운다 - 오답을 못 채우는 것보다는 나음.
 */
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
  // 1.15~1.8배 범위에 후보가 모자라면(정답이 아주 가깝거나 병원이 희소한
  // 지역) 최소 1.15배 이상이기만 하면 되도록 상한을 풀어서 채운다 - 단,
  // 여기서부터는 무작위로 섞지 않고 거리순으로 가까운 것부터 채운다.
  // 제주도처럼 섬이라 가까운 후보가 몇 개뿐인 지역에서, 상한 없는 풀을
  // 무작위로 뽑으면 5km대의 제주 병원 대신 바다 건너 100km+ 밖 육지 병원이
  // 뽑히는(운 나쁘면) 문제가 있었다(사용자 피드백: "왜 한개만 떠?") - 거리순
  // 정렬로 "상한만 풀고, 그래도 가까운 것부터"를 보장한다.
  const widenedPool = searchPool.filter((c) => c.km >= preferredMinKm).sort((a, b) => a.km - b.km);
  const fallbackPool = [...searchPool].sort((a, b) => a.km - b.km);

  const chosen: NearestChoice[] = [correct];
  const tryFill = (pool: NearestChoice[], respectSeparation: boolean) => {
    for (const candidate of pool) {
      if (chosen.length - 1 >= decoyCount) break;
      if (chosen.some((c) => c.id === candidate.id)) continue;
      const tooClose = respectSeparation && chosen.some((c) => haversineKm(c.center, candidate.center) < minSeparationKm);
      if (!tooClose) chosen.push(candidate);
    }
  };
  // 겹침 방지(minSeparationKm)를 거리 띠보다 먼저 - 띠를 단계적으로 넓혀가며
  // 겹치지 않는 후보부터 찾고, 그래도 모자랄 때만 겹침을 허용한다.
  tryFill(preferredPool, true);
  tryFill(widenedPool, true);
  tryFill(fallbackPool, true);
  tryFill(preferredPool, false);
  tryFill(widenedPool, false);
  tryFill(fallbackPool, false);

  const ranked = chosen.sort((a, b) => a.km - b.km);
  return { ranked, shuffled: shuffle(ranked) };
}

/** `ranked`에서 고른 병원의 순위(0=1등)를 찾아 그 등수의 점수를 돌려준다. */
export function pointsForPick(ranked: NearestChoice[], pickedId: string | null): number {
  const index = ranked.findIndex((c) => c.id === pickedId);
  if (index < 0 || index >= RANK_POINTS.length) return 0;
  return RANK_POINTS[index];
}
