import type { ReactNode } from 'react';
import styles from './DesktopContextBar.module.css';

interface DesktopContextBarProps {
  onBack: () => void;
  onPause?: () => void;
  children: ReactNode;
  onDark?: boolean;
}

/** Desktop-only floating status bar shown beneath BrandBar during gameplay. */
export function DesktopContextBar({ onBack, onPause, children, onDark }: DesktopContextBarProps) {
  return (
    <div className={[styles.wrap, onDark ? styles.onDark : ''].join(' ')}>
      <button
        type="button"
        className={[styles.back, onDark ? styles.onDark : ''].join(' ')}
        onClick={onBack}
        aria-label="뒤로 가기"
      >
        ←
      </button>
      <div className={styles.content}>{children}</div>
      {onPause && (
        <button
          type="button"
          className={[styles.pause, onDark ? styles.onDark : ''].join(' ')}
          onClick={onPause}
          aria-label="일시정지"
        >
          ❚❚
        </button>
      )}
    </div>
  );
}
