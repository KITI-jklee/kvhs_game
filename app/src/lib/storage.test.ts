import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGrades } from '../data/provider';
import {
  overallScoreFromBestScores,
  readBestScores,
  readLastResult,
  readPlayedGames,
  recordResult,
} from './storage';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const localStorage = new MemoryStorage();
vi.stubGlobal('window', { localStorage });

afterEach(() => vi.restoreAllMocks());

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

  it('played_games가 없는 기존 사용자는 양수인 최고기록을 플레이 기록으로 마이그레이션한다', () => {
    localStorage.setItem('bohun_arcade.best_scores', JSON.stringify({
      location: 300,
      medical_cost: 0,
      term_match: 200,
    }));

    expect(readPlayedGames()).toEqual({ location: true, medical_cost: false, term_match: true });
    expect(JSON.parse(localStorage.getItem('bohun_arcade.played_games') ?? '')).toEqual({
      location: true,
      medical_cost: false,
      term_match: true,
    });
  });

  it('일부 played_games 필드만 있으면 기존 최고기록으로 누락 필드만 보완한다', () => {
    localStorage.setItem('bohun_arcade.best_scores', JSON.stringify({ location: 200, medical_cost: 300, term_match: 0 }));
    localStorage.setItem('bohun_arcade.played_games', JSON.stringify({ location: false }));
    expect(readPlayedGames()).toEqual({ location: false, medical_cost: true, term_match: false });
  });

  it('손상된 played_games와 저장소 읽기 예외는 안전한 초기값으로 복구한다', () => {
    localStorage.setItem('bohun_arcade.played_games', '{broken');
    expect(readPlayedGames()).toEqual({ location: false, medical_cost: false, term_match: false });
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readBestScores()).toEqual({ location: 0, medical_cost: 0, term_match: 0 });
    expect(readLastResult()).toBeNull();
  });

  it('유효 범위를 벗어나거나 숫자가 아닌 최고점은 0점으로 정리한다', () => {
    localStorage.setItem('bohun_arcade.best_scores', JSON.stringify({
      location: -1,
      medical_cost: 501,
      term_match: '300',
    }));
    expect(readBestScores()).toEqual({ location: 0, medical_cost: 0, term_match: 0 });
  });

  it('저장소 쓰기가 막혀도 결과 계산은 정상적으로 반환한다', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(recordResult('location', 300, getGrades())).toMatchObject({
      score: 300,
      bestScores: { location: 300, medical_cost: 0, term_match: 0 },
      playedGames: { location: true, medical_cost: false, term_match: false },
    });
  });

  it('낮은 점수로 재도전하면 최고점은 유지하고 최근 결과는 갱신한다', () => {
    recordResult('location', 400, getGrades());
    const outcome = recordResult('location', 100, getGrades());
    expect(outcome).toMatchObject({ prevBest: 400, score: 100, isNewBest: false });
    expect(readBestScores().location).toBe(400);
    expect(readPlayedGames().location).toBe(true);
    expect(readLastResult()?.score).toBe(100);
  });
});

describe('종합 점수: 플레이해본 게임만 평균', () => {
  it('하나도 안 플레이했으면 0점이다', () => {
    expect(overallScoreFromBestScores(
      { location: 0, medical_cost: 0, term_match: 0 },
      { location: false, medical_cost: false, term_match: false },
    )).toBe(0);
  });

  it('미도전 게임은 제외하지만 플레이해서 받은 0점은 평균에 포함한다', () => {
    expect(overallScoreFromBestScores(
      { location: 500, medical_cost: 0, term_match: 0 },
      { location: true, medical_cost: true, term_match: false },
    )).toBe(250);
  });

  it('전부 플레이했으면 세 게임 평균을 낸다', () => {
    expect(overallScoreFromBestScores(
      { location: 300, medical_cost: 300, term_match: 300 },
      { location: true, medical_cost: true, term_match: true },
    )).toBe(300);
  });
});
