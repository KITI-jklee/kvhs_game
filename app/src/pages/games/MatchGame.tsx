import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandBar } from '../../components/layout/BrandBar';
import { GameHud } from '../../components/layout/GameHud';
import { DesktopContextBar } from '../../components/layout/DesktopContextBar';
import { ProgressBar } from '../../components/ProgressBar';
import { MatchCard } from '../../components/MatchCard';
import { PauseOverlay } from '../../components/PauseOverlay';
import { GameIntroOverlay } from '../../components/GameIntroOverlay';
import { useGameData } from '../../data/gameDataContext';
import type { MedicalTermPair } from '../../data/types';
import { buildMatchDeck, type DeckCard } from '../../lib/matchDeck';
import { formatClock, formatMinSec } from '../../lib/format';
import { sample } from '../../lib/array';
import { useGame } from '../../state/gameState';
import { computeMatchScore, MATCH_MAX_SCORE } from '../../lib/matchScore';
import styles from './MatchGame.module.css';

/** FR-G3-01: 라운드가 오를수록 6→8→10 페어(12→16→20장)로 늘어난다. */
const ROUND_SIZES = [6, 8, 10];
const MATCH_HOLD_MS = 520;
const MISMATCH_HOLD_MS = 820;
const FINISH_DELAY_MS = 1100;

// 5-3: 완료 시간·오답 횟수 기준 0~500점(최저 100점) 환산. 기준값은
// 3라운드 목표 완료시간(20+30+40초)과 오답당 감점을 임시 설정한 것으로,
// 밸런스 조정 단계에서 조정 가능하도록 상수로 분리했다(기능설계서 5-3).

/** FR-G3-03: 매 라운드 다른 항목 조합. 풀이 부족하면(8장 예외) 재사용을 허용한다. */
function pickRoundPairs(pool: MedicalTermPair[]): MedicalTermPair[][] {
  const used = new Set<string>();
  return ROUND_SIZES.map((size) => {
    const available = pool.filter((p) => !used.has(p.id));
    const byCategory = new Map<string, MedicalTermPair[]>();
    available.forEach((pair) => {
      const category = byCategory.get(pair.kind_mid) ?? [];
      category.push(pair);
      byCategory.set(pair.kind_mid, category);
    });

    const categoryEntries = [...byCategory.entries()];
    let picked: MedicalTermPair[] = [];

    // An item name can itself be identical to another pair's category label.
    // Retry the draw until every visible card label in the round is unique.
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const categories = sample(categoryEntries, size);
      const candidate = categories.map(([, pairs]) => sample(pairs, 1)[0]);
      const visibleLabels = candidate.flatMap((pair) => [pair.item_name, pair.kind_mid]);
      const normalizedLabels = visibleLabels.map((label) =>
        label.replace(/[\s.·ㆍ]/g, ''),
      );
      if (new Set(normalizedLabels).size === normalizedLabels.length) {
        picked = candidate;
        break;
      }
    }

    // Current data has enough distinct labels; retain a safe fallback for
    // future datasets that cannot satisfy the constraint.
    if (!picked.length) {
      picked = sample(categoryEntries, size).map(([, pairs]) => sample(pairs, 1)[0]);
    }
    picked.forEach((p) => used.add(p.id));
    return picked;
  });
}

