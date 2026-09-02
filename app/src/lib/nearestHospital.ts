import type { LatLng } from './geo';
import { distanceToRegionKm, haversineKm } from './geo';
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

/** decoy 후보를 "정답과의 거리차(gapKm)"가 이 범위인 병원 중에서 우선 찾는다 -
 * 1단계에서 부족하면 2단계, 3단계로 범위를 넓힌다.
 *
 * 배수(비율)가 아니라 절대 거리차를 쓰는 이유: 출발점을 동 경계선 기준으로
 * 계산하면서(distanceToRegionKm) 정답 거리(correct.km)가 0에 가까운 라운드가
 * 흔해졌다(병원이 그 동 경계 바로 안/밖에 있는 경우) - 이때 "1.15~1.8배" 같은
 * 비율은 0에 가까운 값을 곱해봐야 여전히 0에 가까워서 사실상 후보를 하나도 못
 * 찾는다(정답 0.05km면 1.8배도 0.09km). 절대 거리차는 정답 거리 크기와 무관하게
 * 항상 "적당히 가깝고 헷갈리는" 오답을 찾을 수 있다 - 시뮬레이션으로 확인. */
const GAP_TIERS: readonly [number, number][] = [
  [0.3, 1.5],
  [0.2, 2.5],
  [0.1, 5.0],
];
/** 위 3단계로도 decoy를 다 못 채우면 이 거리(km) 안에서 가까운 순서대로 채운다.
 * 이 상한 밖까지 나가면서 억지로 채우지 않는다 - 병원이 희소한 지역은 5지선다
 * 대신 4지선다·3지선다로 보여주는 게 낫다(예전엔 상한이 없어서 병원이 극히
 * 희소한 지역에서 decoy 하나가 100km 넘게 떨어진 경우도 있었다).
 *
 * 8km였다가 15km로 올렸다 - 뭉침 때문에 줄어드는 라운드(17.7%)에는 상한을
 * 얼마로 두든 효과가 없지만(그 지역엔 흩어진 대안 자체가 없음), 그냥 병원이
 * 희소해서 줄어드는 라운드(12.5%)는 8km에서 재추첨 13.5% 중 대부분을 차지했다.
 * 15km로 올리면 재추첨이 2.7%까지 줄고(시뮬레이션으로 확인), 최악의 경우에도
 * decoy가 "옆 시/군 정도" 거리에 그쳐 지도가 터무니없이 넓어지진 않는다 - 20km부터는
 * 개선 폭이 급격히 줄고(1.0%), 상한을 없애면 다시 100km대 이상치가 나온다. */
const FINAL_FALLBACK_MAX_GAP_KM = 15;
/** 정답이 공식 도서·벽지 지정 위탁병원이면 위 상한을 아예 적용하지 않는다.
 * 도서·벽지 지역(예: 울릉도·백령도)은 그 군 전체에 위탁병원이 1~2곳뿐이라, 15km
 * 안에서 decoy를 못 찾는 게 당연하다 - 그렇다고 재추첨으로 건너뛰면 "이런 곳에도
 * 위탁병원이 있다"는 걸 보여줄 기회 자체가 없어진다(전국 198곳 중 17곳이 이렇게
 * 스킵되고 있었다). 이런 곳은 흔치 않고(전체 라운드의 일부일 뿐) 보여주는 의미가
 * 크므로, 육지까지 멀리 떨어진 decoy라도 예외적으로 허용한다. */
const REMOTE_AREA_HAS_NO_FALLBACK_CAP = true;

/** 거리 계산과 핀 간격을 우선하고, 후보가 부족하면 조건을 단계적으로 완화한다.
 *
 * originRegionRings가 주어지면(미션 출발점이 속한 읍/면/동 경계가 있으면) "출발점
 * 중심점 하나까지의 직선거리"가 아니라 "그 동 경계 안이면 0, 밖이면 경계까지의
 * 최소거리"로 계산한다. 문제 자체가 "OO동 인근에 있습니다"라고만 알려주므로,
 * 사람이 동 전체 어딘가에 있을 수 있다는 전제를 반영한 것 - 동이 길쭉하거나
 * 찌그러진 모양이면 중심점 기준 1등과 실제로 가장 먼저 만나는 병원이 다른 경우가
 * 잦았다(전국 동의 15.5%에서 정답이 바뀌었고, 77%는 1등·2등 격차가 더 뚜렷해짐 -
 * 시뮬레이션으로 확인). rings가 없으면(시/군 중심 fallback 등) 기존처럼 직선거리를 쓴다. */
