import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Grade, MedicalCostItem } from '../data/types';
import { gradeForScore } from '../data/provider';
import { getGradeProgress } from './grade';
import { haversineKm } from './geo';
import { isTiedWithNearest, RANK_POINTS, pointsForPick, selectNearestChoices, type HospitalPoint } from './nearestHospital';
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
  // 순위 채점(1등 100 / 2등 50 / 3등 0)을 검증하기 쉽게 구성한다.
  const origin = { lat: 37.0, lng: 127.0 };
  const hospitals: HospitalPoint[] = [
    { id: 'near', name: '근처병원', center: { lat: 37.01, lng: 127.0 }, province: '경기도' }, // 1등
    { id: 'mid', name: '중간병원', center: { lat: 37.2, lng: 127.0 }, province: '경기도' }, // 2등
    { id: 'far1', name: '먼병원1', center: { lat: 38.0, lng: 127.0 }, province: '강원특별자치도' },
    { id: 'far2', name: '먼병원2', center: { lat: 38.5, lng: 127.0 }, province: '강원특별자치도' },
    { id: 'far3', name: '먼병원3', center: { lat: 39.0, lng: 127.0 }, province: '강원특별자치도' },
    { id: 'far4', name: '먼병원4', center: { lat: 40.0, lng: 127.0 }, province: '강원특별자치도' }, // 풀(4곳) 밖 - 절대 안 뽑혀야 함
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

  it('1등과 10% 또는 300m 이내인 후보는 동률 1등으로 처리한다', () => {
    const ranked = [
      { ...hospitals[0], km: 2 },
      { ...hospitals[1], km: 2.25 },
      { ...hospitals[2], km: 2.31 },
    ];
    expect(isTiedWithNearest(ranked, 'mid')).toBe(true);
    expect(pointsForPick(ranked, 'mid')).toBe(100);
    expect(isTiedWithNearest(ranked, 'far1')).toBe(false);
  });

  it('오답은 정답의 1.15~1.8배 사이(적당히 가깝고 헷갈리는) 후보를 우선 뽑되, 그 후보끼리도 서로 뭉치면 하나는 양보한다', () => {
    // 정답(near) 5km. 너무 가까운 tooClose(1.05배, 거의 같은 거리라 판단
    // 불가능)는 피하고, 적당히 가까운 good1/good2(1.3배·1.6배)를 오답 후보로
    // 우선 본다 - 화면상 거리만 보고 바로 맞히는 문제를 막는 규칙. 다만
    // good1과 good2는 서로 1.5km밖에 안 떨어져 있어(다섯 곳 모두 같은 경도 위에
    // 둬서 서로 간 실제 거리 = 원점 기준 거리 차이와 같다) 정답과 함께 셋 다
    // 뽑히면 지도에서 세 핀이 붙어 보인다 - 그래서 간격비 조건을 만족해도 뭉침
    // 방지가 우선이라 둘 중 하나만 뽑히고, 남은 자리는 뭉치지 않는 tooFar(3배,
    // 한눈에 배제될 만큼 멀지만 뭉치지는 않는 거리)가 채운다.
    const bandHospitals: HospitalPoint[] = [
      { id: 'near', name: '정답', center: { lat: 37.044916, lng: 127.0 }, province: '경기도' }, // 5km
      { id: 'tooClose', name: '너무가까운오답', center: { lat: 37.047161, lng: 127.0 }, province: '경기도' }, // 5.25km
      { id: 'good1', name: '적당한오답1', center: { lat: 37.058397, lng: 127.0 }, province: '경기도' }, // 6.5km
      { id: 'good2', name: '적당한오답2', center: { lat: 37.07186, lng: 127.0 }, province: '경기도' }, // 8km
      { id: 'tooFar', name: '너무먼오답', center: { lat: 37.134747, lng: 127.0 }, province: '경기도' }, // 15km
    ];
    const round = selectNearestChoices(bandHospitals, origin, 2, 10);
    expect(round.ranked[0].id).toBe('near');
    const decoyIds = round.ranked.slice(1).map((c) => c.id);
    expect(decoyIds).toHaveLength(2);
    expect(decoyIds).not.toContain('tooClose');
    const fromPreferredBand = decoyIds.filter((id) => id === 'good1' || id === 'good2');
    expect(fromPreferredBand).toHaveLength(1); // good1·good2 둘 다는 절대 같이 뽑히지 않는다
    expect(decoyIds).toContain('tooFar');
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
