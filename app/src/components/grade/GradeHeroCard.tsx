import type { GradeProgress } from '../../lib/grade';
import { ProgressBar } from '../ProgressBar';
import styles from './GradeHeroCard.module.css';

interface GradeHeroCardProps {
  progress: GradeProgress;
  eyebrow?: string;
  subtitle: string;
  /** Optional small line under the subtitle (Result 화면의 "이전 최고기록 대비 +N점" 등, FR-CM-08). */
  note?: string;
}

export function GradeHeroCard({ progress, eyebrow, subtitle, note }: GradeHeroCardProps) {
  const { grade, percent, next, toNext } = progress;
  return (
    <div className={styles.card}>
      {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
      <div className={styles.iconCircle}>{grade.icon}</div>
      <span className={styles.name}>보훈 {grade.name}</span>
      <span className={styles.sub}>{subtitle}</span>
      {note && <span className={styles.note}>{note}</span>}
      <div className={styles.progressWrap}>
        <ProgressBar percent={percent} tone="gold" />
      </div>
      <span className={styles.toNext}>
        {next ? `다음 등급 「${next.name}」까지 ${toNext}점` : '최고 등급을 달성했습니다'}
      </span>
    </div>
  );
}