export function selectNearestChoices(
  hospitals: HospitalPoint[],
  origin: LatLng,
  decoyCount = 2,
  searchPoolSize = 30,
  minSeparationKm = 0.2,
  originRegionRings?: [number, number][][],
): NearestRound {
  const distanceFromOrigin = (point: LatLng): number =>
    originRegionRings && originRegionRings.length
      ? distanceToRegionKm(originRegionRings, point, origin)
      : haversineKm(origin, point);
  const distanced = hospitals
    .map((h) => ({ ...h, km: distanceFromOrigin(h.center) }))
    .sort((a, b) => a.km - b.km);
  const correct = distanced[0];
  const searchPool = distanced
    .slice(1, 1 + searchPoolSize)
    .map((h) => ({ ...h, gapKm: h.km - correct.km }));

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
  // 자연히 그 외딴 후보 자체가 걸러진다(gap 단계를 넓히는 동안에도 예외 없이
  // 똑같이 적용한다 - gap만 맞고 서로 가까운 후보 2개보다는, 뭉치지 않는 후보
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
  // 뭉침 회피는 아래 tryFill에서 절대 relax하지 않는 하드 제약이다(간격
  // 조건과 달리 "그래도 안 되면 무시" 단계가 없다) - 전에는 이 뭉침 회피도
  // 마지막 단계에서 무시해버려서, floor를 0.3km든 2km든 뭐로 두든 결과가
  // 거의 똑같았다(전국 시뮬레이션에서 81% 안팎으로 동일) - "결국 못 채우면
  // 무시하고 채운다"는 마지막 탈출구가 floor 값 자체를 무의미하게 만들었기
  // 때문. 그 탈출구를 없애고 나서야 floor 값이 실제로 의미를 가지며, 2km가
  // 가장 균형이 좋았다(뭉쳐 보이는 라운드 81%->67.7%, 그러면서도 4지선다
  // 유지율은 0.5~2km 어디를 골라도 70~72%로 큰 차이가 없었다). 후보가
  // 부족해서 이 반경을 못 지키면 decoy를 덜 보여준다(강제로 채우지 않음).
  const CLUSTER_RADIUS_FLOOR_KM = 2;

  // gap 1단계 풀을 어떤 순서로 시도하느냐(shuffle)에 따라 간격·뭉침 조건을
  // 만족하는 조합이 다르게 나올 수 있어서(먼저 뽑힌 후보가 자리를 차지해버리면
  // 뒤에 오는 좋은 후보가 뭉침으로 걸려버림), 한 번만 시도하면 순전히 운으로
  // decoy가 덜 채워지는 경우가 있었다(전국 시뮬레이션에서 미달 지역의 2.5%는
  // 순서만 바꾸면 5지선다가 가능했음). KoreaMap.tsx의 labelPlacement가 여러
  // 배치 순서를 시도해 최선을 고르는 것과 같은 방식으로, 여기서도 여러 번
  // 시도해 decoy가 가장 많이 채워진(동점이면 거리폭이 더 좁은) 결과를 쓴다.
  const attemptFill = (): NearestChoice[] => {
    const chosen: NearestChoice[] = [correct];
    const tryFill = (pool: NearestChoice[], respectSeparation: boolean) => {
      for (const candidate of pool) {
        if (chosen.length - 1 >= decoyCount) break;
        if (chosen.some((c) => c.id === candidate.id)) continue;
        const tooClose = respectSeparation && chosen.some((c) => haversineKm(c.center, candidate.center) < minSeparationKm);
        // 후보를 넣어봤을 때 그 집합의 실제 스팬 기준으로 반경을 다시 계산해,
        // 그 반경 안에 2곳 이상 몰리는 점이 생기는지 검사한다 - respectSeparation과
        // 달리 이 검사는 항상 적용한다(relax하는 매개변수가 따로 없음).
        const tentative = [...chosen, candidate];
        const clusterRadiusKm = Math.max(spanKmOf(tentative) * CLUSTER_RADIUS_FRACTION, CLUSTER_RADIUS_FLOOR_KM);
        const wouldCluster = tentative.some(
          (p) => tentative.filter((q) => q !== p && haversineKm(p.center, q.center) < clusterRadiusKm).length >= 2,
        );
        if (!tooClose && !wouldCluster) chosen.push(candidate);
      }
    };
    // gap 단계를 좁은 순서(0.3~1.5 -> 0.2~2.5 -> 0.1~5)로 넓혀가며, 각 단계마다
    // 간격 조건만 단계적으로 완화해 후보 수를 채운다(뭉침 회피는 위에서처럼 항상 유지).
    for (const [gapMin, gapMax] of GAP_TIERS) {
      const tierPool = searchPool.filter((c) => c.gapKm >= gapMin && c.gapKm <= gapMax).sort((a, b) => a.gapKm - b.gapKm);
      tryFill(shuffle(tierPool), true);
      tryFill(tierPool, false);
    }
    // 3단계(5km)까지도 못 채웠으면 절대 상한(FINAL_FALLBACK_MAX_GAP_KM) 안에서만
    // 가까운 순서대로 채운다(뭉침 회피는 여기서도 유지) - 그래도 부족하면 decoy를
    // 덜 보여준다(강제로 채우지 않음 - 억지로 끌어온 먼 후보나 뭉친 후보보다 낫다).
    // 다만 정답이 도서·벽지 지정 병원이면 이 상한 자체를 적용하지 않는다(위 주석 참고).
    if (chosen.length - 1 < decoyCount) {
      const capKm = correct.isRemoteArea && REMOTE_AREA_HAS_NO_FALLBACK_CAP ? Infinity : FINAL_FALLBACK_MAX_GAP_KM;
      const finalPool = searchPool.filter((c) => c.gapKm <= capKm).sort((a, b) => a.gapKm - b.gapKm);
      tryFill(finalPool, false);
    }
    return chosen;
  };

  const FILL_ATTEMPTS = 8;
  let best = attemptFill();
  for (let i = 1; i < FILL_ATTEMPTS && best.length - 1 < decoyCount; i++) {
    const candidate = attemptFill();
    const candidateSpan = spanKmOf(candidate);
    const bestSpan = spanKmOf(best);
    if (candidate.length > best.length || (candidate.length === best.length && candidateSpan < bestSpan)) {
      best = candidate;
    }
  }

  const ranked = best.sort((a, b) => a.km - b.km);
  return { ranked, shuffled: shuffle(ranked) };
}

