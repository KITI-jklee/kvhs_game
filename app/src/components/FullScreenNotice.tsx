import type { ReactNode } from 'react';
import { BrandBar } from './layout/BrandBar';
import { Button } from './Button';
import styles from './FullScreenNotice.module.css';

interface FullScreenNoticeProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/** 기능설계서 8장: 정적 JSON 로드 실패 시 안내 문구 + 재시도/메인 복귀 버튼. */
export function FullScreenNotice({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: FullScreenNoticeProps) {
  return (
    <div className={styles.page}>
      <BrandBar variant="game" />
      <div className={styles.body}>
        {icon && <div className={styles.icon}>{icon}</div>}
        <span className={styles.title}>{title}</span>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <div className={styles.actions}>
          {actionLabel && onAction && (
            <Button variant="accent" style={{ width: 'auto', padding: '13px 26px' }} onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button variant="outlineMuted" style={{ width: 'auto', padding: '13px 26px' }} onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
