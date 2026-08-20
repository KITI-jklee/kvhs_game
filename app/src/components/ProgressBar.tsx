import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  percent: number;
  tone?: 'default' | 'onDark' | 'gold';
  fill?: 'default' | 'bright';
  height?: number;
}

export function ProgressBar({ percent, tone = 'default', fill = 'default', height }: ProgressBarProps) {
  const trackClass = [styles.track, tone !== 'default' ? styles[tone] : ''].filter(Boolean).join(' ');
  const fillClass = [styles.fill, fill !== 'default' ? styles[fill] : ''].filter(Boolean).join(' ');
  return (
    <div className={trackClass} style={height ? { height } : undefined}>
      <div className={fillClass} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}
