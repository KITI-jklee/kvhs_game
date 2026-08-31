// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameProvider } from './GameContext';
import { useGame } from './gameState';

function Probe() {
  const { finishGame, lastResult, bestScores, playedGames, overallScore } = useGame();
  return (
    <div>
      <button type="button" onClick={() => finishGame({
        gameId: 'location',
        title: '완료',
        score: 0,
        stats: [],
        detailsTitle: '상세',
        details: [],
      })}>finish-zero</button>
      <span data-testid="result">{lastResult?.score ?? '-'}</span>
      <span data-testid="best">{bestScores.location}</span>
      <span data-testid="played">{String(playedGames.location)}</span>
      <span data-testid="overall">{overallScore}</span>
    </div>
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('게임 완료 통합 흐름', () => {
  it('0점 완료도 최근 결과와 플레이 여부에 반영하고 종합 점수를 계산한다', () => {
    render(<GameProvider><Probe /></GameProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'finish-zero' }));
    expect(screen.getByTestId('result').textContent).toBe('0');
    expect(screen.getByTestId('best').textContent).toBe('0');
    expect(screen.getByTestId('played').textContent).toBe('true');
    expect(screen.getByTestId('overall').textContent).toBe('0');
    expect(JSON.parse(window.localStorage.getItem('bohun_arcade.played_games') ?? '{}').location).toBe(true);
  });
});
