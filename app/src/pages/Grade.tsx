import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandBar } from '../components/layout/BrandBar';
import { GameHud } from '../components/layout/GameHud';
import { GradeHeroCard } from '../components/grade/GradeHeroCard';
import { GradeList } from '../components/grade/GradeList';
import { GameGlyph } from '../components/icons/GameGlyph';
import { IconTile } from '../components/icons/IconTile';
import { Button } from '../components/Button';
import { ShareOverlay } from '../components/ShareOverlay';
import { GradeRecordModal } from '../components/GradeRecordModal';
import { useGame } from '../state/gameState';
import { getGames, gradeForScore } from '../data/provider';
import type { GameSummary, Grade as GradeTier } from '../data/types';
import styles from './Grade.module.css';

/** 행 클릭 시점에 이미 계산돼 있던 점수·등급을 그대로 들고 다닌다 - 모달을 열
 * 때 gradeForScore를 다시 호출하지 않기 위함. */
interface ActiveGame {
  game: GameSummary;
  score: number;
  grade: GradeTier;
  played: boolean;
}

export function Grade() {
  const navigate = useNavigate();
  const { grades, bestScores, playedGames, overallScore, overallProgress } = useGame();
  const games = getGames();
  const [active, setActive] = useState<ActiveGame | null>(null);

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
            const played = playedGames[game.id];
            return (
              <button
                key={game.id}
                type="button"
                className={styles.breakdownRow}
                onClick={() => setActive({ game, score, grade, played })}
              >
                <IconTile size={38} background="var(--color-tint-1)">
                  <GameGlyph gameId={game.id} />
                </IconTile>
                <div className={styles.breakdownBody}>
                  <span className={styles.breakdownName}>{game.title}</span>
                  <span className={styles.breakdownGrade}>보훈 {grade.name}</span>
                </div>
                <span className={styles.breakdownScore}>{played ? `${score}점` : '미도전'}</span>
                <span className={styles.breakdownChevron} aria-hidden="true">›</span>
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

      {active && (active.played ? (
        <ShareOverlay
          result={{ gameId: active.game.id, title: active.game.title, score: active.score }}
          grade={active.grade}
          onClose={() => setActive(null)}
          onReplay={() => navigate(active.game.path)}
        />
      ) : (
        <GradeRecordModal
          game={active.game}
          onClose={() => setActive(null)}
          onChallenge={() => navigate(active.game.path)}
        />
      ))}
    </div>
  );
}
