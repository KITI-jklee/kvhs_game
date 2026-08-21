import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGrades } from '../data/provider';
import { overallScoreFromBestScores, readBestScores, readLastResult, recordResult } from './storage';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const localStorage = new MemoryStorage();
vi.stubGlobal('window', { localStorage });

describe('localStorage 최고기록', () => {
  beforeEach(() => localStorage.clear());

  it('손상된 JSON은 초기 점수로 복구한다', () => {
    localStorage.setItem('bohun_arcade.best_scores', '{broken');
    expect(readBestScores()).toEqual({ location: 0, medical_cost: 0, term_match: 0 });
  });

  it('게임별 기록을 분리하고 더 높은 점수만 갱신한다', () => {
    recordResult('location', 300, getGrades());
    recordResult('medical_cost', 250, getGrades());
    recordResult('location', 200, getGrades());
    expect(readBestScores()).toEqual({ location: 300, medical_cost: 250, term_match: 0 });
  });

  it('최근 결과를 점수 범위와 등급으로 저장한다', () => {
    recordResult('term_match', 999, getGrades());
    const result = readLastResult();
    expect(result?.score).toBe(500);
    expect(result?.game).toBe('term_match');
    expect(result?.grade).toContain('마스터');
  });
});

describe('종합 점수: 플레이해본 게임만 평균', () => {
  it('하나도 안 플레이했으면 0점이다', () => {
    expect(overallScoreFromBestScores({ location: 0, medical_cost: 0, term_match: 0 })).toBe(0);
  });

  it('미도전(0점) 게임은 평균에서 빼고, 플레이한 게임끼리만 평균 낸다', () => {
    // 500 + 150을 안 해본 term_match(0점)까지 셋이 나누면 217점이 되어
    // "몰라서 0점"과 "아직 안 해봄"을 같이 취급하는 셈이라 부당하다 -
    // 플레이한 두 게임(500, 150)만으로 평균 내면 325점이어야 한다.
    expect(overallScoreFromBestScores({ location: 500, medical_cost: 150, term_match: 0 })).toBe(325);
  });

  it('전부 플레이했으면 세 게임 평균을 낸다', () => {
    expect(overallScoreFromBestScores({ location: 300, medical_cost: 300, term_match: 300 })).toBe(300);
  });
});
