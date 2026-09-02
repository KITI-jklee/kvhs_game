import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Grade, MedicalCostItem } from '../data/types';
import { gradeForScore } from '../data/provider';
import { getGradeProgress } from './grade';
import { haversineKm, type LatLng } from './geo';
import { getTiedGroup, isTiedWithNearest, RANK_POINTS, pointsForPick, selectNearestChoices, type HospitalPoint } from './nearestHospital';
import {
  BUDGET_ITEM_COUNT,
  buildRounds,
  SLIDER_MAX,
  SLIDER_MIN,
  pickBandChoices,
  pickBudgetRound,
  pickHigherLowerRound,
  pickReorderItems,
  scoreBudgetPicks,
  scoreReorder,
  scoreSlider,
  sliderPositionToPrice,
} from './medicalCost';
import { computeMatchScore } from './matchScore';

// 무작위 라운드 테스트가 실패했을 때 항상 같은 입력으로 재현되게 한다.
beforeEach(() => {
  let state = 0x12345678;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  });
});

afterEach(() => vi.restoreAllMocks());

const grades: Grade[] = [
  { icon: '🌱', name: '새싹', range: '0~149점', min: 0, max: 149 },
  { icon: '🔎', name: '탐험가', range: '150~249점', min: 150, max: 249 },
  { icon: '🧭', name: '길잡이', range: '250~349점', min: 250, max: 349 },
  { icon: '💡', name: '척척박사', range: '350~449점', min: 350, max: 449 },
  { icon: '🏆', name: '마스터', range: '450~500점', min: 450, max: 500 },
];

