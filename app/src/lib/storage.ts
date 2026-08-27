/** localStorage가 손상되거나 막혀도 기본값으로 계속 진행한다. */
import type { GameId, Grade } from '../data/types';
import { getGrade } from './grade';

const LS_BEST_SCORES = 'bohun_arcade.best_scores';
const LS_LAST_RESULT = 'bohun_arcade.last_result';

export type BestScores = Record<GameId, number>;

export interface LastResult {
  game: GameId;
  score: number;
  grade: string;
  played_at: string;
}

const EMPTY_BEST: BestScores = { location: 0, medical_cost: 0, term_match: 0 };

function isValidScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 500;
}

export function readBestScores(): BestScores {
  try {
    const raw = window.localStorage.getItem(LS_BEST_SCORES);
    if (!raw) return { ...EMPTY_BEST };
    const parsed = JSON.parse(raw) as Partial<BestScores>;
    return {
      location: isValidScore(parsed.location) ? parsed.location : 0,
      medical_cost: isValidScore(parsed.medical_cost) ? parsed.medical_cost : 0,
      term_match: isValidScore(parsed.term_match) ? parsed.term_match : 0,
    };
  } catch {
    return { ...EMPTY_BEST };
  }
}

function writeBestScores(next: BestScores): void {
  try {
    window.localStorage.setItem(LS_BEST_SCORES, JSON.stringify(next));
  } catch {
  }
}

export function readLastResult(): LastResult | null {
  try {
    const raw = window.localStorage.getItem(LS_LAST_RESULT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastResult>;
    if (!parsed.game || !isValidScore(parsed.score)) return null;
    return {
      game: parsed.game,
      score: parsed.score,
      grade: parsed.grade ?? '',
      played_at: parsed.played_at ?? '',
    };
  } catch {
    return null;
  }
}

function writeLastResult(result: LastResult): void {
  try {
    window.localStorage.setItem(LS_LAST_RESULT, JSON.stringify(result));
  } catch {
  }
}

/** 종합 점수는 미도전 게임을 제외한 평균이다. */
export function overallScoreFromBestScores(bestScores: BestScores): number {
  const played = Object.values(bestScores).filter((score) => score > 0);
  if (played.length === 0) return 0;
  return Math.round(played.reduce((sum, score) => sum + score, 0) / played.length);
}

export interface RecordResultOutcome {
  /** 0~500으로 클램프된 이번 판 점수. */
  score: number;
  prevBest: number;
  diff: number;
  isNewBest: boolean;
  grade: string;
  bestScores: BestScores;
}

/** 결과 화면 진입 시 한 번 호출한다. */
export function recordResult(game: GameId, score: number, grades: Grade[]): RecordResultOutcome {
  const clamped = Math.max(0, Math.min(500, Math.round(score)));
  const best = readBestScores();
  const prevBest = best[game] ?? 0;
  const diff = clamped - prevBest;
  const isNewBest = clamped > prevBest;

  const nextBest: BestScores = { ...best, [game]: isNewBest ? clamped : prevBest };
  if (isNewBest) writeBestScores(nextBest);

  const grade = getGrade(clamped, grades);
  writeLastResult({ game, score: clamped, grade, played_at: new Date().toISOString() });

  return { score: clamped, prevBest, diff, isNewBest, grade, bestScores: nextBest };
}
