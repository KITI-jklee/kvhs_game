import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getGrades } from '../data/provider';
import { getGradeProgress } from '../lib/grade';
import {
  overallScoreFromBestScores,
  readBestScores,
  readPlayedGames,
  recordResult,
  type BestScores,
  type PlayedGames,
} from '../lib/storage';
import { GameContext, type FinishedResult, type GameContextValue, type PlayResult } from './gameState';

export function GameProvider({ children }: { children: ReactNode }) {
  const grades = useMemo(() => getGrades(), []);
  const [bestScores, setBestScores] = useState<BestScores>(() => readBestScores());
  const [playedGames, setPlayedGames] = useState<PlayedGames>(() => readPlayedGames());
  const [lastResult, setLastResult] = useState<FinishedResult | null>(null);

  const finishGame = useCallback(
    (result: PlayResult) => {
      const outcome = recordResult(result.gameId, result.score, grades);
      setBestScores(outcome.bestScores);
      setPlayedGames(outcome.playedGames);
      setLastResult({
        ...result,
        score: outcome.score,
        prevBest: outcome.prevBest,
        diff: outcome.diff,
        isNewBest: outcome.isNewBest,
        gradeProgress: getGradeProgress(outcome.score, grades),
      });
    },
    [grades],
  );

  const overallScore = overallScoreFromBestScores(bestScores);
  const overallProgress = useMemo(() => getGradeProgress(overallScore, grades), [overallScore, grades]);

  const value = useMemo<GameContextValue>(
    () => ({ grades, bestScores, playedGames, overallScore, overallProgress, lastResult, finishGame }),
    [grades, bestScores, playedGames, overallScore, overallProgress, lastResult, finishGame],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