describe('게임① 가장 가까운 위탁병원 찾기 로직', () => {
  it('동일 좌표의 하버사인 거리는 0km이다', () => {
    expect(haversineKm({ lat: 37.5, lng: 127 }, { lat: 37.5, lng: 127 })).toBe(0);
  });

  // 시작점(origin) 기준 거리가 뚜렷이 다른 가짜 병원 목록 - 정답/오답 판정과
  // 순위 채점(1등 100 / 2등 60 / 3등 30점)을 검증하기 쉽게 구성한다. 뭉침 회피가
  // 하드 제약(2km)이라, 같은 경도에 일렬로 두면 후보끼리 실제 거리가 원점 기준
  // 거리차만큼만 벌어져 2km 밑으로 뭉쳐버린다 - 그래서 서로 다른 방향(북/동/서)에
  // 흩어 둬서, 원점까지 거리(gapKm 계산용)는 원하는 값을 유지하면서 후보끼리
  // 실제 거리는 전부 2km를 넘기도록 배치한다.
  const origin = { lat: 37.0, lng: 127.0 };
  const kmNorth = (km: number): LatLng => ({ lat: 37.0 + km / 111.32, lng: 127.0 });
  const kmSouth = (km: number): LatLng => ({ lat: 37.0 - km / 111.32, lng: 127.0 });
  const kmEast = (km: number): LatLng => ({ lat: 37.0, lng: 127.0 + km / (111.32 * Math.cos((37.0 * Math.PI) / 180)) });
  const kmWest = (km: number): LatLng => ({ lat: 37.0, lng: 127.0 - km / (111.32 * Math.cos((37.0 * Math.PI) / 180)) });
  const hospitals: HospitalPoint[] = [
    { id: 'near', name: '근처병원', center: kmNorth(1.0), province: '경기도' }, // 1등, 1.0km(북)
    { id: 'mid', name: '중간병원', center: kmEast(1.8), province: '경기도' }, // gap 0.8km(동)
    { id: 'far1', name: '먼병원1', center: kmWest(2.3), province: '강원특별자치도' }, // gap 1.3km(서) - near/mid와 서로 2km 이상 떨어져 뭉치지 않는다
    { id: 'far2', name: '먼병원2', center: kmEast(3.3), province: '강원특별자치도' }, // gap 2.3km
    { id: 'far3', name: '먼병원3', center: kmEast(4.5), province: '강원특별자치도' }, // gap 3.5km
    { id: 'far4', name: '먼병원4', center: kmEast(5.5), province: '강원특별자치도' }, // gap 4.5km, 풀(4곳) 밖 - 절대 안 뽑혀야 함
  ];

  it('가장 가까운 병원이 항상 1등(ranked[0])으로 포함되고, 오답은 근처 후보 중에서 뽑힌다', () => {
    const round = selectNearestChoices(hospitals, origin, 2, 4);
    expect(round.ranked[0].id).toBe('near');
    expect(round.shuffled).toHaveLength(3);
    expect(round.shuffled.map((c) => c.id)).toContain('near');
    // 풀 크기(4)를 넘어가는 가장 먼 후보(far4)는 절대 섞이지 않는다.
    for (const c of round.shuffled) {
      expect(c.id).not.toBe('far4');
    }
  });

  it('순위별 점수: 1등 100점, 2등 50점, 그 외/미선택 0점', () => {
    const round = selectNearestChoices(hospitals, origin, 2, 4);
    const [first, second] = round.ranked;
    expect(pointsForPick(round.ranked, first.id)).toBe(RANK_POINTS[0]);
    expect(pointsForPick(round.ranked, second.id)).toBe(RANK_POINTS[1]);
    expect(pointsForPick(round.ranked, null)).toBe(0);
    expect(pointsForPick(round.ranked, 'no-such-id')).toBe(0);
  });

  it('원점이 속한 동(originAddr) 밖에서는 사실상 같은 지점(부동소수점 오차 수준)일 때만 동률로 처리한다', () => {
    const ranked = [
      { ...hospitals[0], km: 2 },
      { ...hospitals[1], km: 2.005 },
      { ...hospitals[2], km: 2.02 },
    ];
    expect(isTiedWithNearest(ranked, 'mid')).toBe(true);
    expect(pointsForPick(ranked, 'mid')).toBe(100);
    expect(isTiedWithNearest(ranked, 'far1')).toBe(false);
  });

  it('정답거리가 커도 gap tier 1단계로 뽑힌 오답은 동률(정답) 처리되지 않는다 - tolerance가 비율이었을 때는 정답거리 5km면 tolerance 500m라 gap 0.3km짜리 1단계 오답이 전부 동률로 잘못 채점됐었다', () => {
    const ranked5km = [
      { ...hospitals[0], km: 5 },
      { ...hospitals[1], km: 5.3 }, // gap 0.3km = GAP_TIERS 1단계 하한 - 명백히 다른 병원을 고른 것
    ];
    expect(isTiedWithNearest(ranked5km, 'mid')).toBe(false);
    expect(pointsForPick(ranked5km, 'mid')).toBe(RANK_POINTS[1]);

    // 정답거리 15km짜리 라운드(비율이었다면 tolerance가 1.5km까지 커져 1단계
    // 전체가 동률 처리됐을 극단치)에서도 마찬가지로 동률이 아니어야 한다.
    const ranked15km = [
      { ...hospitals[0], km: 15 },
      { ...hospitals[1], km: 16.5 }, // gap 1.5km = GAP_TIERS 1단계 상한
    ];
    expect(isTiedWithNearest(ranked15km, 'mid')).toBe(false);
    expect(pointsForPick(ranked15km, 'mid')).toBe(RANK_POINTS[1]);
  });

  it('원점이 속한 동(originAddr)이 아니면, 후보끼리 같은 읍/면/동을 공유해도 더 이상 동률로 봐주지 않는다 - 실제 신고 사례(강원 동해시 송정동 미션): 정답 후보 두 곳이 미션이 알려준 송정동이 아니라 둘 다 이웃 동(북삼동)에 있었는데, 그저 서로 같은 동이라는 이유만으로 0.1km 차이도 동률 처리되고 있었다', () => {
    const ranked = [
      { ...hospitals[0], addr: '강원특별자치도 동해시 북삼동', km: 0.4 },
      { ...hospitals[1], addr: '강원특별자치도 동해시 북삼동', km: 0.5 }, // 같은 북삼동이지만 미션이 알려준 동(송정동)은 아님
      { ...hospitals[2], addr: '강원특별자치도 동해시 북삼동', km: 5 },
    ];
    // originAddr(송정동)을 안 넘기면 - 즉 이 북삼동이 미션이 알려준 동이 아니면 -
    // 셋 다 같은 북삼동이어도 더 이상 동률이 아니다.
    expect(isTiedWithNearest(ranked, 'mid')).toBe(false);
    expect(pointsForPick(ranked, 'mid')).toBe(RANK_POINTS[1]);
    expect(isTiedWithNearest(ranked, 'far1')).toBe(false);
  });

  it('정답이 다른 동네 병원이어도, 내 선택이 문제에서 알려준 그 동네(originAddr) 안이면 동률 1등으로 처리한다', () => {
    // "정답: 미소들노인전문병원(구로구 개봉1동) 1km · 내 선택: 강승훈치과의원(양천구 신정3동) 1.3km"
    // 실제로 신고된 케이스 - 문제 자체가 "양천구 신정3동 인근"이라고 알려줬으니
    // 내가 고른 병원이 그 동네 안이면, 정답이 직선거리로 조금 더 가까운 다른
    // 구의 병원이더라도 동률로 인정해야 한다.
    const ranked = [
      { ...hospitals[0], addr: '서울특별시 구로구 개봉1동', km: 1 },
      { ...hospitals[1], addr: '서울특별시 양천구 신정3동', km: 1.3 },
    ];
    const originAddr = '서울특별시 양천구 신정3동';
    expect(isTiedWithNearest(ranked, 'mid', originAddr)).toBe(true);
    expect(pointsForPick(ranked, 'mid', originAddr)).toBe(100);
    // originAddr 없이 부르면(기존 동작) 여전히 거리 기준으로만 판단한다.
    expect(isTiedWithNearest(ranked, 'mid')).toBe(false);
  });

  it('getTiedGroup은 내가 뭘 골랐는지와 무관하게 1등과 동률인 후보를 전부 모아 반환한다 - 실제 신고 사례(순창읍): 대동의원을 직접 골라 맞혀도 화면엔 순창요양병원도 동률이었다는 게 드러나야 한다', () => {
    const ranked = [
      { ...hospitals[0], name: '대동의원', addr: '전북특별자치도 순창군 순창읍', km: 0 },
      { ...hospitals[1], name: '순창요양병원', addr: '전북특별자치도 순창군 순창읍', km: 0 }, // 같은 동네·같은 거리라 동률
      { ...hospitals[2], name: '담양사랑병원', addr: '전라남도 담양군 담양읍', km: 3 }, // 다른 동네·거리도 멀어 동률 아님
    ];
    const originAddr = '전북특별자치도 순창군 순창읍';
    const tied = getTiedGroup(ranked, originAddr);
    expect(tied.map((c) => c.name).sort()).toEqual(['대동의원', '순창요양병원']);
  });

  it('출발점에 동 경계선(rings)이 주어지면 "중심점까지 거리"가 아니라 "경계 안이면 0, 밖이면 경계까지 최소거리"로 채점해 정답이 바뀔 수 있다', () => {
    // 실제 신고 케이스(경기도 구리시 동구동)를 단순화한 것: 동이 길쭉해서 중심점
    // 기준으로는 "중심점에 가까운 병원"이 이기지만, 실제로 그 동에 있는 사람이라면
    // 경계에 훨씬 가까운 병원을 먼저 만난다.
    const regionRings: [number, number][][] = [
      [
        [127.0, 37.0],
        [127.02, 37.0],
        [127.02, 37.01],
        [127.0, 37.01],
      ],
    ];
    const centerOrigin = { lat: 37.005, lng: 127.01 }; // 사각형 동의 중심점
    const regionHospitals: HospitalPoint[] = [
      // 동 경계 오른쪽 변 바로 밖 - 경계까지는 아주 가깝지만 중심점(P)까지는 상대적으로 멂.
      { id: 'nearEdge', name: '경계에 가까운 병원', center: { lat: 37.005, lng: 127.021 }, province: '경기도' },
      // 중심점(P) 바로 위 - P까지는 가깝지만 경계 위쪽 변까지는 상대적으로 멂.
      { id: 'nearCenter', name: '중심점에 가까운 병원', center: { lat: 37.012, lng: 127.01 }, province: '경기도' },
    ];

    const byCenterPoint = selectNearestChoices(regionHospitals, centerOrigin, 1, 2);
    expect(byCenterPoint.ranked[0].id).toBe('nearCenter'); // rings 없이 부르면(기존 동작) 중심점 기준 직선거리

    const byRegion = selectNearestChoices(regionHospitals, centerOrigin, 1, 2, undefined, regionRings);
    expect(byRegion.ranked[0].id).toBe('nearEdge'); // rings를 주면 경계선 기준으로 바뀌어 정답이 뒤집힌다
  });

  it('오답 후보가 정답과의 거리차(gapKm) 0.3~1.5km 안에 여럿 있으면(방향이 달라 서로 뭉치지 않으면) 우선 뽑는다 - 배수가 아니라 절대 거리차 기준이라 정답이 아주 가까워도(예: 0km) 정상 작동한다', () => {
    // d1(북쪽, gap 0.3km)·d2(동쪽, gap 0.55km)는 둘 다 1단계 밴드 안이고,
    // 서로 다른 방향에 있어 실제 거리도 2km 넘게 떨어져 있다 - 뭉치지 않으므로
    // 둘 다 뽑힌다.
    const gapHospitals: HospitalPoint[] = [
      { id: 'near', name: '정답', center: kmNorth(1.0), province: '경기도' },
      { id: 'd1', name: '오답1', center: kmSouth(1.3), province: '경기도' }, // gap 0.3km, 정답과 정반대 방향
      { id: 'd2', name: '오답2', center: kmEast(1.55), province: '경기도' }, // gap 0.55km, 옆 방향
    ];
    const round = selectNearestChoices(gapHospitals, origin, 2, 10);
    expect(round.ranked[0].id).toBe('near');
    expect(round.ranked.slice(1).map((c) => c.id).sort()).toEqual(['d1', 'd2']);
  });

  it('핀 3개 이상이 한곳에 몰리면(뭉침) 억지로 다 채우지 않고 선택지 수를 줄인다', () => {
    // d1(gap 0.3km)·d2(gap 0.55km)는 둘 다 gap 기준으론 1단계 밴드 안에 드는
    // 좋은 후보지만, 같은 방향(북쪽)에 나란히 있어 서로 실제 거리가 0.25km밖에
    // 안 떨어져 있다 - 정답까지 합쳐 셋 다 뽑히면 지도에서 뭉쳐 보인다. 뭉침
    // 회피는 이제 완화되지 않는 하드 제약이라, 억지로 둘 다 채우지 않고
    // 하나만 선택해 선택지를 줄인다(2지선다).
    const clusteredHospitals: HospitalPoint[] = [
      { id: 'near', name: '정답', center: kmNorth(1.0), province: '경기도' },
      { id: 'd1', name: '오답1', center: kmNorth(1.3), province: '경기도' }, // gap 0.3km
      { id: 'd2', name: '오답2', center: kmNorth(1.55), province: '경기도' }, // gap 0.55km, d1과 0.25km 차이
    ];
    const round = selectNearestChoices(clusteredHospitals, origin, 2, 10);
    expect(round.ranked.slice(1)).toHaveLength(1); // 2개 다 원했지만 뭉쳐서 1개만 채워진다
  });

  it('1단계(0.3~1.5km)에 후보가 부족하면 2단계(0.2~2.5km)로 넓힌다', () => {
    const tieredHospitals: HospitalPoint[] = [
      { id: 'near', name: '정답', center: kmNorth(1.0), province: '경기도' },
      { id: 'onlyTier1', name: '1단계후보', center: kmSouth(1.6), province: '경기도' }, // gap 0.6km, 정답과 반대 방향(뭉침 방지)
      { id: 'tier2Only', name: '2단계후보', center: kmEast(3.0), province: '경기도' }, // gap 2.0km(1단계 상한 1.5km 초과), 옆 방향
    ];
    const round = selectNearestChoices(tieredHospitals, origin, 2, 10);
    expect(round.ranked.slice(1).map((c) => c.id).sort()).toEqual(['onlyTier1', 'tier2Only']);
  });

  it('절대 상한(15km)을 넘는 후보는 decoy가 부족해도 절대 끌어오지 않는다 - 억지로 채우기보다 4지선다·3지선다를 허용한다', () => {
    const sparseHospitals: HospitalPoint[] = [
      { id: 'near', name: '정답', center: kmNorth(1.0), province: '경기도' },
      { id: 'withinCap', name: '상한 안 후보', center: kmNorth(6.5), province: '경기도' }, // gap 5.5km - 3단계(5km) 밖이라 최종 fallback에서만 채워짐
      { id: 'beyondCap', name: '상한 밖 후보', center: kmNorth(20.0), province: '경기도' }, // gap 19km - 15km 상한 밖, 절대 안 뽑혀야 함
    ];
    const round = selectNearestChoices(sparseHospitals, origin, 2, 10); // decoy 2개를 요청해도
    const decoyIds = round.ranked.slice(1).map((c) => c.id);
    expect(decoyIds).toEqual(['withinCap']); // 1개만 채워지고 beyondCap은 포함되지 않는다
  });

  it('정답이 도서·벽지 지정 병원이면 15km 상한을 적용하지 않는다 - 울릉도·백령도처럼 그 군 전체에 병원이 1~2곳뿐인 곳도 보여줄 수 있어야 한다', () => {
    const islandHospitals: HospitalPoint[] = [
      { id: 'near', name: '섬 유일 병원', center: kmNorth(1.0), province: '경상북도', isRemoteArea: true }, // 정답
      { id: 'mainland', name: '육지 병원', center: kmNorth(150.0), province: '경상북도' }, // gap 149km - 일반 상한(15km)이었으면 절대 안 뽑혔을 후보
    ];
    const round = selectNearestChoices(islandHospitals, origin, 1, 10);
    expect(round.ranked.slice(1).map((c) => c.id)).toEqual(['mainland']); // 도서·벽지 정답이라 150km 밖 후보도 채워진다
  });
});

