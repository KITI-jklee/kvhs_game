import type { CSSProperties, ReactNode } from 'react';
import styles from './PromptModal.module.css';
import { useLockBodyScroll } from '../lib/useLockBodyScroll';

interface PromptModalProps {
  icon: ReactNode;
  title: string;
  titleSize?: number;
  desc: string;
  ariaLabel: string;
  /** 액션 버튼들 - 세로로 쌓인다. */
  children: ReactNode;
}

/** 화면 가운데 뜨는 아이콘+제목+설명+버튼 형태의 간단한 확인 모달 공통 뼈대.
 * PauseOverlay/GradeRecordModal이 각자 따로 복사해 갖고 있던 backdrop/panel
 * 마크업을 여기로 모았다 - 카드 이미지를 그리는 ShareOverlay, 카운트다운이
 * 있는 GameIntroOverlay처럼 구조 자체가 다른 모달은 대상이 아니다. */
export function PromptModal({ icon, title, titleSize, desc, ariaLabel, children }: PromptModalProps) {
  useLockBodyScroll();

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className={styles.panel} style={titleSize ? ({ '--prompt-title-size': `${titleSize}px` } as CSSProperties) : undefined}>
        <div className={styles.iconSlot}>{icon}</div>
        <span className={styles.title}>{title}</span>
        <p className={styles.desc}>{desc}</p>
        <div className={styles.actions}>{children}</div>
      </div>
    </div>
  );
}
