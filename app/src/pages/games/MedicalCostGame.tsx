import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandBar } from '../../components/layout/BrandBar';
import { FullScreenNotice } from '../../components/FullScreenNotice';
import { DesktopContextBar } from '../../components/layout/DesktopContextBar';
import { ProgressBar } from '../../components/ProgressBar';
import { PauseOverlay } from '../../components/PauseOverlay';
import { GameIntroOverlay } from '../../components/GameIntroOverlay';
import { Button } from '../../components/Button';
import { useGameData } from '../../data/gameDataContext';
import type { MedicalCostItem } from '../../data/types';
import { useGame } from '../../state/gameState';
import {
  MAX_TOTAL_SCORE,
  ROUND_COUNT,
  SLIDER_MAX,
  SLIDER_MIN,
  buildRounds,
  clampPrice,
  pricePositionRatio,
  scoreBudgetPicks,
  scoreReorder,
  scoreSlider,
  sliderPositionToPrice,
  type RoundSpec,
} from '../../lib/medicalCost';
import { shuffle } from '../../lib/array';
import { cx } from '../../lib/cx';
import { restartGame } from '../../lib/restart';
import styles from './MedicalCostGame.module.css';

const SLIDER_STEPS = 1000;
const SLIDER_TICKS = [10_000, 50_000, 200_000, 500_000, 1_200_000];

function formatWon(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

type Tone = 'ok' | 'partial' | 'miss';

interface RevealInfo {
  points: number;
  verdictLabel: string;
  tone: Tone;
  detail: ReactNode;
}

interface RoundRecord {
  label: string;
  points: number;
}

/** 라운드⑤ 카드 태그 - 두 항목이 서로 다른 분류면 "검사 · 초음파"처럼
 * 이어 붙이고, 같은 분류면 중복 없이 하나만 보여준다. */
function pairCategoryLabel(a: MedicalCostItem, b: MedicalCostItem): string {
  return [...new Set([a.category, b.category])].join(' · ');
}

/** 라운드가 초기부터 이미 정렬돼 있으면 "그냥 확인만" 눌러도 풀리므로 다시 섞는다. */
function shuffledDisplayOrder(items: MedicalCostItem[]): MedicalCostItem[] {
  const sortedKey = [...items].sort((a, b) => a.cost - b.cost).map((i) => i.id).join(',');
  let order = shuffle(items);
  for (let guard = 0; guard < 10 && order.map((i) => i.id).join(',') === sortedKey; guard++) {
    order = shuffle(items);
  }
  return order;
}

/** ±1만/±1천 버튼을 꾹 누르고 있으면 계속 반복 실행되게 한다.
 * "짧게 탭"과 "꾹 눌러 반복"을 겹치지 않는 두 경로로 완전히 분리한다:
 * - 짧은 탭 1회 반영은 항상 click 이벤트에만 맡긴다(마우스·터치·키보드
 *   Enter/Space 전부 click을 정확히 1번만 발생시키므로 가장 안전하다).
 * - pointerdown은 그 자체로는 아무것도 반영하지 않고, 450ms 뒤에도 계속
 *   눌려있으면 그때 반복 모드로 전환해 90ms 간격으로 반영한다.
 * repeatStartedRef 하나로 "이번 누름이 반복 모드로 전환됐는지"만 표시해,
 * click이 그 경우엔 스스로를 건너뛴다 - 두 경로가 절대 같은 타이밍에
 * 겹쳐 실행되지 않으므로 한 번 눌러 값이 2배로 뛰는 일이 구조적으로
 * 불가능하다. */
function useHoldStep(onTick: () => void, disabled: boolean) {
  const onTickRef = useRef(onTick);
  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const repeatStartedRef = useRef(false);

  const clearTimers = () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  };

  useEffect(() => clearTimers, []);

  // 홀드 도중 멀티터치로 다른 손가락이 일시정지/공개를 눌러도 이 버튼에는
  // pointerup/leave/cancel이 오지 않을 수 있다(터치는 최초 타깃에 암묵적으로
  // 캡처된다) - disabled로 바뀌는 즉시 반복 타이머를 직접 끊어준다.
  useEffect(() => {
    if (disabled) clearTimers();
  }, [disabled]);

  return {
    onPointerDown: () => {
      if (disabled) return;
      clearTimers();
      repeatStartedRef.current = false;
      timeoutRef.current = setTimeout(() => {
        if (disabled) return; // 450ms 사이 disabled로 바뀌었으면 반복을 시작하지 않는다
        repeatStartedRef.current = true;
        onTickRef.current(); // 반복 모드로 전환되는 순간의 첫 틱
        intervalRef.current = setInterval(() => onTickRef.current(), 90);
      }, 450);
    },
    onPointerUp: clearTimers,
    onPointerLeave: clearTimers,
    onPointerCancel: clearTimers,
    onClick: () => {
      if (repeatStartedRef.current) {
        repeatStartedRef.current = false;
        return; // 이미 반복 모드에서 반영됐으니 click 몫은 건너뛴다
      }
      onTickRef.current(); // 짧은 탭 - 정확히 1번
    },
  };
}