describe('게임② 의료비 감각 테스트 로직', () => {
  const pool: MedicalCostItem[] = [
    { id: 'a', name: '항목A', cost: 15_000, category: 'X' },
    { id: 'b', name: '항목B', cost: 80_000, category: 'X' },
    { id: 'c', name: '항목C', cost: 130_000, category: 'X' },
    { id: 'd', name: '항목D', cost: 550_000, category: 'X' },
    { id: 'e', name: '항목E', cost: 1_000_000, category: 'X' },
    { id: 'f', name: '항목F', cost: 130_000, category: 'X' }, // c와 동가 - HIGHER/LOWER 동가 제외 검증용
  ];

  it('라운드① 슬라이더: 로그 스케일 위치 0/1이 최소/최대 가격에 대응하고, 오차율로 채점한다', () => {
    expect(sliderPositionToPrice(0)).toBe(SLIDER_MIN);
    expect(sliderPositionToPrice(1)).toBe(SLIDER_MAX);
    expect(scoreSlider(430_000, 430_000).points).toBe(100); // 오차 0%
    expect(scoreSlider(300_000, 430_000)).toEqual({ points: 40, label: 'CLOSE', errorPercent: 30 }); // 오차 30%
    expect(scoreSlider(10_000, 1_000_000).points).toBe(0); // 오차 99%
  });

  it('라운드② 4지선다: 정답 밴드가 로그상 가장 가까운 사다리값이고, 오답은 그다음으로 가까운 것부터 채운다', () => {
    const { bands, correctIndex } = pickBandChoices(127_780); // "뇌혈류 초음파" 실제 가격
    expect(bands).toHaveLength(4);
    expect(bands[correctIndex]).toEqual({ value: 100_000, label: '약 10만원' });
    const decoyValues = bands.filter((_, i) => i !== correctIndex).map((b) => b.value);
    expect(decoyValues.sort((a, b) => a - b)).toEqual([50_000, 70_000, 200_000]);
  });

  it('라운드② 4지선다: 실제 가격이 만원 단위로 딱 떨어지면(예: 4만원) 사다리값으로 뭉개지 않고 실제 가격 그대로가 정답으로 나오고, 오답 3개도 "약" 없이 같은 표기 형식으로 나온다(정답만 표기가 달라서 티나지 않게)', () => {
    const { bands, correctIndex } = pickBandChoices(40_000);
    expect(bands[correctIndex]).toEqual({ value: 40_000, label: '4만원' });
    // 3만원도 로그상 4만원과 동일한 거리라 오답 후보로 나올 수 있지만, 넷 다
    // "약" 없이 같은 형식이라 정답이 뭔지 표기만 보고는 알 수 없다.
    bands.forEach((b) => expect(b.label).not.toMatch(/^약/));
  });

  it('라운드② 4지선다: 만원 단위로 안 떨어지는 가격(예: 219,900원)은 종전대로 사다리값에 "약"을 붙여 보여준다', () => {
    const { bands } = pickBandChoices(219_900);
    bands.forEach((b) => expect(b.label).toMatch(/^약 /));
  });

  it('라운드③ 순서 맞추기: 4개 모두 서로 1.15배 이상 차이 나는 항목을 뽑고, 고정점 0/1/2/4개로 채점한다', () => {
    // 'f'는 'c'와 가격이 같아 1.15배 조건을 못 지키니 이 테스트에서는 뺀다.
    const spreadPool = pool.filter((i) => i.id !== 'f');
    const items = pickReorderItems(spreadPool);
    expect(items).toHaveLength(4);
    const sorted = [...items].sort((a, b) => a.cost - b.cost);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].cost / sorted[i - 1].cost).toBeGreaterThanOrEqual(1.15);
    }

    const [id0, id1, id2, id3] = sorted.map((i) => i.id);
    expect(scoreReorder(items, [id0, id1, id2, id3])).toEqual({ points: 100, fixedCount: 4 });
    // 4개짜리 순열에서 "정확히 3개만 맞음"은 나올 수 없다(마지막 하나는 갈 자리가 그 자리뿐).
    expect(scoreReorder(items, [id0, id1, id3, id2])).toEqual({ points: 50, fixedCount: 2 });
    expect(scoreReorder(items, [id0, id2, id3, id1])).toEqual({ points: 20, fixedCount: 1 });
    expect(scoreReorder(items, [id3, id2, id1, id0])).toEqual({ points: 0, fixedCount: 0 });
  });

  it('라운드④ 예산 챌린지: 후보 5개 중 예산 안에 드는 항목(1개 또는 2개)이 fitIds에 정확히 담긴다', () => {
    // 'f'는 'c'와 가격이 같아 예산 경계가 애매해지니 이 테스트에서는 뺀다.
    const spreadPool = pool.filter((i) => i.id !== 'f');
    for (let i = 0; i < 30; i++) {
      const round = pickBudgetRound(spreadPool);
      expect(round).not.toBeNull();
      if (!round) continue;
      expect(round.items).toHaveLength(BUDGET_ITEM_COUNT);
      expect([1, 2]).toContain(round.fitIds.length);
      const actualFitIds = round.items.filter((i) => i.cost <= round.budget).map((i) => i.id);
      expect(actualFitIds.sort()).toEqual([...round.fitIds].sort());
    }
  });

  it('예산 채점: 정확히 다 맞으면 100점, 잘못 고른 것 없이 일부만 맞으면 50점, 잘못 고른 게 섞이면 20점, 하나도 못 맞히면 0점', () => {
    expect(scoreBudgetPicks(['a', 'b'], ['a', 'b'])).toEqual({
      points: 100,
      correctPickCount: 2,
      wrongPickCount: 0,
      missedCount: 0,
    });
    expect(scoreBudgetPicks(['a', 'b'], ['a'])).toEqual({
      points: 50,
      correctPickCount: 1,
      wrongPickCount: 0,
      missedCount: 1,
    });
    expect(scoreBudgetPicks(['a', 'b'], ['a', 'c'])).toEqual({
      points: 20,
      correctPickCount: 1,
      wrongPickCount: 1,
      missedCount: 1,
    });
    expect(scoreBudgetPicks(['a'], ['c'])).toEqual({
      points: 0,
      correctPickCount: 0,
      wrongPickCount: 1,
      missedCount: 1,
    });
    expect(scoreBudgetPicks(['a'], [])).toEqual({
      points: 0,
      correctPickCount: 0,
      wrongPickCount: 0,
      missedCount: 1,
    });
  });

  it('라운드⑤ 더 비싼 것 고르기: 두 항목 가격이 같은 조합은 절대 뽑지 않는다', () => {
    for (let i = 0; i < 20; i++) {
      const round = pickHigherLowerRound(pool);
      expect(round).not.toBeNull();
      if (!round) continue;
      expect(round.refItem.cost).not.toBe(round.nextItem.cost);
      expect(round.isHigher).toBe(round.nextItem.cost > round.refItem.cost);
    }
  });

  it('라운드⑤ 더 비싼 것 고르기: "차이가 크지 않다"는 안내문에 맞게, 값이 3배 넘게 차이나는 조합은 최대한 피한다', () => {
    // pool 안에는 3배 이내로 가까운 조합(b·c, b·f, d·e)이 존재하니, 40회
    // 시도 안에서 거의 항상 그중 하나를 찾아야 한다.
    for (let i = 0; i < 20; i++) {
      const round = pickHigherLowerRound(pool);
      expect(round).not.toBeNull();
      if (!round) continue;
      const ratio = Math.max(round.refItem.cost, round.nextItem.cost) / Math.min(round.refItem.cost, round.nextItem.cost);
      expect(ratio).toBeLessThanOrEqual(3);
    }
  });

  it('전체 라운드 생성 시 다섯 종류를 순서대로 만들고 각 라운드의 필수 데이터를 채운다', () => {
    const rounds = buildRounds(pool);
    expect(rounds.map((round) => round.kind)).toEqual(['slider', 'band', 'reorder', 'budget', 'higherLower']);
    expect(rounds[0]).toHaveProperty('item');
    expect(rounds[1]).toMatchObject({ kind: 'band', bands: expect.any(Array), correctIndex: expect.any(Number) });
    expect(rounds[2]).toMatchObject({ kind: 'reorder', items: expect.any(Array) });
    expect(rounds[3]).toMatchObject({ kind: 'budget', items: expect.any(Array), fitIds: expect.any(Array) });
    expect(rounds[4]).toMatchObject({ kind: 'higherLower', isHigher: expect.any(Boolean) });
  });
});

describe('공통 점수와 등급', () => {
  it('등급 경계값을 정확히 분류한다', () => {
    const cases = [[0, '새싹'], [149, '새싹'], [150, '탐험가'], [249, '탐험가'], [250, '길잡이'], [349, '길잡이'], [350, '척척박사'], [449, '척척박사'], [450, '마스터'], [500, '마스터']] as const;
    cases.forEach(([score, name]) => expect(gradeForScore(score, grades).name).toBe(name));
  });

  it('다음 등급까지 남은 점수를 계산한다', () => {
    expect(getGradeProgress(149, grades).toNext).toBe(1);
    expect(getGradeProgress(450, grades).toNext).toBe(0);
  });

  it('게임③ 점수는 시간과 오매칭이 늘면 낮아지고 100~500을 유지한다', () => {
    expect(computeMatchScore(60, 0)).toBe(500);
    expect(computeMatchScore(180, 0)).toBeLessThan(500);
    expect(computeMatchScore(180, 2)).toBeLessThan(computeMatchScore(180, 1));
    expect(computeMatchScore(169, 70)).toBe(271);
    expect(computeMatchScore(9999, 999)).toBe(100);
  });
});
