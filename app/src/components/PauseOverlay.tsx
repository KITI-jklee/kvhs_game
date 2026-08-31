import { Button } from './Button';
import { PromptModal } from './PromptModal';

interface PauseOverlayProps {
  onResume: () => void;
  onExit: () => void;
  onRestart: () => void;
}

/** HUD 우측 일시정지 버튼을 누르면 뜨는 게임 메뉴. */
export function PauseOverlay({ onResume, onExit, onRestart }: PauseOverlayProps) {
  return (
    <PromptModal
      icon={<span style={{ fontSize: 20, color: 'var(--color-accent-strong)', letterSpacing: 2 }}>❚❚</span>}
      title="일시정지"
      titleSize={19}
      desc="게임이 잠시 멈췄어요. 준비되면 이어서 진행하세요."
      ariaLabel="일시정지"
    >
      <Button variant="outlineMuted" onClick={onExit}>
        메인화면 가기
      </Button>
      <Button variant="accent" onClick={onResume}>
        ▶ 이어서 하기
      </Button>
      <Button variant="ink" onClick={onRestart}>
        ↻ 다시하기
      </Button>
    </PromptModal>
  );
}
