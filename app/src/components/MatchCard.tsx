import type { DeckCard } from '../lib/matchDeck';
import { formatWon } from '../lib/format';
import styles from './MatchCard.module.css';

interface MatchCardProps {
  card: DeckCard;
  faceUp: boolean;
  matched: boolean;
  onTap: () => void;
}

/**
 * 3D 카드 뒤집기: 두 면(뒷면/앞면)을 항상 함께 렌더링하고, `faceUp`에 따라
 * `.inner`를 rotateY(180deg)로 돌린다 - 조건부 렌더링으로 내용만 바꿔치기하지
 * 않으므로 실제 카드가 돌아가는 애니메이션이 나온다(참고 영상 반영).
 */
export function MatchCard({ card, faceUp, matched, onTap }: MatchCardProps) {
  const classes = [styles.card, matched ? styles.matched : ''].filter(Boolean).join(' ');

  return (
    <button type="button" className={classes} onClick={onTap} disabled={faceUp} aria-label={faceUp ? card.title : `카드 ${card.num}`}>
      <div className={[styles.inner, faceUp ? styles.flipped : ''].join(' ')}>
        <div className={[styles.face, styles.faceBack].join(' ')}>
          <div className={styles.markWrap}>
            <div className={[styles.bar, styles.barOutline].join(' ')} />
            <div className={[styles.bar, styles.barFill].join(' ')} />
            <div className={[styles.bar, styles.barOutline].join(' ')} />
          </div>
          <span className={styles.numStyle}>{card.num}</span>
        </div>

        <div className={[styles.face, styles.faceFront].join(' ')}>
          <span className={styles.eyebrow}>
            {card.kind === 'item' ? (
              <>
                <span className={styles.itemLabelShort}>진료 항목</span>
                <span className={styles.itemLabelLong}>비급여 진료 항목</span>
              </>
            ) : (
              '진료 분류'
            )}
          </span>
          <span className={styles.title}>{card.title}</span>
          {matched ? (
            <span className={styles.cost}>{formatWon(card.cost)}</span>
          ) : (
            <span className={styles.foot}>{card.kind === 'item' ? 'ITEM' : 'CATEGORY'}</span>
          )}
          {matched && <span className={styles.check}>✓</span>}
        </div>
      </div>
    </button>
  );
}
