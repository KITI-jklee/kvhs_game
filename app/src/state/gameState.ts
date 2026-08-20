import { createContext, useContext } from 'react';
import type { GameId, Grade } from '../data/types';
import type { GradeProgress } from '../lib/grade';
import type { BestScores } from '../lib/storage';

export interface StatTile { icon: string; label: string; value: string; }
export interface DetailChip { icon?: string; label: string; value: string; badge?: string; }
export interface PlayResult {
  gameId: GameId;
  title: string;
  score: number;
  stats: StatTile[];
  detailsTitle: string;
  details: DetailChip[];
  note?: string;
}
export interface FinishedResult extends PlayResult {
  prevBest: number;
  diff: number;
  isNewBest: boolean;
  gradeProgress: GradeProgress;
}
export interface GameContextValue {
  grades: Grade[];
  bestScores: BestScores;
  overallScore: number;
  overallProgress: GradeProgress;
  lastResult: FinishedResult | null;
  finishGame: (result: PlayResult) => void;
}

export const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
}
