// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameData } from './gameDataContext';
import { GameDataProvider } from './loader';
import { validateLocations, validateMedicalCosts, validateTermPairs } from './validation';

const locations = Array.from({ length: 5 }, (_, i) => ({
  id: `h${i}`,
  name: `병원 ${i}`,
  addr_hint: '서울특별시 종로구',
  latitude: 37.5 + i * 0.01,
  longitude: 127 + i * 0.01,
  is_remote_area: i === 0,
  ...(i === 0 ? { region_note: '서울권' } : {}),
}));
const costs = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, name: `항목 ${i}`, category: '검사', cost: i + 1 }));
const terms = Array.from({ length: 24 }, (_, i) => ({
  id: `t${i}`,
  item_name: `용어 ${i}`,
  category: `분류 ${i % 10}`,
  cost: i,
}));

function responseFor(url: string) {
  const data = url.includes('hospital_locations') ? locations : url.includes('medical_costs') ? costs : terms;
  return { ok: true, status: 200, json: async () => data } as Response;
}

function Probe() {
  const { status, data, retry } = useGameData();
  return (
    <div>
      <span>{status}</span>
      <span>{data?.locations.length ?? 0}</span>
      <button type="button" onClick={retry}>retry</button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('게임 데이터 계약', () => {
  it('정상 데이터는 통과한다', () => {
    expect(validateLocations(locations)).toHaveLength(5);
    expect(validateMedicalCosts(costs)).toHaveLength(12);
    expect(validateTermPairs(terms)).toHaveLength(24);
  });

  it('중복 ID, 범위 밖 좌표, 부족한 분류를 거부한다', () => {
    expect(() => validateLocations([...locations.slice(0, 4), { ...locations[0], latitude: 99 }])).toThrow();
    expect(() => validateMedicalCosts([...costs.slice(0, 11), { ...costs[0] }])).toThrow(/duplicate ids/);
    expect(() => validateTermPairs(terms.map((term) => ({ ...term, category: '한 분류' })))).toThrow(/10 categories/);
  });
});

describe('GameDataProvider 재시도', () => {
  it('첫 로드가 실패하면 한 번 자동 재시도해 준비 상태가 된다', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls += 1;
      if (calls <= 3) throw new Error('temporary');
      return responseFor(url);
    }));
    render(<GameDataProvider><Probe /></GameDataProvider>);
    await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
    expect(screen.getByText('5')).toBeTruthy();
    expect(calls).toBe(6);
  });

  it('두 번 실패하면 오류 상태가 되고 사용자 재시도로 복구한다', async () => {
    let failing = true;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (failing) throw new Error('offline');
      return responseFor(url);
    }));
    render(<GameDataProvider><Probe /></GameDataProvider>);
    await waitFor(() => expect(screen.getByText('error')).toBeTruthy());
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
  });
});
