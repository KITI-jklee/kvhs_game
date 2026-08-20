import type { Grade } from '../../data/types';
import styles from './GradeChipRow.module.css';

interface GradeChipRowProps {
  grades: Grade[];
  currentGrade: Grade;
  onSelect: () => void;
}

export function GradeChipRow({ grades, currentGrade, onSelect }: GradeChipRowProps) {
  return (
    <div className={styles.row}>
      {grades.map((g) => (
        <button
          key={g.name}
          type="button"
          onClick={onSelect}
          className={[styles.chip, g.name === currentGrade.name ? styles.current : ''].join(' ')}
        >
          <span className={styles.chipIcon}>{g.icon}</span>
          {g.name}
        </button>
      ))}
    </div>
  );
}