/** "해당 지역(원점이 속한 동/읍/면, originAddr) 밖"인 후보끼리는 이 정도
 * (사실상 부동소수점 오차 수준)로 거리가 같을 때만 동률로 본다.
 *
 * 예전엔 `max(정답거리 x 10%, 300m)`처럼 비율 성분이 섞여 있었는데, 이건 gap
 * 기반 decoy 선정(GAP_TIERS)과 서로 안 맞았다 - 정답거리가 커질수록 10% 성분도
 * 같이 커져서, 정답거리 5km면 500m까지, 15km면 1.5km까지 동률 처리돼버렸다.
 * 그런데 GAP_TIERS 1단계는 정답거리와 무관하게 항상 "0.3~1.5km 더 먼" 후보를
 * 오답으로 뽑도록 설계했으니, 정답거리가 조금만 커도 1단계 오답 전부(또는
 * 15km면 전부)가 이 tolerance에 걸려 "오답을 골랐는데 정답 처리(100점)"되는
 * 채점 버그가 있었다. 그래서 일단 0.2km 고정값으로 바꿨었는데, 이번엔 그마저도
 * 너무 후하다는 게 드러났다 - 실제 신고 사례(강원 동해시 송정동 미션)에서 정답
 * 후보 두 곳이 미션이 알려준 동(송정동)이 아니라 둘 다 "북삼동"이라는 이웃 동에
 * 있었는데(각각 0.4km·0.5km, 둘 다 송정동 밖), 그저 서로 같은 읍/면/동을
 * 공유한다는 이유만으로 0.1km 차이도 동률 처리되고 있었다. 미션이 알려준 동네
 * 밖에서는 이런 "같은 동네니까 봐준다"가 성립할 이유가 없으므로, 이 경우엔
 * 거의 정확히 같은 지점일 때만(부동소수점 오차 수준) 동률로 본다 - 나머지는
 * 아래 originAddr 규칙이 담당한다. */
