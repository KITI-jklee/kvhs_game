import type { CSSProperties } from 'react';

const PIECES: CSSProperties[] = [
  { left: '14%', top: '9%', width: 9, height: 14, background: 'var(--color-accent)', borderRadius: 2, transform: 'rotate(24deg)' },
  { right: '24%', top: '14%', width: 9, height: 14, background: 'var(--color-accent)', borderRadius: 2, transform: 'rotate(-32deg)' },
  { right: '14%', top: '22%', width: 9, height: 14, background: 'var(--color-fake)', borderRadius: 2, transform: 'rotate(48deg)' },
  { left: '22%', top: '24%', width: 8, height: 8, background: 'var(--color-accent-pale)', borderRadius: '50%' },
];

/** Purely decorative confetti pieces for the "게임 완료!" result hero. Parent must be `position: relative`. */
export function Confetti() {
  return (
    <>
      {PIECES.map((style, i) => (
        <div key={i} aria-hidden style={{ position: 'absolute', ...style }} />
      ))}
    </>
  );
}
