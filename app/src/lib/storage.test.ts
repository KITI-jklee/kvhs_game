import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGrades } from '../data/provider';
import { readBestScores, readLastResult, recordResult } from './storage';

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
