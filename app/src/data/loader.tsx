import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { GameDataContext, type GameData, type LoadStatus } from './gameDataContext';
import { validateLocations, validateMedicalCosts, validateTermPairs } from './validation';

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function loadAll(): Promise<GameData> {
  const [rawLocations, rawMedicalCosts, rawTermPairs] = await Promise.all([
    fetchJson('/data/hospital_locations.json'),
    fetchJson('/data/medical_costs.json'),
    fetchJson('/data/medical_term_pairs.json'),
  ]);
  const locations = validateLocations(rawLocations);
  const medicalCosts = validateMedicalCosts(rawMedicalCosts);
  const termPairs = validateTermPairs(rawTermPairs);
  return { locations, medicalCosts, termPairs };
}

/**
 * 앱 시작 시 정적 JSON 3종을 1회 로드해 메모리에 유지한다(DR-04).
 * 기능설계서 8장: 로드 실패 시 1회 자동 재시도, 그래도 실패하면 에러 상태로
 * 전환해 안내 화면을 띄운다. `retry()`는 사용자가 다시 시도할 때 사용한다.
 */
export function GameDataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [data, setData] = useState<GameData | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await loadAll();
        if (!cancelled) {
          setData(first);
          setStatus('ready');
        }
      } catch {
        try {
          const retried = await loadAll();
          if (!cancelled) {
            setData(retried);
            setStatus('ready');
          }
        } catch {
          if (!cancelled) setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((current) => current + 1);
  }, []);

  return <GameDataContext.Provider value={{ status, data, retry }}>{children}</GameDataContext.Provider>;
}
