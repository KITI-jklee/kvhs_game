import type { GameId } from '../../data/types';
import { HospitalGlyph, LocationGlyph, MatchGlyph } from './Glyphs';

/** 게임 고유 글리프 - 등급 이모지와 달리 게임끼리 절대 겹치지 않는다. */
export function GameGlyph({ gameId, accent = 'var(--color-ink)' }: { gameId: GameId; accent?: string }) {
  if (gameId === 'location') return <LocationGlyph accent={accent} />;
  if (gameId === 'fake_hospital') return <HospitalGlyph accent={accent} size={22} />;
  return <MatchGlyph accent={accent} />;
}
