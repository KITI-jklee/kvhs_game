import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogoMark } from '../icons/Glyphs';
import styles from './BrandBar.module.css';

const NAV_LINKS = [
  { label: '게임 홈', to: '/' },
  { label: '내 등급', to: '/grade' },
];

interface BrandBarProps {
  /** "home" stays visible at every width; "game" only appears on desktop, leaving mobile/tablet gameplay uncluttered. */
  variant?: 'home' | 'game';
  /** "dark" is used on the 찐병원 가짜병원 screen, which keeps its deep-mint background behind the bar. */
  tone?: 'light' | 'dark';
}

export function BrandBar({ variant = 'home', tone = 'light' }: BrandBarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <header
      className={[styles.bar, variant === 'game' ? styles.hiddenUntilDesktop : '', tone === 'dark' ? styles.dark : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.inner}>
        <Link to="/" className={styles.brand}>
          <LogoMark size={32} />
          <div className={styles.word}>
            <span className={styles.name}>보훈데이터 아케이드</span>
            <span className={styles.sub}>VETERANS DATA ARCADE</span>
          </div>
        </Link>

        {variant === 'home' && (
          <button type="button" className={styles.gradeBtn} onClick={() => navigate('/grade')}>
            내 등급
          </button>
        )}

        <nav className={styles.nav}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={[styles.navLink, location.pathname === link.to ? styles.active : ''].join(' ')}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
