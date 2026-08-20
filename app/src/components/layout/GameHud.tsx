import styles from './GameHud.module.css';

interface GameHudProps {
  onBack?: () => void;
  onPause?: () => void;
  eyebrow: string;
  title: string;
  score?: { label: string; value: string | number };
}

/**
 * Mobile/tablet in-game header: back circle + eyebrow/title + optional score
 * + optional pause button (FR-CM-05: HUD 우측 일시정지/나가기 버튼).
 * Hidden on desktop, where BrandBar plus a page-specific context bar take over.
 */
export function GameHud({ onBack, onPause, eyebrow, title, score }: GameHudProps) {
  return (
    <div className={styles.hud}>
      {onBack && (
        <button type="button" className={styles.back} onClick={onBack} aria-label="뒤로 가기">
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
        <button type="button" className={styles.pause} onClick={onPause} aria-label="일시정지">
          ❚❚
        </button>
      )}
    </div>
  );
}
