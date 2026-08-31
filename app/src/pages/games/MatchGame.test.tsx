// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameDataContext } from '../../data/gameDataContext';
import type { MedicalTermPair } from '../../data/types';
import { GameProvider } from '../../state/GameContext';
import { MatchGame } from './MatchGame';

const termPairs: MedicalTermPair[] = Array.from({ length: 24 }, (_, i) => ({
  id: `term-${i}`,
  item_name: `항목-${i}`,
  kind_mid: `분류-${i}`,
  cost: i,
}));

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('짝맞추기 게임 타이머', () => {
  it('인트로와 카드 미리보기 동안 멈추고, 일시정지 중에도 증가하지 않는다', () => {
    render(
      <MemoryRouter>
        <GameDataContext.Provider value={{
          status: 'ready',
          data: { locations: [], medicalCosts: [], termPairs },
          retry: vi.fn(),
        }}>
          <GameProvider><MatchGame /></GameProvider>
        </GameDataContext.Provider>
      </MemoryRouter>,
    );

    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getAllByText('00:00').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /바로 시작하기/ }));
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getAllByText('00:00').length).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(2_000));
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getAllByText('00:02').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: '일시정지' })[0]);
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getAllByText('00:02').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /이어서 하기/ }));
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getAllByText('00:03').length).toBeGreaterThan(0);
  });
});
