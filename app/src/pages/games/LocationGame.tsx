import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandBar } from '../../components/layout/BrandBar';
import { FullScreenNotice } from '../../components/FullScreenNotice';
import { GameHud } from '../../components/layout/GameHud';
import { DesktopContextBar } from '../../components/layout/DesktopContextBar';
import { KoreaMap, type MapPin, type MapRegion } from '../../components/map/KoreaMap';
import { IconTile } from '../../components/icons/IconTile';
import { HospitalGlyph } from '../../components/icons/Glyphs';
import { Button } from '../../components/Button';
import { PauseOverlay } from '../../components/PauseOverlay';
import { GameIntroOverlay } from '../../components/GameIntroOverlay';
import { useGameData } from '../../data/gameDataContext';
import { useGame } from '../../state/gameState';
import { boundsForPoints, type LatLng } from '../../lib/geo';
import { loadProvinceOutlines, type ProvinceOutline } from '../../lib/provinceOutline';
import { findDongName, loadDongOutlines, type DongOutline } from '../../lib/dongOutline';
import {
  RANK_POINTS,
  isTiedWithNearest,
  loadRegionsIndex,
  pointsForPick,
  selectNearestChoices,
  type HospitalPoint,
  type NearestRound,
} from '../../lib/nearestHospital';
import { shuffle } from '../../lib/array';
import { cx } from '../../lib/cx';
import { restartGame } from '../../lib/restart';
import styles from './LocationGame.module.css';

const ROUND_COUNT = 5;
const DECOY_COUNT = 4;
const SEARCH_POOL_SIZE = 40;
const ROUND_TIME_MS = 5000;
const MAX_TOTAL_SCORE = 500;

/** "충청남도 공주시" -> "공주시". 세종처럼 두 번째 토큰이 없으면 그대로 둔다. */
function cityLabel(addr: string): string {
  return addr.split(' ')[1] ?? addr;
}

/** 미선택 시간 초과와 오답 문구를 구분한다. */
function verdictForPoints(points: number, pickedId: string | null): string {
  if (pickedId === null) return '시간이 초과됐어요';
  if (points === RANK_POINTS[0]) return '정답이에요!';
  if (points === RANK_POINTS[1]) return '2등이었어요, 아쉬워요!';
  if (points === RANK_POINTS[2]) return '3등이었어요';
  if (points === RANK_POINTS[3]) return '거의 다 왔는데 아쉬워요';
  return '많이 빗나갔어요';
}

interface RoundChoice {
  countyAddr: string;
  /** 강조할 읍/면/동. 데이터가 없으면 null. */
  dong: DongOutline | null;
  /** 거리 계산 원점. 동 중심이 없으면 시/군 중심이다. */
  origin: LatLng;
  round: NearestRound;
}

interface RoundSetup {
  /** 라운드마다 미리 뽑아 둔 지역 + 병원 후보(중복 없이 무작위, 퍼짐 검증 완료). */
  rounds: RoundChoice[];
}

interface RegionData {
  countyAddr: string;
  map: MapRegion;
}

interface RevealInfo {
  points: number;
  verdict: string;
  correctName: string;
  correctAddr: string;
  correctKm: number;
  pickedName: string | null;
  pickedAddr: string | null;
  pickedKm: number | null;
  /** 1등과는 다른 병원을 골랐지만 거리가 사실상 같아 정답으로 인정된 경우. */
  tieCredited: boolean;
}

interface RoundRecord {
  countyLabel: string;
  correctName: string;
  points: number;
}