const OUTSIDE_TARGET_TOLERANCE_KM = 0.01;

/** 후보 하나가 1등(correct)과 동률인지 판단하는 공통 규칙. 문제 자체가 "OO읍
 * 인근에 있습니다" 식으로 읍/면/동 단위로만 위치를 알려주므로:
 * - 후보가 "문제에서 알려준 그 동네"(originAddr) **안**에 있으면, 거리가 1등과
 *   얼마나 다르든 무조건 동률로 인정한다 - 실제로는 자기 동네 병원이 훨씬
 *   자연스러운 선택이기 때문(1등이 직선거리상 조금 더 가까운 다른 동네에
 *   있더라도, 예: 구가 다른 옆 동네 병원).
 * - 후보와 1등이 **둘 다 그 동네 밖**이면, 서로 같은 읍/면/동을 공유하더라도
 *   더 이상 무조건 봐주지 않는다 - 그 동네가 아닌 이상 "같은 동네니까"라는
 *   근거가 없기 때문. 이때는 OUTSIDE_TARGET_TOLERANCE_KM만큼만(사실상 같은
 *   지점일 때만) 동률로 본다. */
function isTiedCandidate(candidate: NearestChoice, correct: NearestChoice, originAddr?: string): boolean {
  if (candidate.id === correct.id) return true;
  if (originAddr && candidate.addr === originAddr) return true;
  return candidate.km - correct.km <= OUTSIDE_TARGET_TOLERANCE_KM;
}

/** 내가 고른 병원(pickedId)이 1등과 동률인지 판단한다. */
export function isTiedWithNearest(ranked: NearestChoice[], pickedId: string | null, originAddr?: string): boolean {
  if (!ranked.length || !pickedId) return false;
  const correct = ranked[0];
  const picked = ranked.find((c) => c.id === pickedId);
  if (!picked) return false;
  return isTiedCandidate(picked, correct, originAddr);
}

/** 1등과 동률인 후보를 전부 모아 반환한다(1등 자신 포함, km 오름차순) - 화면에
 * "정답이 사실 여러 곳이었다"는 걸 내가 뭘 골랐는지와 무관하게 보여줄 때 쓴다.
 * 실제 신고 사례: 순창읍 안에 대동의원·순창요양병원이 둘 다 있는데, 대동의원을
 * 직접 골라 맞혔을 땐 순창요양병원도 동률이었다는 사실이 화면에 전혀 안
 * 드러났었다. */
export function getTiedGroup(ranked: NearestChoice[], originAddr?: string): NearestChoice[] {
  if (!ranked.length) return [];
  const correct = ranked[0];
  return ranked.filter((c) => isTiedCandidate(c, correct, originAddr));
}

/** 선택한 병원의 순위 점수를 반환하며, 동률은 1등으로 처리한다. */
export function pointsForPick(ranked: NearestChoice[], pickedId: string | null, originAddr?: string): number {
  if (isTiedWithNearest(ranked, pickedId, originAddr)) return RANK_POINTS[0];
  const index = ranked.findIndex((c) => c.id === pickedId);
  if (index < 0 || index >= RANK_POINTS.length) return 0;
  return RANK_POINTS[index];
}
