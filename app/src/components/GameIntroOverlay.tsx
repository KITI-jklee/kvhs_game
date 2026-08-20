import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './GameIntroOverlay.module.css';
import { useLockBodyScroll } from '../lib/useLockBodyScroll';

export interface IntroRule {
  color: string;
  text: ReactNode;
}

interface GameIntroOverlayProps {
  title: string;
  rules: IntroRule[];
  note?: string;
  seconds?: number;
  onDone: () => void;
}

/**
 * SCR-01 게임 설명 - 게임 페이지 진입 시 규칙을 보여주고 카운트다운 후
 * 자동으로 실제 플레이를 시작한다(FR-CM-01). 카운트다운 중에는 각 게임의
 * 타이머를 멈춰둬야 하므로, 호출부는 `onDone`이 불릴 때까지 게임 로직을
 * 시작하지 않아야 한다.
 */
export function GameIntroOverlay({ title, rules, note, seconds = 3, onDone }: GameIntroOverlayProps) {
  const [count, setCount] = useState(seconds);

  useLockBodyScroll();

  useEffect(() => {
    if (count <= 0) {
      onDone();
      return;
    }
    const id = window.setTimeout(() => setCount((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label={`${title} 게임 설명`}>
      <div className={styles.panel}>
        <span className={styles.count}>{count > 0 ? count : '시작!'}</span>
        <span className={styles.title}>{title}</span>
        <ul className={styles.rules}>
          {rules.map((r, i) => (
            <li key={i} className={styles.rule}>
              <span className={styles.dot} style={{ background: r.color }} />
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
        {note && <span className={styles.note}>{note}</span>}
        <button type="button" className={styles.skip} onClick={onDone}>
          바로 시작하기 →
        </button>
      </div>
    </div>
  );
}
