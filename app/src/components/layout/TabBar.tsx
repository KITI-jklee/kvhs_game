import { useLocation, useNavigate } from 'react-router-dom';
import styles from './TabBar.module.css';

const TABS = [
  { icon: '🎮', label: '게임', to: '/' },
  { icon: '🏆', label: '등급', to: '/grade' },
  { icon: '📊', label: '기록', to: '/result' },
];

export function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className={styles.bar}>
      {TABS.map((tab) => (
        <button
          key={tab.to}
          type="button"
          className={[styles.tab, location.pathname === tab.to ? styles.active : ''].join(' ')}
          onClick={() => navigate(tab.to)}
        >
          <span className={styles.icon}>{tab.icon}</span>
          <span className={styles.label}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
