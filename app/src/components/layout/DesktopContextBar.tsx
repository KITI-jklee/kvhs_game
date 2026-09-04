import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './DesktopContextBar.module.css';

interface DesktopContextBarProps {
  onBack: () => void;
  onPause?: () => void;
  children: ReactNode;
  onDark?: boolean;
  /** GameHud와 같은 이유(코드리뷰로 발견) - 인트로·일시정지 오버레이가 떠
   * 있는 동안 이 버튼들을 tab 포커스·클릭에서 뺀다. */
  disabled?: boolean;
}

/** Desktop-only floating status bar shown beneath BrandBar during gameplay. */
export function DesktopContextBar({ onBack, onPause, children, onDark, disabled }: DesktopContextBarProps) {
  return (
    <div className={cx(styles.wrap, onDark && styles.onDark)}>
      <button
        type="button"
        className={cx(styles.back, onDark && styles.onDark)}
        onClick={onBack}
        aria-label="뒤로 가기"
        disabled={disabled}
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
          disabled={disabled}
        >
          ❚❚
        </button>
      )}
    </div>
  );
}