export function LocationGame() {
  const navigate = useNavigate();
  const { finishGame } = useGame();
  const { data } = useGameData();
  const pool = useMemo(() => data?.locations ?? [], [data]);

  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [setup, setSetup] = useState<RoundSetup | null>(null);
  const [region, setRegion] = useState<RegionData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reveal, setReveal] = useState<RevealInfo | null>(null);
  const [records, setRecords] = useState<RoundRecord[]>([]);
  const [remainingMs, setRemainingMs] = useState(ROUND_TIME_MS);
  const [paused, setPaused] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  const selectedRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // 한 게임의 지역과 후보를 시작 시 확정한다.
  useEffect(() => {
    if (!pool.length) return;
    let cancelled = false;
    Promise.all([loadRegionsIndex(), loadDongOutlines()]).then(([index, dongsByAddr]) => {
      if (cancelled) return;
      // 좌표를 동 경계에 대입하고 실패하면 시/군 주소만 쓴다.
      const hospitalPoints: HospitalPoint[] = pool.map((h) => {
        const dongName = findDongName(dongsByAddr[h.addr_hint] ?? [], { lat: h.latitude, lng: h.longitude });
        return {
          id: h.id,
          name: h.name,
          center: { lat: h.latitude, lng: h.longitude },
          province: h.addr_hint.split(' ')[0],
          addr: dongName ? `${h.addr_hint} ${dongName}` : h.addr_hint,
        };
      });
      // 쿼리 파라미터로 테스트할 첫 지역을 지정할 수 있다.
      const debugParams = new URLSearchParams(window.location.search);
      const debugAddr = debugParams.get('debugAddr');
      const debugDong = debugParams.get('debugDong');

      const candidates = shuffle(Object.keys(index.centers));
      if (debugAddr && index.centers[debugAddr]) {
        candidates.splice(candidates.indexOf(debugAddr), 1);
        candidates.unshift(debugAddr);
      }
      const rounds: RoundChoice[] = [];
      const usedAddrs = new Set<string>();
      for (const addr of candidates) {
        if (rounds.length >= ROUND_COUNT) break;
        if (usedAddrs.has(addr)) continue;
        const dongList = dongsByAddr[addr];
        const forcedDong = addr === debugAddr && debugDong ? dongList?.find((d) => d.name === debugDong) : undefined;
        const dong = forcedDong ?? (dongList?.length ? shuffle(dongList)[0] : null);
        const origin = dong?.center ?? index.centers[addr];
        const round = selectNearestChoices(hospitalPoints, origin, DECOY_COUNT, SEARCH_POOL_SIZE);
        if (round.ranked.length < 2) continue; // 최소 정답+오답 1개는 있어야 라운드가 성립
        rounds.push({ countyAddr: addr, dong, origin, round });
        usedAddrs.add(addr);
      }
      setSetup({ rounds });
    });
    return () => {
      cancelled = true;
    };
  }, [pool]);

  const roundChoice = setup?.rounds[roundIndex] ?? null;
  const countyAddr = roundChoice?.countyAddr ?? null;

  // 배경은 관련 도 전체, 줌은 실제 후보 위치를 기준으로 잡는다.
  useEffect(() => {
    if (!countyAddr || !roundChoice) return;
    const { origin } = roundChoice;

    let cancelled = false;
    (async () => {
      const originProvince = countyAddr.split(' ')[0];
      const provincesInvolved = Array.from(new Set([originProvince, ...roundChoice.round.ranked.map((c) => c.province)]));
      const provinceOutlines = await loadProvinceOutlines();
      if (cancelled) return;
      const provinceEntries = provincesInvolved
        .map((p) => provinceOutlines[p])
        .filter((p): p is ProvinceOutline => Boolean(p));
      const points = [origin, ...roundChoice.round.shuffled.map((c) => c.center)];
      setRegion({
        countyAddr,
        map: { rings: provinceEntries.flatMap((p) => p.rings), bounds: boundsForPoints(points) },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [countyAddr, roundChoice]);

  // 비동기 지도 로드가 타이머를 초기화하지 않도록 현재 라운드를 ref에 둔다.
  const roundChoiceRef = useRef<RoundChoice | null>(null);
  useEffect(() => {
    roundChoiceRef.current = roundChoice;
  }, [roundChoice]);

  const isLastRound = roundIndex >= ROUND_COUNT - 1;

  // StrictMode에서도 라운드당 한 번만 채점한다.
  const revealedRef = useRef(false);
  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);

  const finishRound = useCallback((pickedId: string | null) => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    const rc = roundChoiceRef.current;
    if (!rc) return;
    const { ranked } = rc.round;
    const correct = ranked[0];
    const picked = pickedId ? ranked.find((c) => c.id === pickedId) ?? null : null;
    const points = pointsForPick(ranked, pickedId);
    const tieCredited = Boolean(picked) && picked!.id !== correct.id && isTiedWithNearest(ranked, pickedId);
    setRevealed(true);
    setScore((s) => s + points);
    setReveal({
      points,
      verdict: verdictForPoints(points, pickedId),
      correctName: correct.name,
      correctAddr: correct.addr ?? '',
      correctKm: Math.round(correct.km * 10) / 10,
      pickedName: picked && picked.id !== correct.id ? picked.name : null,
      pickedAddr: picked && picked.id !== correct.id ? picked.addr ?? '' : null,
      pickedKm: picked && picked.id !== correct.id ? Math.round(picked.km * 10) / 10 : null,
      tieCredited,
    });
    setRecords((r) => [...r, { countyLabel: cityLabel(rc.countyAddr), correctName: correct.name, points }]);
  }, []);

  // 라운드 제한시간. 확인하지 않고 시간이 끝나면 그때까지 고른 후보로(안 골랐으면 오답으로) 채점한다.
  // 일시정지 중에는 tick만 건너뛰어 카운트다운을 그대로 멈춘다.
  useEffect(() => {
    if (revealed || showIntro) return;
    let remaining = ROUND_TIME_MS;
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      remaining -= 100;
      setRemainingMs(Math.max(0, remaining));
      if (remaining <= 0) {
        window.clearInterval(id);
        finishRound(selectedRef.current);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [roundIndex, revealed, showIntro, finishRound]);

  const handleSelect = (id: string) => {
    if (revealed || paused || showIntro) return;
    setSelectedId(id);
  };

  const handleConfirm = () => {
    if (!selectedId || revealed || paused || showIntro) return;
    finishRound(selectedId);
  };

  const handlePause = () => setPaused(true);
  const handleResume = () => setPaused(false);
  const handleExit = () => navigate('/');
  const handleRestart = restartGame;

  const handleNext = () => {
    if (isLastRound) {
      const bestCount = records.filter((r) => r.points === RANK_POINTS[0]).length;
      finishGame({
        gameId: 'location',
        title: '가장 가까운 위탁병원 찾기 완료',
        score,
        stats: [
          { icon: '◎', label: '총점', value: `${score} / ${MAX_TOTAL_SCORE}` },
          { icon: '🧍', label: '진행 라운드', value: `${ROUND_COUNT} / ${ROUND_COUNT}` },
        ],
        detailsTitle: '라운드별 가장 가까운 위탁병원',
        details: records.map((r, i) => ({
          icon: '📍',
          label: `R${i + 1} · ${r.countyLabel}`,
          value: r.correctName,
          badge: `${r.points}점`,
        })),
        note: `${bestCount} / ${ROUND_COUNT}라운드 정답 · 가까운 순서에 따라 최대 100점부터 차등 채점됩니다.`,
      });
      navigate('/result');
      return;
    }
    revealedRef.current = false;
    setRoundIndex((i) => i + 1);
    setSelectedId(null);
    setRevealed(false);
    setReveal(null);
  };

  if (!setup || !pool.length) {
    return <FullScreenNotice variant="modal" icon="⏳" title="게임 데이터를 불러오는 중입니다..." />;
  }

  const secondsLeft = Math.ceil(remainingMs / 1000);
  const countyLabel = countyAddr ?? '';
  // 동 이름까지 있으면 "경기도 양주시 옥정동 인근", 없으면 시/군 이름까지만.
  const dongName = roundChoice?.dong?.name ?? null;
  const locationLabel = dongName ? `${countyLabel} ${dongName} 인근` : countyLabel;
  const roundRegion = countyAddr && region?.countyAddr === countyAddr ? region : null;
  const highlight = roundChoice?.dong ? { rings: roundChoice.dong.rings } : null;
  const pins: MapPin[] = roundChoice
    ? roundChoice.round.shuffled.map((c) => ({ id: c.id, center: c.center, label: c.name }))
    : [];

  return (
    <div className={styles.page}>
      <BrandBar variant="game" />
      <GameHud
        onPause={handlePause}
        eyebrow={`ROUND ${roundIndex + 1} / ${ROUND_COUNT}`}
        title="가장 가까운 위탁병원 찾기"
        score={{ label: 'SCORE', value: score }}
      />
      <DesktopContextBar onBack={() => navigate('/')} onPause={handlePause}>
        <span className={styles.deskRound}>
          라운드 <b>{roundIndex + 1}/{ROUND_COUNT}</b>
        </span>
        <span className={styles.deskScore}>
          현재 총점 <b>{score} / {MAX_TOTAL_SCORE}</b>
        </span>
      </DesktopContextBar>

      {paused && <PauseOverlay onResume={handleResume} onExit={handleExit} onRestart={handleRestart} />}

      {showIntro && (
        <GameIntroOverlay
          title="가장 가까운 위탁병원 찾기"
          onDone={() => setShowIntro(false)}
          rules={[
            { color: '#2abf9e', text: '주어진 위치에서 가장 가까운 위탁병원을 골라보세요' },
            { color: '#f0b429', text: <>라운드당 제한시간 <b>5초</b>, 총 <b>5라운드</b>예요</> },
            { color: '#d0705f', text: <>가까운 병원을 고를수록 더 높은 점수를 받아요</> },
          ]}
        />
      )}

      <div className={styles.body}>
        <div className={styles.questionPanel}>
          <div className={styles.qHeaderRow}>
            <span className={styles.qEyebrow}>MISSION {String(roundIndex + 1).padStart(2, '0')}</span>
            {/* 데스크톱엔 아래 noteBox에 남은 시간이 있지만 데스크톱 전용이라,
                모바일에서는 이 카드 우측 상단에 따로 보여준다. */}
            {!revealed && (
              <span className={cx(styles.mobileTimer, 'hide-on-desktop')}>⏱ 남은 시간 {secondsLeft}초</span>
            )}
          </div>
          <IconTile size={52} className="hide-until-desktop">
            <HospitalGlyph accent="var(--color-ink)" size={24} />
          </IconTile>
          <div className={styles.qTextGroup}>
            <span className={styles.qTitle}>
              보훈 대상자가
              <br />
              {locationLabel}에 있습니다
            </span>
            <span className={styles.qHint}>가장 가까운 위탁병원은 어디일까요?</span>
          </div>
          {!revealed && (
            <div className={cx(styles.noteBox, 'hide-until-desktop')}>
              <span aria-hidden style={{ fontSize: 14, color: 'var(--color-ink)' }}>
                ⏱
              </span>
              <div>
                <div className={styles.noteTitle}>남은 시간 {secondsLeft}초</div>
                <div className={styles.noteSub}>지도 위 병원 후보 중 가장 가까운 곳을 골라주세요.</div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.mapPanel}>
          <span className={cx(styles.mapLabel, 'hide-until-desktop')}>
            ◈ {countyLabel} 지도 · 남은 시간 {secondsLeft}초
          </span>
          <KoreaMap
            region={roundRegion?.map ?? null}
            highlight={highlight}
            pins={pins}
            selectedId={selectedId}
            correctId={roundChoice?.round.ranked[0]?.id ?? null}
            revealed={revealed}
            disabled={paused || showIntro}
            onSelect={handleSelect}
          />

          {revealed && reveal ? (
            <div className={styles.resultCard}>
              <span className={styles.verdict}>{reveal.verdict}</span>
              <span className={styles.km}>
                정답: {reveal.correctName}
                {reveal.correctAddr && ` (${reveal.correctAddr})`} · 약 {reveal.correctKm}km
                {reveal.pickedName &&
                  ` · 내 선택: ${reveal.pickedName}${reveal.pickedAddr ? ` (${reveal.pickedAddr})` : ''} · 약 ${reveal.pickedKm}km`}
                {reveal.tieCredited && ' · 거리 차이가 미미해 정답으로 함께 인정했어요'}
              </span>
              <span className={styles.gain}>+{reveal.points}</span>
              <Button variant="ink" className={styles.next} onClick={handleNext}>
                {isLastRound ? '결과 보기' : '다음 라운드'}
              </Button>
            </div>
          ) : (
            <div className={styles.confirmWrap}>
              <span className={cx(styles.confirmHint, 'hide-on-desktop')}>
                지도 위 병원 후보 중 하나를 탭해서 골라보세요
              </span>
              <Button variant="accent" disabled={!selectedId || paused || showIntro} onClick={handleConfirm}>
                ✓ 이 병원으로 확인하기
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
