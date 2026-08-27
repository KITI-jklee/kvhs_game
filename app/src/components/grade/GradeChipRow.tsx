import type { Grade } from '../../data/types';
import { cx } from '../../lib/cx';
import styles from './GradeChipRow.module.css';

interface GradeChipRowProps {
  grades: Grade[];
  currentGrade: Grade;
  onSelect?: () => void;
}

export function GradeChipRow({ grades, currentGrade, onSelect }: GradeChipRowProps) {
  return (
    <div className={styles.row}>
      {grades.map((g) => (
        onSelect ? (
          <button
            key={g.name}
            type="button"
            onClick={onSelect}
            className={cx(styles.chip, g.name === currentGrade.name && styles.current)}
          >
            <span className={styles.chipIcon}>{g.icon}</span>
            {g.name}
          </button>
        ) : (
          <span key={g.name} className={cx(styles.chip, g.name === currentGrade.name && styles.current)}>
            <span className={styles.chipIcon}>{g.icon}</span>
            {g.name}
          </span>
        )
      ))}
    </div>
  );
}
