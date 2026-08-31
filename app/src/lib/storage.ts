/** localStorage가 손상되거나 막혀도 기본값으로 계속 진행한다. */
import type { GameId, Grade } from '../data/types';
import { getGrade } from './grade';

const LS_BEST_SCORES = 'bohun_arcade.best_scores';
const LS_LAST_RESULT = 'bohun_arcade.last_result';
const LS_PLAYED_GAMES = 'bohun_arcade.played_games';

export type BestScores = Record<GameId, number>;
/** 게임을 한 번이라도 플레이했는지 여부 - `bestScores`의 0점만으로는 "안 해봄"과
 * "해서 0점 받음"을 구분할 수 없어서(둘 다 0으로 저장됨) 별도로 둔다. */
export type PlayedGames = Record<GameId, boolean>;

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

const EMPTY_PLAYED: PlayedGames = { location: false, medical_cost: false, term_match: false };

export function readPlayedGames(): PlayedGames {
  try {
    const raw = window.localStorage.getItem(LS_PLAYED_GAMES);
    const best = readBestScores();
    if (!raw) {
      // `played_games` 키가 도입되기 전에 쌓인 기존 기록은 양수인 최고점으로
      // 플레이 여부를 복원한다. 과거의 0점은 미도전과 구별할 정보가 없다.
      const migrated: PlayedGames = {
        location: best.location > 0,
        medical_cost: best.medical_cost > 0,
        term_match: best.term_match > 0,
      };
      writePlayedGames(migrated);
      return migrated;
    }
    const parsed = JSON.parse(raw) as Partial<PlayedGames>;
    return {
      location: parsed.location ?? best.location > 0,
      medical_cost: parsed.medical_cost ?? best.medical_cost > 0,
      term_match: parsed.term_match ?? best.term_match > 0,
    };
  } catch {
    return { ...EMPTY_PLAYED };
  }
}

function writePlayedGames(next: PlayedGames): void {
  try {
    window.localStorage.setItem(LS_PLAYED_GAMES, JSON.stringify(next));
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
export function overallScoreFromBestScores(bestScores: BestScores, playedGames: PlayedGames): number {
  const scores = (Object.keys(bestScores) as GameId[])
    .filter((game) => playedGames[game])
    .map((game) => bestScores[game]);
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export interface RecordResultOutcome {
  /** 0~500으로 클램프된 이번 판 점수. */
  score: number;
  prevBest: number;
  diff: number;
  isNewBest: boolean;
  grade: string;
  bestScores: BestScores;
  playedGames: PlayedGames;
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

  // 최고기록 갱신 여부와 무관하게, 이번에 플레이했다는 사실 자체는 항상 기록한다
  // (0점을 받아도 "안 해봄"과 구분돼야 하므로).
  const played = readPlayedGames();
  const nextPlayed: PlayedGames = { ...played, [game]: true };
  if (!played[game]) writePlayedGames(nextPlayed);

  const grade = getGrade(clamped, grades);
  writeLastResult({ game, score: clamped, grade, played_at: new Date().toISOString() });

  return { score: clamped, prevBest, diff, isNewBest, grade, bestScores: nextBest, playedGames: nextPlayed };
}
