import type { GameSummary } from '../data/types';
import { GameGlyph } from './icons/GameGlyph';
import { IconTile } from './icons/IconTile';
import { Button } from './Button';
import styles from './GradeRecordModal.module.css';
import { useLockBodyScroll } from '../lib/useLockBodyScroll';

interface GradeRecordModalProps {
  game: GameSummary;
  onClose: () => void;
  onChallenge: () => void;
}

/** 등급 페이지의 "게임별 최고 기록" 중 아직 도전하지 않은 게임을 눌렀을 때 뜨는 안내 모달.
 * 도전 기록이 있는 게임은 대신 ShareOverlay(카드 저장/공유 + 다시 도전하기)가 뜬다. */
export function GradeRecordModal({ game, onClose, onChallenge }: GradeRecordModalProps) {
  useLockBodyScroll();

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label={`${game.title} 기록`}>
      <div className={styles.panel}>
        <IconTile size={44} background="var(--color-tint-1)" className={styles.icon}>
          <GameGlyph gameId={game.id} />
        </IconTile>
        <span className={styles.title}>{game.title}</span>
        <p className={styles.desc}>아직 도전하지 않은 게임이에요. 지금 플레이하고 기록을 남겨보세요!</p>
        <div className={styles.actions}>
          <Button variant="outlineMuted" onClick={onClose}>
            닫기
          </Button>
          <Button variant="accent" onClick={onChallenge}>
            지금 도전하기
          </Button>
        </div>
      </div>
    </div>
  );
}
