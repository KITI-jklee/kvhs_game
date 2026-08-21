import type { CSSProperties } from 'react';
import type { GameSummary } from '../data/types';
import { IconTile } from './icons/IconTile';
import { CoinGlyph, LocationGlyph, MatchGlyph } from './icons/Glyphs';
import styles from './GameCard.module.css';

const ACCENTS = ['#0e7d66', '#2abf9e', '#7ed9c2'];
const ACCENT_TEXT = ['#ffffff', '#0b3a31', '#0b3a31'];
const TINTS = ['#e4f4ef', '#e9f8f3', '#effbf6'];

function Glyph({ index, accent }: { index: number; accent: string }) {
  if (index === 0) return <LocationGlyph accent={accent} />;
  if (index === 1) return <CoinGlyph accent={accent} size={20} />;
  return <MatchGlyph accent={accent} />;
}

interface GameCardProps {
  game: GameSummary;
  index: number;
  onPlay: () => void;
}

export function GameCard({ game, index, onPlay }: GameCardProps) {
  const accent = ACCENTS[index];
  const style = { '--accent': accent, '--accent-text': ACCENT_TEXT[index] } as CSSProperties;

  return (
    <div className={styles.card} style={style}>
      <div className={styles.topRow}>
        <span className={styles.no}>{game.no}</span>
        <IconTile background={TINTS[index]}>
          <Glyph index={index} accent={accent} />
        </IconTile>
      </div>
      <div className={styles.body}>
        <span className={styles.title}>{game.title}</span>
        <span className={styles.desc}>{game.desc}</span>
      </div>
      <button type="button" className={styles.play} onClick={onPlay}>
        플레이하기 ▶
      </button>
    </div>
  );
}