export function MedicalCostGame() {
  const navigate = useNavigate();
  const { finishGame } = useGame();
  const { data } = useGameData();
  const pool = useMemo(() => data?.medicalCosts ?? [], [data]);
  // pool은 데이터 로드 완료 후 참조가 고정되므로, 매 렌더마다 새로 뽑히지
  // 않는다(로드 1회 -> 라운드 1회 확정).
  const rounds = useMemo<RoundSpec[] | null>(() => (pool.length ? buildRounds(pool) : null), [pool]);

  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const [records, setRecords] = useState<RoundRecord[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [reveal, setReveal] = useState<RevealInfo | null>(null);
  const [paused, setPaused] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  // 라운드별 상호작용 상태 - 라운드가 바뀔 때마다 리셋한다. 밴드/예산/
  // 하이로우는 고르는 즉시 바로 채점(finishRound)하며, 그때 넘긴 index/id가
  // 결과 카드 안에 그대로 클로저로 남으니 별도 "선택값" 상태는 필요 없다.
  const [sliderPrice, setSliderPrice] = useState(() => sliderPositionToPrice(0.5));
  const [reorderOrder, setReorderOrder] = useState<MedicalCostItem[]>(() => {
    const firstRound = rounds?.[0];
    return firstRound?.kind === 'reorder' ? shuffledDisplayOrder(firstRound.items) : [];
  });
  // 예산 라운드는 "고르는 즉시 채점"이 아니라 토글로 여러 개 골라뒀다가
  // 확인 버튼을 눌러야 채점된다(멀티 선택) - 그래서 선택 상태를 따로 둔다.
  const [budgetPicks, setBudgetPicks] = useState<Set<string>>(new Set());

  const round = rounds?.[roundIndex] ?? null;
  // useHoldStep에도 넘겨야 해서 조기 return(round 없을 때)보다 앞서 계산한다.
  const disabled = paused || showIntro || revealed;

  const isLastRound = roundIndex >= ROUND_COUNT - 1;

  const finishRound = (points: number, verdictLabel: string, tone: Tone, detail: ReactNode, recordLabel: string) => {
    if (revealed) return;
    setRevealed(true);
    setScore((s) => s + points);
    if (points === 100) setHitCount((c) => c + 1);
    setReveal({ points, verdictLabel, tone, detail });
    setRecords((r) => [...r, { label: recordLabel, points }]);
  };

  const adjustSliderPrice = (amount: number) => {
    setSliderPrice((price) => clampPrice(price + amount));
  };

  const stepMinusCoarse = useHoldStep(() => adjustSliderPrice(-10_000), disabled);
  const stepMinusFine = useHoldStep(() => adjustSliderPrice(-1_000), disabled);
  const stepPlusFine = useHoldStep(() => adjustSliderPrice(1_000), disabled);
  const stepPlusCoarse = useHoldStep(() => adjustSliderPrice(10_000), disabled);

  const handleSliderConfirm = () => {
    if (!round || round.kind !== 'slider') return;
    const guess = sliderPrice;
    const { points, label, errorPercent } = scoreSlider(guess, round.item.cost);
    finishRound(
      points,
      label,
      points >= 70 ? 'ok' : points > 0 ? 'partial' : 'miss',
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>내 예상</span>
          <span className={styles.statValue}>{formatWon(guess)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>공개 비급여 수가</span>
          <span className={styles.statValue}>{formatWon(round.item.cost)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>차이 · {errorPercent}%</span>
          <span className={styles.statValue}>{formatWon(Math.abs(guess - round.item.cost))}</span>
        </div>
      </div>,
      `${round.item.name} · ${label}`,
    );
  };

  const handleBandPick = (index: number) => {
    if (!round || round.kind !== 'band' || revealed) return;
    const correct = index === round.correctIndex;
    finishRound(
      correct ? 100 : 0,
      correct ? '정답!' : '아쉽네요',
      correct ? 'ok' : 'miss',
      <>
        {round.bands.map((band, i) => (
          <div
            key={i}
            className={cx(styles.bandResultRow, i === round.correctIndex && styles.bandResultCorrect)}
          >
            <span>
              {i + 1}. {band.label}
            </span>
            {i === round.correctIndex && <b className={styles.tagOk}>정답 · {formatWon(round.item.cost)}</b>}
            {i === index && i !== round.correctIndex && <b className={styles.tagMiss}>내 선택</b>}
          </div>
        ))}
      </>,
      `${round.item.name} · ${correct ? '정답' : '오답'}`,
    );
  };

  // 화살표 버튼 대신 마우스/터치로 직접 끌어서 순서를 바꾼다 - Pointer
  // Capture를 쓰면 드래그 중 포인터가 행 바깥으로 나가도 move/up 이벤트가
  // 계속 그 행으로 들어와서, window 레벨 리스너 없이도 동작한다.
  const reorderRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragRef = useRef<{ index: number; startY: number; rowHeight: number } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragY, setDragY] = useState(0);

  const handleReorderPointerDown = (index: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (revealed || paused || showIntro) return;
    const rowEl = reorderRowRefs.current[index];
    dragRef.current = { index, startY: e.clientY, rowHeight: rowEl?.offsetHeight ?? 56 };
    setDragIndex(index);
    setDragY(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleReorderPointerMove = (itemCount: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state) return;
    const delta = e.clientY - state.startY;
    const rowStep = state.rowHeight + 8; // .reorderList의 gap(8px) 포함
    const steps = Math.trunc(delta / rowStep);
    if (steps === 0) {
      setDragY(delta);
      return;
    }
    const newIndex = Math.min(itemCount - 1, Math.max(0, state.index + steps));
    if (newIndex !== state.index) {
      setReorderOrder((prev) => {
        const next = [...prev];
        const [moved] = next.splice(state.index, 1);
        next.splice(newIndex, 0, moved);
        return next;
      });
    }
    dragRef.current = { index: newIndex, startY: e.clientY, rowHeight: state.rowHeight };
    setDragIndex(newIndex);
    setDragY(delta - steps * rowStep);
  };

  const handleReorderPointerUp = () => {
    dragRef.current = null;
    setDragIndex(null);
    setDragY(0);
  };

  const handleReorderConfirm = () => {
    if (!round || round.kind !== 'reorder') return;
    const { points, fixedCount } = scoreReorder(round.items, reorderOrder.map((i) => i.id));
    const verdictLabel =
      points === 100 ? '정확해요!' : points === 50 ? '꽤 비슷해요' : points === 20 ? '조금 빗나갔어요' : '많이 빗나갔어요';
    const sorted = [...round.items].sort((a, b) => a.cost - b.cost);
    finishRound(
      points,
      verdictLabel,
      points === 100 ? 'ok' : points > 0 ? 'partial' : 'miss',
      <>
        {sorted.map((item, i) => (
          <div key={item.id} className={styles.bandResultRow}>
            <span>
              {i + 1}. {item.name}
            </span>
            <b className={styles.priceStrong}>{formatWon(item.cost)}</b>
          </div>
        ))}
      </>,
      `순서 맞추기 · ${fixedCount}/${round.items.length}`,
    );
  };

  const toggleBudgetPick = (id: string) => {
    if (!round || round.kind !== 'budget' || revealed) return;
    setBudgetPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBudgetConfirm = () => {
    if (!round || round.kind !== 'budget') return;
    const pickedIds = [...budgetPicks];
    const { points, correctPickCount } = scoreBudgetPicks(round.fitIds, pickedIds);
    const fitSet = new Set(round.fitIds);
    const verdictLabel = points === 100 ? '예산 성공!' : points > 0 ? '아쉽네요' : '많이 빗나갔어요';
    finishRound(
      points,
      verdictLabel,
      points === 100 ? 'ok' : points > 0 ? 'partial' : 'miss',
      <>
        {round.items.map((item) => {
          const isFit = fitSet.has(item.id);
          const wasPicked = budgetPicks.has(item.id);
          // "적중/오답/놓침" 대신 항목 자체가 예산 안에 드는지를 그대로
          // 보여주고, 내가 고른 항목은 하이라이트로 따로 표시한다 - 둘을
          // 같이 보면 적중/오답/놓침도 자연히 읽힌다.
          return (
            <div key={item.id} className={cx(styles.bandResultRow, wasPicked && styles.bandResultCorrect)}>
              <span>{item.name}</span>
              <span>
                <b className={styles.priceStrong}>{formatWon(item.cost)}</b>{' '}
                <b className={isFit ? styles.tagOk : styles.tagMiss}>{isFit ? '예산 내' : '예산 초과'}</b>
              </span>
            </div>
          );
        })}
      </>,
      `예산 챌린지 · 적중 ${correctPickCount}/${round.fitIds.length}`,
    );
  };

  // 기준 가격을 미리 보여주는 대신, 두 항목 다 가격을 가리고 "어느 쪽이 더
  // 비쌀까"만 순수하게 감으로 비교하게 한다.
  const handleHigherLowerPick = (pickedId: string) => {
    if (!round || round.kind !== 'higherLower' || revealed) return;
    const pricierId = round.isHigher ? round.nextItem.id : round.refItem.id;
    const correct = pickedId === pricierId;
    finishRound(
      correct ? 100 : 0,
      correct ? '정답!' : '아쉽네요',
      correct ? 'ok' : 'miss',
      <>
        {[round.refItem, round.nextItem].map((item) => (
          <div
            key={item.id}
            className={cx(styles.bandResultRow, item.id === pricierId && styles.bandResultCorrect)}
          >
            <span>{item.name}</span>
            <span>
              <b className={styles.priceStrong}>{formatWon(item.cost)}</b>{' '}
              {item.id === pricierId && <b className={styles.tagOk}>더 비쌈</b>}
              {item.id === pickedId && item.id !== pricierId && <b className={styles.tagMiss}>내 선택</b>}
            </span>
          </div>
        ))}
      </>,
      `가격 비교 · ${correct ? '정답' : '오답'}`,
    );
  };

  const handleNext = () => {
    if (isLastRound) {
      finishGame({
        gameId: 'medical_cost',
        title: '의료비 감각 테스트 완료',
        score,
        stats: [
          { icon: '◎', label: '총점', value: `${score} / ${MAX_TOTAL_SCORE}` },
          { icon: '✓', label: '적중', value: `${hitCount} / ${ROUND_COUNT}` },
        ],
        detailsTitle: '라운드별 결과',
        details: records.map((r, i) => ({ icon: '💊', label: `R${i + 1}`, value: r.label, badge: `${r.points}점` })),
        note: '실제 공개 비급여 수가 기준이며, 진료 조건에 따라 달라질 수 있습니다.',
      });
      navigate('/result');
      return;
    }
    const nextIndex = roundIndex + 1;
    const nextRound = rounds?.[nextIndex];
    setSliderPrice(sliderPositionToPrice(0.5));
    setReorderOrder(nextRound?.kind === 'reorder' ? shuffledDisplayOrder(nextRound.items) : []);
    setBudgetPicks(new Set());
    setRoundIndex(nextIndex);
    setRevealed(false);
    setReveal(null);
  };

  const onBack = () => navigate('/');
  const handlePause = () => setPaused(true);
  const handleResume = () => setPaused(false);
  const handleExit = () => navigate('/');
  const handleRestart = restartGame;

  if (!round) {
    return <FullScreenNotice variant="modal" icon="⏳" title="게임 데이터를 불러오는 중입니다..." />;
  }

  return (
    <div className={styles.page}>
      <BrandBar variant="game" tone="dark" />

      <div className={styles.topBar}>
        <div className={styles.topBarNavRow}>
          <span aria-hidden />
          <span className={styles.qPill}>
            ROUND {roundIndex + 1} <span>/ {ROUND_COUNT}</span>
          </span>
          <button type="button" className={styles.pauseCircle} onClick={handlePause} aria-label="일시정지">
            ❚❚
          </button>
        </div>
        <div className={styles.topBarStatsRow}>
          <span className={styles.scoreText}>
            점수 <b>{score}</b>
          </span>
          <span className={styles.correctText}>
            적중 <b>{hitCount}</b>
          </span>
        </div>
      </div>

      <DesktopContextBar onBack={onBack} onPause={handlePause} onDark>
        <div className={styles.deskSide}>
          <span className={styles.scoreText}>
            점수 <b>{score}</b>
          </span>
        </div>
        <span className={styles.qPill}>
          ROUND {roundIndex + 1} <span>/ {ROUND_COUNT}</span>
        </span>
        <div className={cx(styles.deskSide, styles.deskSideRight)}>
          <span className={styles.correctText}>
            적중 <b>{hitCount}</b>
          </span>
        </div>
      </DesktopContextBar>

      {paused && <PauseOverlay onResume={handleResume} onExit={handleExit} onRestart={handleRestart} />}

      {showIntro && (
        <GameIntroOverlay
          title="의료비 감각 테스트"
          onDone={() => setShowIntro(false)}
          rules={[
            { color: '#2abf9e', text: '공개된 비급여 가격을 감으로 맞혀보세요' },
            { color: '#f0b429', text: <>라운드마다 다른 방식으로 진행돼요</> },
            { color: '#d0705f', text: <>총 <b>5라운드</b>, 라운드당 최대 <b>100점</b>이에요</> },
          ]}
        />
      )}

      <div className={styles.body}>
        <div className={styles.progressTrack}>
          <ProgressBar percent={((roundIndex + (revealed ? 1 : 0)) / ROUND_COUNT) * 100} tone="onDark" fill="bright" />
        </div>

        <div className={styles.roundArea}>
        <div className={styles.roundCard}>
          {round.kind === 'slider' && (
            <>
              <div className={styles.cardTag}>
                <span className={styles.pill}>{round.item.category}</span>
                <span className={styles.cardTagText}>얼마나 나올까?</span>
              </div>
              <span className={styles.cardName}>{round.item.name}</span>
              <span className={styles.cardHint}>공개 비급여 수가는 어느 정도일까요?</span>
              {!revealed ? (
                <>
                  {/* 마이너스 - 값 - 플러스를 화면 크기에 상관없이 항상 한
                      줄에 나란히 둔다(모바일에서 값 아래로 따로 떨어뜨리지
                      않는다). 값 표시는 폭을 고정해서(styles.sliderValue)
                      자릿수가 바뀌어도(10,000원 ↔ 1,200,000원) 버튼이 전혀
                      움직이지 않는다 - 꾹 누르는 도중 숫자가 커지면서 버튼이
                      손가락 밑에서 밀려나 홀드가 끊기는 문제가 이걸로
                      없어진다. 좁은 화면에서는 값·버튼을 함께 줄여 한 줄
                      폭에 맞춘다(모듈 CSS의 max-width:480px 구간). */}
                  <div className={styles.sliderValueRow} aria-label="가격 미세 조정">
                    <div className={styles.stepperSide}>
                      <button
                        type="button"
                        className={cx(styles.stepBtn, styles.stepBtnCoarse)}
                        disabled={disabled || sliderPrice <= SLIDER_MIN}
                        {...stepMinusCoarse}
                        aria-label="1만원 감소, 꾹 누르면 계속 감소"
                      >
                        <span className={styles.stepBtnSign}>−</span>
                        <span className={styles.stepBtnAmt}>1만</span>
                      </button>
                      <button
                        type="button"
                        className={cx(styles.stepBtn, styles.stepBtnFine)}
                        disabled={disabled || sliderPrice <= SLIDER_MIN}
                        {...stepMinusFine}
                        aria-label="1천원 감소, 꾹 누르면 계속 감소"
                      >
                        <span className={styles.stepBtnSign}>−</span>
                        <span className={styles.stepBtnAmt}>1천</span>
                      </button>
                    </div>
                    <span className={styles.sliderValue}>{formatWon(sliderPrice)}</span>
                    <div className={styles.stepperSide}>
                      <button
                        type="button"
                        className={cx(styles.stepBtn, styles.stepBtnFine)}
                        disabled={disabled || sliderPrice >= SLIDER_MAX}
                        {...stepPlusFine}
                        aria-label="1천원 증가, 꾹 누르면 계속 증가"
                      >
                        <span className={styles.stepBtnSign}>+</span>
                        <span className={styles.stepBtnAmt}>1천</span>
                      </button>
                      <button
                        type="button"
                        className={cx(styles.stepBtn, styles.stepBtnCoarse)}
                        disabled={disabled || sliderPrice >= SLIDER_MAX}
                        {...stepPlusCoarse}
                        aria-label="1만원 증가, 꾹 누르면 계속 증가"
                      >
                        <span className={styles.stepBtnSign}>+</span>
                        <span className={styles.stepBtnAmt}>1만</span>
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    className={styles.slider}
                    min={0}
                    max={SLIDER_STEPS}
                    value={Math.round(pricePositionRatio(sliderPrice) * SLIDER_STEPS)}
                    disabled={disabled}
                    style={{ '--fill': pricePositionRatio(sliderPrice) } as CSSProperties}
                    onChange={(e) => setSliderPrice(sliderPositionToPrice(Number(e.target.value) / SLIDER_STEPS))}
                  />
                  <div className={styles.sliderTicks}>
                    {SLIDER_TICKS.map((t) => {
                      // 손잡이·채우기와 같은 공식(calc(분수 * (100% - 손잡이크기)
                      // + 손잡이크기/2))으로 위치를 계산해야 셋이 항상 같은
                      // 지점을 가리킨다. i === 0 || i === length-1 검사로
                      // 트랙 밖으로 삐져나가지 않게 따로 보정할 필요도 없어졌다.
                      const fraction = pricePositionRatio(t);
                      // 현재 값이 이 눈금을 지나왔으면 채워진 트랙과 같은 색으로
                      // 활성 표시해 "지금 어디쯤 있는지"를 눈금에서도 읽히게 한다.
                      // 로그 스케일에서는 %차이가 구간마다 다르므로 %가 아니라
                      // 실제 가격으로 직접 비교해야 정확하다.
                      const isActive = sliderPrice >= t;
                      return (
                        <span
                          key={t}
                          className={cx(styles.sliderTick, isActive && styles.sliderTickActive)}
                          style={{ left: `calc(${fraction} * (100% - var(--slider-thumb-size)) + var(--slider-thumb-size) / 2)` }}
                        >
                          <span className={styles.sliderTickMark} aria-hidden />
                          {t >= 10000 ? `${t / 10000}만` : `${t}`}
                        </span>
                      );
                    })}
                  </div>
                  <Button variant="accent" disabled={disabled} onClick={handleSliderConfirm}>
                    이 금액으로 선택
                  </Button>
                  <span className={styles.cardFootnote}>밀어서 가격을 예상해 보세요.</span>
                </>
              ) : (
                <span className={styles.cardFootnote}>밀어서 가격을 예상해 보세요.</span>
              )}
            </>
          )}

          {round.kind === 'band' && (
            <>
              <div className={styles.cardTag}>
                <span className={styles.pill}>{round.item.category}</span>
                <span className={styles.cardTagText}>어느 가격대일까?</span>
              </div>
              <span className={styles.cardName}>{round.item.name}</span>
              <span className={styles.cardHint}>공개 비급여 수가는 어느 가격대일까요?</span>
              {!revealed && (
                <>
                  <div className={styles.bandGrid}>
                    {round.bands.map((band, i) => (
                      <button
                        key={i}
                        type="button"
                        className={styles.bandCard}
                        disabled={disabled}
                        onClick={() => handleBandPick(i)}
                      >
                        <span className={styles.bandNum}>{i + 1}.</span>
                        <span>{band.label}</span>
                      </button>
                    ))}
                  </div>
                  <span className={styles.cardFootnote}>정확한 금액보다 가격대 감각이 중요합니다.</span>
                </>
              )}
            </>
          )}

          {round.kind === 'reorder' && (
            <>
              <div className={styles.cardTag}>
                <span className={styles.pill}>가격 순서</span>
                <span className={styles.cardTagText}>가격 순서를 맞춰라!</span>
              </div>
              <span className={styles.cardHint}>카드를 끌어서 저렴한 순서대로 배치하세요.</span>
              {!revealed && (
                <>
                  <div className={styles.reorderList}>
                    {reorderOrder.map((item, i) => (
                      <div
                        key={item.id}
                        ref={(el) => {
                          reorderRowRefs.current[i] = el;
                        }}
                        className={cx(styles.reorderRow, dragIndex === i && styles.reorderRowDragging)}
                        style={dragIndex === i ? { transform: `translateY(${dragY}px)` } : undefined}
                        onPointerDown={handleReorderPointerDown(i)}
                        onPointerMove={handleReorderPointerMove(reorderOrder.length)}
                        onPointerUp={handleReorderPointerUp}
                        onPointerCancel={handleReorderPointerUp}
                      >
                        <span className={styles.bandNum}>{i + 1}</span>
                        <span className={styles.reorderName}>{item.name}</span>
                        <span className={styles.reorderGrip} aria-hidden>
                          ⠿
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button variant="accent" disabled={disabled} onClick={handleReorderConfirm}>
                    이 순서로 결정
                  </Button>
                  <span className={styles.cardFootnote}>1번이 가장 저렴한 자리입니다.</span>
                </>
              )}
            </>
          )}

          {round.kind === 'budget' && (
            <>
              <div className={styles.cardTag}>
                <span className={styles.pill}>비급여 진료</span>
                <span className={styles.cardTagText}>예산 챌린지</span>
              </div>
              <span className={styles.cardHint}>예산 안에 들어올 항목을 모두 고르세요.</span>
              {!revealed && (
                <>
                  <span className={styles.budgetPill}>💳 예산 {formatWon(round.budget)}</span>
                  <div className={styles.budgetList}>
                    {round.items.map((item, i) => {
                      const picked = budgetPicks.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={cx(styles.budgetCard, picked && styles.budgetCardPicked)}
                          disabled={disabled}
                          onClick={() => toggleBudgetPick(item.id)}
                        >
                          <span className={styles.bandNum}>{['A', 'B', 'C', 'D', 'E'][i]}</span>
                          <span>{item.name}</span>
                          {picked && <span aria-hidden>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="accent" disabled={disabled} onClick={handleBudgetConfirm}>
                    이 항목들로 확인
                  </Button>
                  <span className={styles.cardFootnote}>예산 안에 드는 항목이 1개 또는 2개예요. 전부 찾아보세요.</span>
                </>
              )}
            </>
          )}

          {round.kind === 'higherLower' && (
            <>
              <div className={styles.cardTag}>
                <span className={styles.pill}>{pairCategoryLabel(round.refItem, round.nextItem)}</span>
                <span className={styles.cardTagText}>FINAL · 더 비싼 건?</span>
              </div>
              <span className={styles.cardHint}>두 항목 중 더 비싼 쪽을 고르세요.</span>
              {!revealed && (
                <>
                  <div className={styles.hlButtons}>
                    {[
                      { label: 'A', item: round.refItem },
                      { label: 'B', item: round.nextItem },
                    ].map(({ label, item }) => (
                      <button
                        key={item.id}
                        type="button"
                        className={styles.hlPickCard}
                        disabled={disabled}
                        onClick={() => handleHigherLowerPick(item.id)}
                      >
                        <span className={styles.hlBadge}>{label}</span>
                        <span className={styles.hlPickName}>{item.name}</span>
                        <span className={styles.hlPickDesc}>{item.category}</span>
                        <span className={styles.hlBars} aria-hidden>
                          <span />
                          <span />
                          <span />
                          <span />
                        </span>
                      </button>
                    ))}
                  </div>
                  <span className={styles.hlVsBadge}>VS</span>
                  <span className={styles.cardFootnote}>마지막 문제입니다. 두 항목의 차이는 크지 않아요.</span>
                </>
              )}
            </>
          )}
        </div>

        {revealed && reveal && (
          <div className={cx(styles.resultBox, styles[reveal.tone])}>
            <div className={styles.resultHead}>
              <span className={styles.resultBadge}>{reveal.verdictLabel}</span>
              <span className={styles.resultPoints}>+{reveal.points}</span>
            </div>
            <div className={styles.resultDetail}>{reveal.detail}</div>
            <span className={styles.resultSource}>
              한국보훈복지의료공단 공개 데이터 기준
              <br />
              실제 진료비는 진료 조건 등에 따라 달라질 수 있습니다.
            </span>
            <Button variant="accent" className={styles.nextBtn} onClick={handleNext}>
              {isLastRound ? '결과 보기' : '다음 문제'}
            </Button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
