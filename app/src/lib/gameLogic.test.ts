import { describe, expect, it } from 'vitest';
import type { Grade, HospitalName } from '../data/types';
import { gradeForScore } from '../data/provider';
import { getGradeProgress } from './grade';
import { haversineKm, scoreForDistanceKm, scoreForLocationAttempt } from './geo';
import { judgeScore, pickJudgeQuestions, timeForIndex } from './judge';
import { computeMatchScore } from './matchScore';

const grades: Grade[] = [
  { icon: '🌱', name: '새싹', range: '0~149점', min: 0, max: 149 },
  { icon: '🔎', name: '탐험가', range: '150~249점', min: 150, max: 249 },
  { icon: '🧭', name: '길잡이', range: '250~349점', min: 250, max: 349 },
  { icon: '💡', name: '척척박사', range: '350~449점', min: 350, max: 449 },
  { icon: '🏆', name: '마스터', range: '450~500점', min: 450, max: 500 },
];

describe('게임① 거리 로직', () => {
  it('동일 좌표의 하버사인 거리는 0km이다', () => {
    expect(haversineKm({ lat: 37.5, lng: 127 }, { lat: 37.5, lng: 127 })).toBe(0);
  });

  it('현재 확정된 지도 반경 비율 경계로 채점한다', () => {
    expect(scoreForDistanceKm(10, 100)).toBe(100);
    expect(scoreForDistanceKm(10.01, 100)).toBe(70);
    expect(scoreForDistanceKm(22.5, 100)).toBe(70);
    expect(scoreForDistanceKm(22.51, 100)).toBe(40);
    expect(scoreForDistanceKm(40, 100)).toBe(40);
    expect(scoreForDistanceKm(40.01, 100)).toBe(10);
  });

  it('시간 초과는 미확정 핀과 관계없이 0점이다', () => {
    expect(scoreForLocationAttempt(null, 100)).toBe(0);
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
