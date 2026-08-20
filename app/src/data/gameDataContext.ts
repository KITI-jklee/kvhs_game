import { createContext, useContext } from 'react';
import type { HospitalLocation, HospitalName, MedicalTermPair } from './types';

export interface GameData {
  locations: HospitalLocation[];
  names: HospitalName[];
  termPairs: MedicalTermPair[];
}

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface GameDataContextValue {
  status: LoadStatus;
  data: GameData | null;
  retry: () => void;
}

export const GameDataContext = createContext<GameDataContextValue | null>(null);

export function useGameData(): GameDataContextValue {
  const context = useContext(GameDataContext);
  if (!context) throw new Error('useGameData must be used within a GameDataProvider');
  return context;
}
