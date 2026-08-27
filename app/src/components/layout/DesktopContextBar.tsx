import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
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
    <div className={cx(styles.wrap, onDark && styles.onDark)}>
      <button
        type="button"
        className={cx(styles.back, onDark && styles.onDark)}
        onClick={onBack}
        aria-label="뒤로 가기"
      >
        ←
      </button>
      <div className={styles.content}>{children}</div>
      {onPause && (
        <button
          type="button"
          className={cx(styles.pause, onDark && styles.onDark)}
          onClick={onPause}
          aria-label="일시정지"
        >
          ❚❚
        </button>
      )}
    </div>
  );
}