export function MatchGame() {
  const navigate = useNavigate();
  const { finishGame } = useGame();
  const { data } = useGameData();
  const pool = data?.termPairs ?? [];

  const [roundsPairs] = useState<MedicalTermPair[][]>(() => pickRoundPairs(pool));
  const [roundIndex, setRoundIndex] = useState(0);
  const deck = useMemo(() => buildMatchDeck(roundsPairs[roundIndex] ?? []), [roundsPairs, roundIndex]);

  const [selected, setSelected] = useState<DeckCard[]>([]);
  // 정답 표시는 pairIndex가 아니라 실제로 함께 뒤집어 확인한 두 카드의 key에
  // 두 카드에만 부여한다. 마지막 한 쌍에서 첫 카드만 열었는데 체크가 보이는 일을 막는다.
  const [matchedCardKeys, setMatchedCardKeys] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [missCount, setMissCount] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  const doneRef = useRef(false);
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
  const showIntroRef = useRef(true);
  useEffect(() => {
    showIntroRef.current = showIntro;
  }, [showIntro]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (doneRef.current || pausedRef.current || showIntroRef.current) return;
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const pairs = roundsPairs[roundIndex] ?? [];
  const isSelected = (card: DeckCard) => selected.some((c) => c.key === card.key);
  const isMatched = (card: DeckCard) => matchedCardKeys.includes(card.key);

  const finalize = (finalMissCount: number) => {
    doneRef.current = true;
    scheduleTransition(() => {
      const finalScore = computeMatchScore(elapsedSec, finalMissCount);
      setScore(finalScore);
      finishGame({
        gameId: 'term_match',
        title: '용어 짝맞추기 완료',
        score: finalScore,
        stats: [
          { icon: '◎', label: '총점', value: `${finalScore} / ${MATCH_MAX_SCORE}` },
          { icon: '🧩', label: '완료 라운드', value: `${ROUND_SIZES.length} / ${ROUND_SIZES.length}` },
        ],
        detailsTitle: '기록 요약',
        details: [
          { icon: '⏱', label: '완료 시간', value: formatMinSec(elapsedSec) },
          { icon: '✕', label: '오답', value: `${finalMissCount}회` },
        ],
        note: '완료 시간과 오답 횟수를 기준으로 점수를 환산합니다(최저 100점 보장).',
      });
      navigate('/result');
    }, FINISH_DELAY_MS);
  };

  const handleTap = (card: DeckCard) => {
    if (doneRef.current || paused || showIntro || isMatched(card) || isSelected(card) || selected.length >= 2) return;
    const next = [...selected, card];
    if (next.length < 2) {
      setSelected(next);
      return;
    }
    const [a, b] = next;
    setSelected(next);
    if (a.pairIndex === b.pairIndex) {
      const nextMatchedCardKeys = [...matchedCardKeys, a.key, b.key];
      scheduleTransition(() => {
        setMatchedCardKeys(nextMatchedCardKeys);
        setSelected([]);
        if (nextMatchedCardKeys.length !== pairs.length * 2) return;

        if (roundIndex < ROUND_SIZES.length - 1) {
          scheduleTransition(() => {
            setRoundIndex((r) => r + 1);
            setMatchedCardKeys([]);
            setSelected([]);
          }, 250);
        } else {
          finalize(missCount);
        }
      }, MATCH_HOLD_MS);
    } else {
      setMissCount((m) => m + 1);
      scheduleTransition(() => setSelected([]), MISMATCH_HOLD_MS);
    }
  };

  const donePairs = matchedCardKeys.length / 2;
  const pairsPercent = (donePairs / Math.max(pairs.length, 1)) * 100;
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

  if (!pairs.length) {
    return (
      <div className={styles.page}>
        <BrandBar variant="game" />
        <div className={styles.body}>
          <span>게임 데이터를 불러오는 중입니다...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <BrandBar variant="game" />
      <GameHud
        onPause={handlePause}
        eyebrow={`ROUND ${roundIndex + 1}/${ROUND_SIZES.length} · MATCHED ${donePairs}/${pairs.length}`}
        title="보훈의료 용어 짝맞추기"
        score={{ label: 'SCORE', value: score || '-' }}
      />
      <DesktopContextBar onBack={onBack} onPause={handlePause}>
        <span className={styles.deskBarRound}>
          경과 시간 <b>{formatClock(elapsedSec)}</b>
        </span>
        <div className={styles.deskBarMiddle}>
          <div className={styles.deskBarMiddleTrack}>
            <ProgressBar percent={pairsPercent} fill="bright" height={5} />
          </div>
          <span className={styles.pairsLabel}>
            ROUND {roundIndex + 1}/{ROUND_SIZES.length} · {donePairs}/{pairs.length} PAIRS
          </span>
        </div>
        <span className={styles.deskBarRound}>
          오답 <b>{missCount}회</b>
        </span>
      </DesktopContextBar>

      {paused && <PauseOverlay onResume={handleResume} onExit={handleExit} onRestart={handleRestart} />}

      {showIntro && (
        <GameIntroOverlay
          title="보훈의료 용어 짝맞추기"
          onDone={() => setShowIntro(false)}
          rules={[
            { color: '#2abf9e', text: '카드 두 장을 뒤집어 항목명과 분류의 짝을 맞추세요' },
            { color: '#f0b429', text: <>라운드가 오를수록 카드 수가 늘어나요 (<b>12→16→20장</b>)</> },
            { color: '#d0705f', text: '완료 시간과 오답 횟수로 점수가 매겨져요' },
          ]}
        />
      )}

      <div className={styles.body}>
        <div className={styles.statBar}>
          <span className={styles.statText}>
            <b>{formatClock(elapsedSec)}</b>
          </span>
          <div className={styles.statMiddle}>
            <ProgressBar percent={pairsPercent} fill="bright" height={5} />
          </div>
          <span className={styles.statText}>
            오답 <b>{missCount}</b>
          </span>
        </div>

        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>MEMORY MATCH · ROUND {roundIndex + 1}</span>
            <div className={styles.title}>진료 항목과 분류를 짝지어 주세요</div>
          </div>
        </div>

        <div className={styles.grid} data-card-count={deck.length}>
          {deck.map((card) => (
            <MatchCard
              key={card.key}
              card={card}
              faceUp={isSelected(card) || isMatched(card)}
              matched={isMatched(card)}
              onTap={() => handleTap(card)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
