import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { HospitalLocation, HospitalName, MedicalTermPair } from './types';
import { GameDataContext, type GameData, type LoadStatus } from './gameDataContext';

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasUniqueIds(rows: Array<{ id: string }>): boolean {
  return new Set(rows.map((row) => row.id)).size === rows.length;
}

function validateLocations(value: unknown): HospitalLocation[] {
  if (!Array.isArray(value)) throw new Error('hospital_locations must be an array');
  const rows = value.filter((row): row is HospitalLocation => {
    if (!isRecord(row)) return false;
    return isNonEmptyString(row.id)
      && isNonEmptyString(row.name)
      && isNonEmptyString(row.addr_hint)
      && isFiniteNumber(row.latitude)
      && row.latitude >= 32.5
      && row.latitude <= 38.9
      && isFiniteNumber(row.longitude)
      && row.longitude >= 124
      && row.longitude <= 132
      && (row.region_note === undefined || isNonEmptyString(row.region_note));
  });
  if (rows.length !== value.length) throw new Error('hospital_locations contains an invalid record');
  if (rows.length < 5) throw new Error('hospital_locations requires at least 5 records');
  if (!rows.some((row) => row.region_note)) throw new Error('hospital_locations requires a region_note record');
  if (!hasUniqueIds(rows)) throw new Error('hospital_locations contains duplicate ids');
  return rows;
}

function validateNames(value: unknown): HospitalName[] {
  if (!Array.isArray(value)) throw new Error('hospital_names must be an array');
  const rows = value.filter((row): row is HospitalName => {
    if (!isRecord(row)) return false;
    return isNonEmptyString(row.id)
      && isNonEmptyString(row.name)
      && typeof row.is_real === 'boolean'
      && typeof row.reviewed === 'boolean'
      && (row.is_real || row.reviewed);
  });
  if (rows.length !== value.length) throw new Error('hospital_names contains an invalid record');
  if (rows.filter((row) => row.is_real).length < 14) throw new Error('hospital_names requires at least 14 real records');
  if (rows.filter((row) => !row.is_real).length < 6) throw new Error('hospital_names requires at least 6 reviewed fake records');
  if (!hasUniqueIds(rows)) throw new Error('hospital_names contains duplicate ids');
  return rows;
}

function validateTermPairs(value: unknown): MedicalTermPair[] {
  if (!Array.isArray(value)) throw new Error('medical_term_pairs must be an array');
  const rows = value.filter((row): row is MedicalTermPair => {
    if (!isRecord(row)) return false;
    return isNonEmptyString(row.id)
      && isNonEmptyString(row.item_name)
      && isNonEmptyString(row.kind_mid)
      && isFiniteNumber(row.cost)
      && row.cost >= 0;
  });
  if (rows.length !== value.length) throw new Error('medical_term_pairs contains an invalid record');
  if (rows.length < 24) throw new Error('medical_term_pairs requires at least 24 records');
  if (new Set(rows.map((row) => row.kind_mid)).size < 10) {
    throw new Error('medical_term_pairs requires at least 10 categories');
  }
  if (!hasUniqueIds(rows)) throw new Error('medical_term_pairs contains duplicate ids');
  if (new Set(rows.map((row) => row.item_name)).size !== rows.length) {
    throw new Error('medical_term_pairs contains duplicate item names');
  }
  return rows;
}

async function loadAll(): Promise<GameData> {
  const [rawLocations, rawNames, rawTermPairs] = await Promise.all([
    fetchJson('/data/hospital_locations.json'),
    fetchJson('/data/hospital_names.json'),
    fetchJson('/data/medical_term_pairs.json'),
  ]);
  const locations = validateLocations(rawLocations);
  const names = validateNames(rawNames);
  const termPairs = validateTermPairs(rawTermPairs);
  return { locations, names, termPairs };
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
