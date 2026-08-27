import { useMemo, type CSSProperties } from 'react';
import styles from './Confetti.module.css';

const COLORS = [
  'var(--color-accent)',
  'var(--color-accent-soft)',
  'var(--color-accent-pale)',
  'var(--color-fake)',
  'var(--color-pin)',
  '#f0b429',
];

const PIECE_COUNT = 20;

interface Piece {
  left: number;
  size: number;
  color: string;
  rounded: boolean;
  swayX: number;
  swayY: number;
  dx: number;
  dy: number;
  rotateMid: number;
  rotate: number;
  delay: number;
  duration: number;
}

/** 시작점과 지연을 분산한 반복 낙하 조각을 만든다. */
function makePieces(): Piece[] {
  return Array.from({ length: PIECE_COUNT }, () => {
    const fall = 130 + Math.random() * 90;
    const drift = (Math.random() - 0.5) * 70;
    const duration = 1.6 + Math.random() * 1;
    return {
      left: 4 + Math.random() * 92,
      size: 6 + Math.random() * 7,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rounded: Math.random() < 0.35,
      swayX: -drift * 0.6,
      swayY: fall * 0.45,
      dx: drift,
      dy: fall,
      rotateMid: (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 80),
      rotate: (Math.random() < 0.5 ? -1 : 1) * (140 + Math.random() * 220),
      delay: Math.random() * duration,
      duration,
    };
  });
}

/** 부모는 `position: relative`와 `overflow: hidden`이어야 한다. */
export function Confetti() {
  const pieces = useMemo(() => makePieces(), []);
  return (
    <>
      {pieces.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className={styles.piece}
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: p.rounded ? '50%' : 2,
              '--swayX': `${p.swayX}px`,
              '--swayY': `${p.swayY}px`,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--rotateMid': `${p.rotateMid}deg`,
              '--rotate': `${p.rotate}deg`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}
