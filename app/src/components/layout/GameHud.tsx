import styles from './GameHud.module.css';

interface GameHudProps {
  onBack?: () => void;
  onPause?: () => void;
  eyebrow: string;
  title: string;
  score?: { label: string; value: string | number };
  /** 다른 오버레이(인트로·일시정지)가 이미 떠 있는 동안 이 버튼들을 tab
   * 포커스·클릭 모두에서 뺀다 - 백드롭은 클릭만 막고 키보드 Tab은 DOM 순서를
   * 그대로 따라가서, 시각적으로 가려진 이 버튼에 포커스가 가 Enter로 눌리면
   * 오버레이가 이중으로 뜨는 문제가 있었다(코드리뷰로 발견, useLockBodyScroll
   * 참고). */
  disabled?: boolean;
}

/**
 * Mobile/tablet in-game header: back circle + eyebrow/title + optional score
 * + optional pause button (FR-CM-05: HUD 우측 일시정지/나가기 버튼).
 * Hidden on desktop, where BrandBar plus a page-specific context bar take over.
 */
export function GameHud({ onBack, onPause, eyebrow, title, score, disabled }: GameHudProps) {
  return (
    <div className={styles.hud}>
      {onBack && (
        <button
          type="button"
          className={styles.back}
          onClick={onBack}
          aria-label="뒤로 가기"
          disabled={disabled}
        >
          ←
        </button>
      )}
      <div className={styles.center}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <span className={styles.title}>{title}</span>
      </div>
      {score && (
        <div className={styles.right}>
          <span className={styles.scoreLabel}>{score.label}</span>
          <span className={styles.scoreVal}>{score.value}</span>
        </div>
      )}
      {onPause && (
        <button
          type="button"
          className={styles.pause}
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
