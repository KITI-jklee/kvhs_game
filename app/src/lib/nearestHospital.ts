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
  /** 공식 도서·벽지 지정 위탁병원 여부. 테스트 픽스처에서는 생략 가능. */
  isRemoteArea?: boolean;
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

  // 핀 3개 이상이 몰리는 것을 막는다.
  // 주의: 이건 실제 위경도(km) 기준 뭉침 방지이고, 화면 px 기준 뭉침/겹침 방지는
  // components/map/KoreaMap.tsx의 nudgedPositions(핀)·labelPlacement(라벨)가 별도로
  // 담당한다. 두 로직은 서로 참조하지 않는 독립된 안전장치이니, 한쪽을 단순화하거나
  // 제거할 때는 반드시 다른 쪽이 같은 문제를 커버하는지 KoreaMap.tsx도 같이 확인할 것.
  //
  // 반경을 라운드 시작 전에 미리 고정값으로 계산해두면(예: correct.km나 검색 풀의
  // decoyCount번째 거리 기준) 문제가 생긴다 - 실제 지도가 얼마나 확대/축소될지는
  // "이번에 실제로 뽑힌 후보들이 서로 얼마나 떨어져 있는지"에 달려 있는데, 그중
  // 하나라도 훨씬 먼 후보(예: 22km짜리 외딴 후보)가 섞이면 지도가 그만큼 축소되면서
  // 나머지 가까운 후보들끼리는 "고정 반경" 기준으로는 안 뭉쳐 보여도 실제 화면에서는
  // 잔뜩 눌려 붙어 보인다(전라남도 여수시 소라면 실사례로 확인: 가까운 4곳이 서로
  // 1.7~6.4km 안에 모여 있는데 정답 대비 3배 가까운 22km짜리 외딴 후보 하나 때문에
  // 지도가 그 거리까지 다 보여주려고 축소돼, 그 4곳이 화면에서 거의 붙어 보였다).
  // 그래서 후보를 추가해볼 때마다(tentative 집합 자체의) 가장 먼 두 점 사이 거리를
  // "이번 라운드가 실제로 그려질 지도 규모"의 대리값으로 삼아 반경을 매번 다시
  // 계산한다 - 외딴 후보를 넣어보는 순간 스팬이 확 커지면 반경도 같이 커져서, 이미
  // 뽑아둔 가까운 후보들이 그 새 스케일 기준으로는 서로 너무 가깝다는 게 드러나
  // 자연히 그 외딴 후보 자체가 걸러진다(별도의 "선호 거리비율" 단계도 예외 없이
  // 똑같이 적용한다 - 간격비만 맞고 서로 가까운 후보 2개보다는, 뭉치지 않는 후보
  // 조합을 우선한다).
  const spanKmOf = (points: NearestChoice[]) => {
    let max = 0;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = haversineKm(points[i].center, points[j].center);
        if (d > max) max = d;
      }
    }
    return max;
  };
  const CLUSTER_RADIUS_FRACTION = 0.15;
  const CLUSTER_RADIUS_FLOOR_KM = 2;

  const chosen: NearestChoice[] = [correct];
  const tryFill = (pool: NearestChoice[], respectSeparation: boolean, respectCluster: boolean) => {
    for (const candidate of pool) {
      if (chosen.length - 1 >= decoyCount) break;
      if (chosen.some((c) => c.id === candidate.id)) continue;
      const tooClose = respectSeparation && chosen.some((c) => haversineKm(c.center, candidate.center) < minSeparationKm);
      // 후보를 넣어봤을 때 그 집합의 실제 스팬 기준으로 반경을 다시 계산해,
      // 그 반경 안에 2곳 이상 몰리는 점이 생기는지 검사한다.
      let wouldCluster = false;
      if (respectCluster) {
        const tentative = [...chosen, candidate];
        const clusterRadiusKm = Math.max(spanKmOf(tentative) * CLUSTER_RADIUS_FRACTION, CLUSTER_RADIUS_FLOOR_KM);
        wouldCluster = tentative.some(
          (p) => tentative.filter((q) => q !== p && haversineKm(p.center, q.center) < clusterRadiusKm).length >= 2,
        );
      }
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

/** 1등과의 차이가 10% 또는 300m 이내거나, 같은 읍/면/동 안에 있으면 동률로
 * 인정한다. 문제 자체가 "OO읍 인근에 있습니다" 식으로 읍/면/동 단위로만
 * 위치를 알려주므로:
 * - 정답과 내 선택이 같은 읍/면/동이면(픽·정답이 우연히 같은 동네) 무조건 동률
 * - 내 선택이 "문제에서 알려준 그 동네"(originAddr) 안이면, 정답이 직선거리상
 *   조금 더 가까운 다른 동네에 있더라도(예: 구가 다른 옆 동네 병원) 동률로
 *   인정한다 - 실제로는 자기 동네 병원이 훨씬 자연스러운 선택이기 때문. */
export function isTiedWithNearest(ranked: NearestChoice[], pickedId: string | null, originAddr?: string): boolean {
  if (!ranked.length || !pickedId) return false;
  const correct = ranked[0];
  if (pickedId === correct.id) return true;
  const picked = ranked.find((c) => c.id === pickedId);
  if (!picked) return false;
  if (picked.addr && correct.addr && picked.addr === correct.addr) return true;
  if (originAddr && picked.addr === originAddr) return true;
  const tolerance = Math.max(correct.km * 0.1, 0.3);
  return picked.km - correct.km <= tolerance;
}

/** 선택한 병원의 순위 점수를 반환하며, 동률은 1등으로 처리한다. */
export function pointsForPick(ranked: NearestChoice[], pickedId: string | null, originAddr?: string): number {
  if (isTiedWithNearest(ranked, pickedId, originAddr)) return RANK_POINTS[0];
  const index = ranked.findIndex((c) => c.id === pickedId);
  if (index < 0 || index >= RANK_POINTS.length) return 0;
  return RANK_POINTS[index];
}
