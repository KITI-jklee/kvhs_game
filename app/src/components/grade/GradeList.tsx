import type { Grade } from '../../data/types';
import { cx } from '../../lib/cx';
import styles from './GradeList.module.css';

interface GradeListProps {
  grades: Grade[];
  currentIndex: number;
}

export function GradeList({ grades, currentIndex }: GradeListProps) {
  return (
    <div className={styles.list}>
      {grades.map((g, i) => {
        const isCurrent = i === currentIndex;
        const isAchieved = i < currentIndex;
        const markLabel = isCurrent ? '현재' : isAchieved ? '달성' : '잠김';
        return (
          <div
            key={g.name}
            className={cx(styles.item, isCurrent && styles.current, i > currentIndex && styles.locked)}
          >
            <span className={styles.icon}>{g.icon}</span>
            <div className={styles.body}>
              <span className={styles.name}>{g.name}</span>
              <span className={styles.range}>{g.range}</span>
            </div>
            <span className={cx(styles.mark, isCurrent && styles.current)}>{markLabel}</span>
          </div>
        );
      })}
    </div>
  );
}
