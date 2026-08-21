import { useNavigate } from 'react-router-dom';
import { BrandBar } from '../components/layout/BrandBar';
import { GameHud } from '../components/layout/GameHud';
import { GradeHeroCard } from '../components/grade/GradeHeroCard';
import { GradeList } from '../components/grade/GradeList';
import { GameGlyph } from '../components/icons/GameGlyph';
import { IconTile } from '../components/icons/IconTile';
import { Button } from '../components/Button';
import { useGame } from '../state/gameState';
import { getGames, gradeForScore } from '../data/provider';
import styles from './Grade.module.css';

export function Grade() {
  const navigate = useNavigate();
  const { grades, bestScores, overallScore, overallProgress } = useGame();
  const games = getGames();

  return (
    <div className={styles.page}>
      <BrandBar variant="game" />
      <GameHud onBack={() => navigate('/')} eyebrow="YOUR VETERANS GRADE" title="내 보훈 등급" />

      <section className={styles.heroPad}>
        <div className={styles.pageHeading}>
          <span className={styles.eyebrow}>YOUR ARCADE GRADE</span>
          <span className={styles.pageHeadingTitle}>지금 나의 보훈 아케이드 등급은?</span>
          <span className={styles.pageHeadingSub}>게임을 즐길수록 더 높은 등급에 도전할 수 있어요</span>
        </div>
        <div className={styles.heroInner}>
          <GradeHeroCard progress={overallProgress} subtitle={`플레이한 게임 평균 ${overallScore}점`} />
        </div>
      </section>

      <section className={styles.section}>
        <span className={styles.eyebrow}>게임별 최고 기록</span>
        <div className={styles.breakdown}>
          {games.map((game) => {
            const score = bestScores[game.id];
            const grade = gradeForScore(score, grades);
            return (
              <button key={game.id} type="button" className={styles.breakdownRow} onClick={() => navigate(game.path)}>
                <IconTile size={38} background="var(--color-tint-1)">
                  <GameGlyph gameId={game.id} />
                </IconTile>
                <div className={styles.breakdownBody}>
                  <span className={styles.breakdownName}>{game.title}</span>
                  <span className={styles.breakdownGrade}>보훈 {grade.name}</span>
                </div>
                <span className={styles.breakdownScore}>{score > 0 ? `${score}점` : '미도전'}</span>
              </button>
            );
          })}
        </div>

        <span className={styles.eyebrow}>ALL GRADES</span>
        <GradeList grades={grades} currentIndex={overallProgress.index} />

        <div className={styles.actions}>
          <Button variant="ink" onClick={() => navigate('/')}>
            게임 더 하기
          </Button>
        </div>
      </section>
    </div>
  );
}
