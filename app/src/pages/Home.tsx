import { useNavigate } from 'react-router-dom';
import { BrandBar } from '../components/layout/BrandBar';
import { GameCard } from '../components/GameCard';
import { GradeChipRow } from '../components/grade/GradeChipRow';
import { getGames } from '../data/provider';
import { useGame } from '../state/gameState';
import { cx } from '../lib/cx';
import styles from './Home.module.css';

export function Home() {
  const navigate = useNavigate();
  const games = getGames();
  const { grades, overallScore, overallProgress } = useGame();

  return (
    <div className={styles.page}>
      <BrandBar variant="home" />

      <section className={styles.hero}>
        <div className={styles.decorCircle}>
          <div className={styles.decorCircleInner} />
        </div>
        <span className={styles.eyebrow}>✦ 내 보훈 지식은 몇 등급일까?</span>
        <div className={styles.titleGroup}>
          <span className={styles.title}>알고 나면 더 유용한,</span>
          <span className={styles.titleOutline}>보훈 지식 퀴즈!</span>
        </div>
        <p className={styles.desc}>
          미니 게임 풀면서 보훈 지식도 쑥쑥!!
          <br />
          준비됐다면 아래 게임을 선택해 시작해보세요.
        </p>
        <div className={styles.chips}>
          <span className={styles.chip}>
            <span style={{ color: 'var(--color-accent-strong)' }}>✦</span>누구나 쉽게
          </span>
          <span className={styles.chip}>
            <span style={{ color: 'var(--color-accent)' }}>↻</span>3가지 미니 게임
          </span>
          <span className={styles.chip}>
            <span style={{ color: 'var(--color-ink)' }}>▮</span>보훈 마스터 칭호
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.cardGrid}>
          {games.map((game, i) => (
            <GameCard key={game.id} game={game} index={i} onPlay={() => navigate(game.path)} />
          ))}
        </div>
      </section>

      <section className={styles.gradeBandPad}>
        {/* 데스크톱: 등급 칩 나열형 배너 */}
        <button
          type="button"
          className={cx(styles.gradeBand, 'hide-until-desktop')}
          onClick={() => navigate('/grade')}
        >
          <div className={styles.gradeBandHead}>
            <span className={styles.sectionEyebrow}>YOUR ARCADE GRADE</span>
            <span className={styles.gradeBandTitle}>점수를 모아 나만의 보훈 등급을 확인하세요</span>
          </div>
          <div className={styles.gradeBandChips}>
            <GradeChipRow grades={grades} currentGrade={overallProgress.grade} />
          </div>
        </button>

        {/* 모바일·태블릿: 한 줄 요약 카드 */}
        <button
          type="button"
          className={cx(styles.gradeCompact, 'hide-on-desktop')}
          onClick={() => navigate('/grade')}
        >
          <span className={styles.gradeCompactIcon}>{overallProgress.grade.icon}</span>
          <div className={styles.gradeCompactBody}>
            <span className={styles.gradeCompactTitle}>내 보훈 등급 · {overallProgress.grade.name}</span>
            <span className={styles.gradeCompactSub}>
              평균 기록 {overallScore}점
              {overallProgress.next ? ` · 다음 등급까지 ${overallProgress.toNext}점` : ' · 최고 등급 달성!'}
            </span>
          </div>
          <span className={styles.gradeCompactArrow}>→</span>
        </button>
      </section>

      <footer className={styles.footer}>
        <span className={styles.footerNote}>© KITI (주)한국정보화기술원</span>
      </footer>
    </div>
  );
}
