import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandBar } from '../components/layout/BrandBar';
import { Confetti } from '../components/Confetti';
import { GameGlyph } from '../components/icons/GameGlyph';
import { IconTile } from '../components/icons/IconTile';
import { GradeHeroCard } from '../components/grade/GradeHeroCard';
import { ShareOverlay } from '../components/ShareOverlay';
import { Button } from '../components/Button';
import { useGame } from '../state/gameState';
import { getGames } from '../data/provider';
import styles from './Result.module.css';

/** 등급별 응원 한줄. "이전 최고기록 대비" 수치는 별도 note로 항상 함께 보여준다(FR-CM-08). */
const GRADE_TAGLINES: Record<string, string> = {
  새싹: '보훈의료 데이터와 첫 인사를 나눴어요!',
  탐험가: '보훈데이터 아케이드의 길을 제법 잘 찾고 있네요',
  길잡이: '이제 보훈의료 데이터가 제법 익숙해지고 있어요',
  척척박사: '보훈의료 데이터 척척박사에 가까워지고 있어요',
  마스터: '보훈데이터 마스터! 정말 대단해요',
};

export function Result() {
  const navigate = useNavigate();
  const { lastResult } = useGame();
  const games = getGames();
  const [sharing, setSharing] = useState(false);

  if (!lastResult) {
    return (
      <div className={styles.page}>
        <BrandBar variant="game" />
        <div className={styles.empty}>
          <span className={styles.title} style={{ fontSize: 20 }}>
            아직 플레이한 게임이 없어요
          </span>
          <p className={styles.subtitle}>게임을 먼저 플레이하면 결과가 여기에 표시됩니다.</p>
          <Button
            variant="accent"
            style={{ width: 'auto', padding: '13px 26px' }}
            onClick={() => navigate('/')}
          >
            게임 하러 가기
          </Button>
        </div>
      </div>
    );
  }

  const replayPath = games.find((g) => g.id === lastResult.gameId)?.path ?? '/';
  const { grade } = lastResult.gradeProgress;
  const diffLabel = `${lastResult.diff >= 0 ? '+' : ''}${lastResult.diff}점`;
  const recordNote = lastResult.isNewBest
    ? `🎉 개인 최고기록 경신! 이전 최고기록 대비 ${diffLabel}`
    : `이전 최고기록 대비 ${diffLabel} · 최고기록 ${lastResult.prevBest}점`;

  return (
    <div className={styles.page}>
      <BrandBar variant="game" />

      <section className={styles.hero}>
        <Confetti />
        <IconTile size={46} background="var(--color-tint-1)" className={styles.icon}>
          <GameGlyph gameId={lastResult.gameId} />
        </IconTile>
        <span className={styles.eyebrow}>GAME COMPLETE</span>
        <span className={styles.title}>게임 완료!</span>
        <span className={styles.subtitle}>{lastResult.title} · 이번 판 점수</span>
        <div className={styles.scoreRow}>
          <span className={styles.scoreVal}>{lastResult.score}</span>
          <span className={styles.scoreMax}>/ 500점</span>
        </div>
      </section>

      <section className={styles.section}>
        <GradeHeroCard
          progress={lastResult.gradeProgress}
          eyebrow="나의 보훈 등급"
          subtitle={GRADE_TAGLINES[grade.name] ?? '수고하셨어요!'}
          note={recordNote}
        />

        <div className={styles.statTiles}>
          {lastResult.stats.map((tile) => (
            <div key={tile.label} className={styles.statTile}>
              <span className={styles.statTileIcon}>{tile.icon}</span>
              <span className={styles.statTileLabel}>{tile.label}</span>
              <span className={styles.statTileValue}>{tile.value}</span>
            </div>
          ))}
        </div>

        <div className={styles.details}>
          <span className={styles.detailsEyebrow}>ROUND DETAILS</span>
          <span className={styles.detailsTitle}>{lastResult.detailsTitle}</span>
          <div className={styles.detailsRow}>
            {lastResult.details.map((d, i) => (
              <div key={`${d.label}-${i}`} className={styles.detailChip}>
                {d.icon && <span className={styles.detailChipIcon}>{d.icon}</span>}
                <span className={styles.detailChipLabel}>{d.label}</span>
                <span className={styles.detailChipValue}>{d.value}</span>
                {d.badge && <span className={styles.detailChipBadge}>{d.badge}</span>}
                {d.tag && <span className={styles.detailChipTag}>{d.tag}</span>}
              </div>
            ))}
          </div>
          {lastResult.note && <span className={styles.detailsNote}>{lastResult.note}</span>}
        </div>

        <button type="button" className={styles.previewPanel} onClick={() => setSharing(true)}>
          <div className={styles.previewText}>
            <span className={styles.previewEyebrow}>GRADE CARD PREVIEW</span>
            <span className={styles.previewTitle}>획득한 보훈 등급을 간직해 보세요</span>
            <span className={styles.previewDesc}>
              카드를 누르면 점수와 보훈 등급이 함께 기록되는 카드 이미지를 저장·공유할 수 있습니다.
            </span>
          </div>
          <div className={styles.previewCard}>
            <span className={styles.previewCardTag}>VETERANS DATA ARCADE</span>
            <span className={styles.previewCardLabel}>보훈데이터 아케이드 결과카드</span>
            <span className={styles.previewCardScore}>{lastResult.score} / 500점</span>
            <span className={styles.previewCardGrade}>보훈 {grade.name}</span>
          </div>
        </button>

        <div className={styles.actions}>
          <Button variant="accent" onClick={() => navigate(replayPath)}>
            ↻ 다시 도전하기
          </Button>
          <Button variant="outlineMuted" onClick={() => navigate('/')}>
            다른 게임 하기
          </Button>
        </div>

        <div className={styles.infoBox}>
          <span className={styles.infoIcon}>i</span>
          <div className={styles.infoText}>
            <span className={styles.infoTitle}>
              한국보훈복지의료공단 공공데이터 활용 안내
            </span>
            <span className={styles.infoSub}>본 게임의 점수와 등급은 재미를 위한 요소이며, 진료 정보는 해당 병원 및 공단에 문의해주세요.</span>
          </div>
        </div>
      </section>

      {sharing && <ShareOverlay result={lastResult} grade={grade} onClose={() => setSharing(false)} />}
    </div>
  );
}
