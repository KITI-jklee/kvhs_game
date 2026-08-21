import { describe, expect, it } from 'vitest';
import type { Grade, HospitalName } from '../data/types';
import { gradeForScore } from '../data/provider';
import { getGradeProgress } from './grade';
import { haversineKm } from './geo';
import { RANK_POINTS, pointsForPick, selectNearestChoices, type HospitalPoint } from './nearestHospital';
import { judgeScore, pickJudgeQuestions, timeForIndex } from './judge';
import { computeMatchScore } from './matchScore';

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

  it('오답은 정답의 1.15~1.8배 사이(적당히 가깝고 헷갈리는) 후보를 우선 뽑는다', () => {
    // 정답(near) 5km. 너무 가까운 tooClose(1.05배, 거의 같은 거리라 판단
    // 불가능)와 너무 먼 tooFar(3배, "딱 봐도 아니네"로 한눈에 배제됨)는
    // 둘 다 피하고, 적당히 가까운 good1/good2(1.3배·1.6배)를 오답으로
    // 뽑아야 한다 - 화면상 거리만 보고 바로 맞히는 문제를 막는 규칙.
    // (다섯 곳 모두 같은 경도 위에 놓아, 서로 간 실제 거리 = 원점 기준 거리
    // 차이와 같게 만들어서 minSeparationKm과 안 충돌하게 했다.)
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
    expect(decoyIds.sort()).toEqual(['good1', 'good2']);
  });
});

describe('게임② 판별 로직', () => {
  const pool: HospitalName[] = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, name: `실제${i}`, is_real: true, reviewed: true })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, name: `가짜${i}`, is_real: false, reviewed: true })),
    { id: 'unreviewed', name: '미검수', is_real: false, reviewed: false },
  ];

  it('20문항을 실제 14, 검수 가짜 6으로 구성한다', () => {
    const questions = pickJudgeQuestions(pool);
    expect(questions).toHaveLength(20);
    expect(questions.filter((q) => q.is_real)).toHaveLength(14);
    expect(questions.filter((q) => !q.is_real)).toHaveLength(6);
    expect(questions.some((q) => q.id === 'unreviewed')).toBe(false);
  });

  it('뒤 문항일수록 제한시간이 줄고 20정답은 500점이다', () => {
    expect(timeForIndex(0)).toBe(4500);
    expect(timeForIndex(19)).toBe(1500);
    expect(timeForIndex(10)).toBeLessThan(timeForIndex(9));
    expect(judgeScore(19)).toBe(475);
    expect(judgeScore(20)).toBe(500);
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
    expect(computeMatchScore(120, 0)).toBeLessThan(500);
    expect(computeMatchScore(120, 2)).toBeLessThan(computeMatchScore(120, 1));
    expect(computeMatchScore(9999, 999)).toBe(100);
  });
});
