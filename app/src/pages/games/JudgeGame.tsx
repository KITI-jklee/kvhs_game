import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandBar } from '../../components/layout/BrandBar';
import { DesktopContextBar } from '../../components/layout/DesktopContextBar';
import { ProgressBar } from '../../components/ProgressBar';
import { IconTile } from '../../components/icons/IconTile';
import { HospitalGlyph } from '../../components/icons/Glyphs';
import { PauseOverlay } from '../../components/PauseOverlay';
import { GameIntroOverlay } from '../../components/GameIntroOverlay';
import { useGameData } from '../../data/gameDataContext';
import type { HospitalName } from '../../data/types';
import { useGame } from '../../state/gameState';
import { POINTS_PER_QUESTION, pickJudgeQuestions, timeForIndex } from '../../lib/judge';
import styles from './JudgeGame.module.css';

const REVEAL_HOLD_MS = 1400;
const PROGRESS_TRANSITION_MS = 250;

export function JudgeGame() {
  const navigate = useNavigate();
  const { finishGame } = useGame();
  const { data } = useGameData();
  const pool = data?.names ?? [];

  const [questions] = useState<HospitalName[]>(() => pickJudgeQuestions(pool));
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [pick, setPick] = useState<'real' | 'fake' | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [remainingMs, setRemainingMs] = useState(() => timeForIndex(0));
  const [paused, setPaused] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  const answeredRef = useRef(false);
  const timerExpiredRef = useRef(false);
  const pausedRef = useRef(false);
  const timeoutIdsRef = useRef<Set<number>>(new Set());
  const pendingTransitionsRef = useRef<Array<() => void>>([]);

  const scheduleTransition = useCallback((callback: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      timeoutIdsRef.current.delete(id);
      if (pausedRef.current) {
        pendingTransitionsRef.current.push(callback);
        return;
      }
      callback();
    }, delayMs);
    timeoutIdsRef.current.add(id);
  }, []);

  useEffect(() => () => {
    timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutIdsRef.current.clear();
    pendingTransitionsRef.current = [];
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused && pendingTransitionsRef.current.length) {
      const pending = pendingTransitionsRef.current;
      pendingTransitionsRef.current = [];
      pending.forEach((callback) => callback());
    }
  }, [paused]);
  const hospital = questions[Math.min(index, questions.length - 1)];
  const hospitalRegion = hospital?.is_real
    ? data?.locations.find((location) => location.name === hospital.name)?.addr_hint
    : undefined;
  const isLast = index >= questions.length - 1;
  const answered = pick !== null || timedOut;
  const isCorrect = !timedOut && pick !== null && (pick === 'real') === hospital?.is_real;

  const goNext = (finalScore = score, finalCorrectCount = correctCount) => {
    if (isLast) {
      finalize(finalScore, finalCorrectCount);
      return;
    }
    const nextIndex = index + 1;
    setRemainingMs(timeForIndex(nextIndex));
    setIndex(nextIndex);
  };

  const finalize = (finalScore: number, finalCorrectCount: number) => {
    const accuracy = Math.round((finalCorrectCount / questions.length) * 100);
    finishGame({
      gameId: 'fake_hospital',
      title: '찐병원 가짜병원 완료',
      score: finalScore,
      stats: [
        { icon: '◎', label: '총점', value: `${finalScore} / 500` },
        { icon: '✓', label: '정답', value: `${finalCorrectCount} / ${questions.length}` },
      ],
      detailsTitle: '판별 결과',
      details: [
        { icon: '✓', label: '정답', value: `${finalCorrectCount}개`, badge: `${accuracy}%` },
        { icon: '✕', label: '오답', value: `${questions.length - finalCorrectCount}개`, badge: `${questions.length}문항 중` },
      ],
      note: '정답 1개당 25점이며, 제한시간 초과는 오답으로 처리됩니다.',
    });
    navigate('/result');
  };

  const commitAnswer = (choice: 'real' | 'fake' | null, correct: boolean, outOfTime: boolean) => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    setPick(choice);
    setTimedOut(outOfTime);
    const nextScore = score + (correct ? POINTS_PER_QUESTION : 0);
    const nextCorrectCount = correctCount + (correct ? 1 : 0);
    if (correct) {
      setScore(nextScore);
      setCorrectCount(nextCorrectCount);
    }
    scheduleTransition(() => goNext(nextScore, nextCorrectCount), REVEAL_HOLD_MS);
  };

  const handlePick = (choice: 'real' | 'fake') => {
    if (answeredRef.current || timerExpiredRef.current || paused || showIntro || !hospital) return;
    commitAnswer(choice, (choice === 'real') === hospital.is_real, false);
  };

  // 문항 전환 시 상태 초기화 + FR-G2-03/04: 제한시간 타이머, 초과 시 오답 처리.
  // 일시정지·인트로 카운트다운 중에는 tick만 건너뛰어 카운트다운을 그대로 멈춘다.
  useEffect(() => {
    if (showIntro) return;
    answeredRef.current = false;
    timerExpiredRef.current = false;
    setPick(null);
    setTimedOut(false);
    const total = timeForIndex(index);
    let remaining = total;
    let resultTimeoutId: number | undefined;
    setRemainingMs(total);
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      remaining -= 100;
      setRemainingMs(Math.max(0, remaining));
      if (remaining <= 0) {
        window.clearInterval(id);
        timerExpiredRef.current = true;
        resultTimeoutId = window.setTimeout(
          () => commitAnswer(null, false, true),
          PROGRESS_TRANSITION_MS,
        );
      }
    }, 100);
    return () => {
      window.clearInterval(id);
      if (resultTimeoutId !== undefined) window.clearTimeout(resultTimeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, showIntro]);

  const onBack = () => navigate('/');
  const handlePause = () => {
    pausedRef.current = true;
    setPaused(true);
  };
  const handleResume = () => {
    pausedRef.current = false;
    setPaused(false);
  };
  const handleExit = () => navigate('/');
  const handleRestart = () => {
    try {
      sessionStorage.setItem('bohun_arcade.intentional_restart', '1');
    } catch { /* reload still resets the game */ }
    window.location.reload();
  };

  if (!hospital) {
    return (
      <div className={styles.page}>
        <BrandBar variant="game" tone="dark" />
        <div className={styles.body}>
          <span style={{ color: '#fff' }}>게임 데이터를 불러오는 중입니다...</span>
        </div>
      </div>
    );
  }

  const timePercent = (remainingMs / timeForIndex(index || 0)) * 100 || 0;

  return (
    <div className={styles.page}>
      <BrandBar variant="game" tone="dark" />

      <div className={styles.topBar}>
        <div className={styles.topBarNavRow}>
          <span aria-hidden />
          <span className={styles.qPill}>
            QUESTION {index + 1} <span>/ {questions.length}</span>
          </span>
          <button type="button" className={styles.pauseCircle} onClick={handlePause} aria-label="일시정지">
            ❚❚
          </button>
        </div>
        <div className={styles.topBarStatsRow}>
          <span className={styles.scoreText}>
            점수 <b>{score} / 500</b>
          </span>
          <span className={styles.correctText}>
            정답 <b>{correctCount}개</b>
          </span>
        </div>
      </div>

      <DesktopContextBar onBack={onBack} onPause={handlePause} onDark>
        <div className={styles.deskSide}>
          <span className={styles.scoreText}>
            점수 <b>{score} / 500</b>
          </span>
        </div>
        <span className={styles.qPill}>
          Q {index + 1} <span>/ {questions.length}</span>
        </span>
        <div className={[styles.deskSide, styles.deskSideRight].join(' ')}>
          <span className={styles.correctText}>
            정답 <b>{correctCount}</b>
          </span>
        </div>
      </DesktopContextBar>

      {paused && <PauseOverlay onResume={handleResume} onExit={handleExit} onRestart={handleRestart} />}

      {showIntro && (
        <GameIntroOverlay
          title="찐병원 가짜병원"
          onDone={() => setShowIntro(false)}
          rules={[
            { color: '#2abf9e', text: '병원 이름을 보고 진짜(O)인지 가짜(X)인지 판단하세요' },
            { color: '#f0b429', text: <>총 <b>20문항</b>, 진행할수록 제한시간이 점점 짧아져요</> },
            { color: '#d0705f', text: <>시간 초과는 <b>오답</b>으로 처리돼요</> },
          ]}
        />
      )}

      <div className={styles.body}>
        <div className={styles.progressTrack}>
          <ProgressBar key={index} percent={timePercent} tone="onDark" fill="bright" />
        </div>

        <div className={styles.arena}>
          <button
            type="button"
            className={[styles.circle, styles.circleReal].join(' ')}
            onClick={() => handlePick('real')}
            disabled={answered || paused || showIntro}
          >
            <span className={[styles.mark, styles.real].join(' ')}>O</span>
            <span className={styles.circleLabel}>진짜</span>
            <span className={styles.circleSub}>실제 위탁병원</span>
          </button>

          <div
            key={hospital.id}
            className={[styles.card, answered ? (isCorrect ? styles.cardOk : styles.cardMiss) : ''].join(' ')}
          >
            <IconTile size={44} background="var(--color-tint-1)">
              <HospitalGlyph accent="var(--color-ink)" size={21} />
            </IconTile>
            <span className={styles.cardLead}>이 병원, 진짜일까요?</span>
            <span className={styles.cardName}>{hospital.name}</span>
            {!answered && <span className={styles.legend}>← O 진짜　　X 가짜 →</span>}
            {answered && (
              <div className={[styles.resultBox, isCorrect ? styles.ok : styles.miss].join(' ')}>
                <span className={styles.verdict}>
                  {timedOut ? '시간 초과!' : isCorrect ? '정답입니다' : '아쉽네요'}
                </span>
                <span className={styles.fact}>
                  {hospital.is_real
                    ? `실제 위탁병원 명단에 있는 이름입니다. · 위치: ${hospitalRegion ?? '지역 정보 없음'}`
                    : '공단 데이터에 존재하지 않는 이름입니다.'}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            className={[styles.circle, styles.circleFake].join(' ')}
            onClick={() => handlePick('fake')}
            disabled={answered || paused || showIntro}
          >
            <span className={[styles.mark, styles.fake].join(' ')}>X</span>
            <span className={styles.circleLabel}>가짜</span>
            <span className={styles.circleSub}>그럴듯한 이름</span>
          </button>
        </div>

      </div>
    </div>
  );
}
