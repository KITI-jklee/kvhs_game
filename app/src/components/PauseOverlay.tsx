import { Button } from './Button';
import styles from './PauseOverlay.module.css';
import { useLockBodyScroll } from '../lib/useLockBodyScroll';

interface PauseOverlayProps {
  onResume: () => void;
  onExit: () => void;
  onRestart: () => void;
}

/** HUD 우측 일시정지 버튼을 누르면 뜨는 게임 메뉴. */
export function PauseOverlay({ onResume, onExit, onRestart }: PauseOverlayProps) {
  useLockBodyScroll();

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="일시정지">
      <div className={styles.panel}>
        <span className={styles.icon}>❚❚</span>
        <span className={styles.title}>일시정지</span>
        <p className={styles.desc}>게임이 잠시 멈췄어요. 준비되면 이어서 진행하세요.</p>
        <div className={styles.actions}>
          <Button variant="outlineMuted" onClick={onExit}>
            메인화면 가기
          </Button>
          <Button variant="accent" onClick={onResume}>
            ▶ 이어서 하기
          </Button>
          <Button variant="ink" onClick={onRestart}>
            ↻ 다시하기
          </Button>
        </div>
      </div>
    </div>
  );
}
