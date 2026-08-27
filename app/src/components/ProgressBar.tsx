import { cx } from '../lib/cx';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  percent: number;
  tone?: 'default' | 'onDark' | 'gold';
  fill?: 'default' | 'bright';
  height?: number;
}

export function ProgressBar({ percent, tone = 'default', fill = 'default', height }: ProgressBarProps) {
  const trackClass = cx(styles.track, tone !== 'default' && styles[tone]);
  const fillClass = cx(styles.fill, fill !== 'default' && styles[fill]);
  return (
    <div className={trackClass} style={height ? { height } : undefined}>
      <div className={fillClass} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}
