/**
 * 브라우저 localStorage 계약 (API 명세서 C장 / DB 설계서 03·06·08 시트).
 * 서버가 없으므로 개인 최고기록·등급 계산은 전부 여기서 처리한다.
 *
 * 키:
 *   bohun_arcade.best_scores = { location, medical_cost, term_match }  (각 0~500)
 *   bohun_arcade.last_result = { game, score, grade, played_at }
 *
 * 예외 처리 원칙(기능설계서 8장): localStorage 접근 불가(프라이버시 모드 등)
 * 또는 값 손상 시 prevBest=0으로 간주하고 조용히 진행한다. 저장 실패도
 * 화면을 막지 않는다.
 */
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
    // 저장 실패는 조용히 무시(기능설계서 8장)
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
    // 저장 실패는 조용히 무시
  }
}

export interface RecordResultOutcome {
  prevBest: number;
  diff: number;
  isNewBest: boolean;
  grade: string;
  bestScores: BestScores;
}

/**
 * DB 설계서 06_등급산정로직의 onResultScreenEnter(game, score)를 그대로 구현.
 * 결과 화면 진입 시(또는 게임 종료 시) 정확히 한 번 호출한다.
 */
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

  return { prevBest, diff, isNewBest, grade, bestScores: nextBest };
}
