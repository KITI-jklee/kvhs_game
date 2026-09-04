import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandBar } from '../../components/layout/BrandBar';
import { FullScreenNotice } from '../../components/FullScreenNotice';
import { DataLoadErrorNotice } from '../../components/DataLoadErrorNotice';
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
  getTiedGroup,
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

interface TiedAnswer {
  id: string;
  name: string;
  addr: string;
  km: number;
  /** 도서·벽지 지정 위탁병원인지 - 정답이 여럿이면 각자 따로 표시해야 한다. */
  isRemoteArea: boolean;
  /** 이 병원이 정답인지와 무관하게(동률이어도) 내가 실제로 고른 병원인지. */
  isPicked: boolean;
}

interface RevealInfo {
  points: number;
  verdict: string;
  /** 1등과 동률인 정답 전부(1등 자신 포함, km 오름차순) - 내가 뭘 골랐는지와
   * 무관하게 항상 다 보여준다. 대부분은 원소가 1개뿐이다. */
  tiedAnswers: TiedAnswer[];
  pickedName: string | null;
  pickedAddr: string | null;
  pickedKm: number | null;
  /** 내가 고른 병원이 tiedAnswers 중 하나인지 - true면 "내 선택" 줄을 따로 안 보여준다. */
  pickIsTied: boolean;
}

interface RoundRecord {
  countyLabel: string;
  /** 1등과 동률인 정답 전부의 이름(1등 자신 포함) - 최종 결과 상세에서도
   * 라운드 화면과 마찬가지로 동률 정답을 전부 보여주기 위함. */
  correctNames: string[];
  points: number;
  /** 동률 정답 중 하나라도 도서·벽지 지정 위탁병원이면 true. */
  isRemoteArea: boolean;
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
  // regions.json/dong_outlines.json 로드가 실패하면 setup이 영영 null로 남아
  // 로딩 화면에서 멈추므로, 실패를 별도로 구분해 재시도 UI를 보여준다.
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

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
          isRemoteArea: h.is_remote_area,
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
      // addr 하나로 라운드 하나를 만들어본다 - 실패하면 null(호출부가 다른 addr로 넘어간다).
      // forcedDongName은 디버그 경고 문구용일 뿐 RoundChoice 자체엔 필요 없어서 별도로 얹는다.
      const buildRound = (addr: string): (RoundChoice & { forcedDongName?: string }) | null => {
        const dongList = dongsByAddr[addr];
        const forcedDong = addr === debugAddr && debugDong ? dongList?.find((d) => d.name === debugDong) : undefined;
        const dong = forcedDong ?? (dongList?.length ? shuffle(dongList)[0] : null);
        const origin = dong?.center ?? index.centers[addr];
        // dong 경계가 있으면 "중심점까지 거리"가 아니라 "그 동 경계 안이면 0, 밖이면
        // 경계까지 최소거리"로 채점한다 - nearestHospital.ts의 selectNearestChoices
        // 주석 참고. 시/군 중심 fallback(dong 없음)일 때는 그대로 직선거리를 쓴다.
        const round = selectNearestChoices(hospitalPoints, origin, DECOY_COUNT, SEARCH_POOL_SIZE, undefined, dong?.rings);
        if (round.ranked.length < 2) return null; // 정답+오답 1개도 없으면 라운드 자체가 성립하지 않는다.
        return { countyAddr: addr, dong, origin, round, forcedDongName: forcedDong?.name };
      };

      const rounds: RoundChoice[] = [];
      const usedAddrs = new Set<string>();
      // 1차: 최소 3지선다(정답+오답 2개) 이상인 지역만 받는다 - 대부분 이 단계에서 다 채워진다.
      for (const addr of candidates) {
        if (rounds.length >= ROUND_COUNT) break;
        if (usedAddrs.has(addr)) continue;
        const built = buildRound(addr);
        if (!built || built.round.ranked.length < 3) {
          // debugAddr/debugDong으로 지정한 지역이 여기서 걸러지면(뭉침 회피·거리
          // 상한을 지키다 선택지가 부족해서) 2차에서 살아남을 수도, 아예 재추첨
          // 대상에서 밀릴 수도 있다 - 재현하려던 지역이 조용히 사라지지 않게 알린다.
          if (built?.forcedDongName) {
            // eslint-disable-next-line no-console
            console.warn(
              `[LocationGame] debugAddr/debugDong으로 지정한 "${addr} ${built.forcedDongName}"이 최소 3지선다 기준(선택지 ${built.round.ranked.length}개)을 못 채워 1차에서 건너뜁니다. 2차 백업에서 완화된 기준으로 다시 시도합니다.`,
            );
          }
          continue;
        }
        rounds.push(built);
        usedAddrs.add(addr);
      }
      // 2차 백업: 병원이 희소한 지역이 하필 몰려 뽑혀서 1차만으로 ROUND_COUNT를 못
      // 채우는(현재 데이터로는 사실상 없지만) 경우에도 화면이 빈 라운드로 멈추지
      // 않도록, 남은 후보 중 최소 2지선다(정답+오답 1개)까지는 완화해서 채운다.
      if (rounds.length < ROUND_COUNT) {
        for (const addr of candidates) {
          if (rounds.length >= ROUND_COUNT) break;
          if (usedAddrs.has(addr)) continue;
          const built = buildRound(addr);
          if (!built) continue;
          rounds.push(built);
          usedAddrs.add(addr);
        }
      }
      setSetup({ rounds });
    }).catch((err: unknown) => {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.error('[LocationGame] 라운드 데이터(지역/동 경계) 로드 실패', err);
      setLoadError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pool, retryKey]);

  const roundChoice = setup?.rounds[roundIndex] ?? null;
  const countyAddr = roundChoice?.countyAddr ?? null;
  // region은 이전 라운드의 값을 잠깐 들고 있을 수 있으니, 지금 라운드 것으로
  // 확정된 것만 쓴다 - 지도(핀)가 실제로 그려질 준비가 됐는지 판단하는 기준이라
  // 아래 타이머 게이트에서도 그대로 재사용한다.
  const roundRegion = countyAddr && region?.countyAddr === countyAddr ? region : null;

  // roundChoice가 바뀌지 않는 한(라운드 중 카운트다운 tick마다도) 같은 배열 참조를
  // 유지해야 KoreaMap의 라벨 배치 useMemo가 매 100ms마다 다시 도는 걸 막을 수 있다.
  const pins: MapPin[] = useMemo(
    () => (roundChoice ? roundChoice.round.shuffled.map((c) => ({ id: c.id, center: c.center, label: c.name })) : []),
    [roundChoice],
  );
  // pins와 같은 이유로 reveal이 바뀌지 않는 한 같은 배열 참조를 유지한다 - 이게
  // 없으면 5초 타이머가 100ms마다 리렌더할 때(reveal은 계속 null)마다 매번 새
  // []가 만들어져 KoreaMap의 pinViews useMemo가 불필요하게 다시 돈다.
  const correctIds = useMemo(() => reveal?.tiedAnswers.map((a) => a.id) ?? [], [reveal]);

  // 배경은 관련 도 전체, 줌은 실제 후보 위치를 기준으로 잡는다.
  useEffect(() => {
    if (!countyAddr || !roundChoice) return;
    const { origin } = roundChoice;

    let cancelled = false;
    (async () => {
      const originProvince = countyAddr.split(' ')[0];
      const provincesInvolved = Array.from(new Set([originProvince, ...roundChoice.round.ranked.map((c) => c.province)]));
      const points = [origin, ...roundChoice.round.shuffled.map((c) => c.center)];
      // 배경(도 경계) 로드가 실패해도 핀 선택 자체는 막지 않는다 - rings가 없으면
      // KoreaMap이 배경 없이 핀만 그린다. bounds는 후보 좌표만으로 계산되니 이
      // 실패와 무관하게 항상 만들 수 있다. region이 영영 안 채워지면(재시도 없이)
      // 타이머 게이트(아래 useEffect) 때문에 라운드가 영구히 멈추므로 반드시
      // 여기서 region을 채워야 한다.
      let rings: [number, number][][] = [];
      try {
        const provinceOutlines = await loadProvinceOutlines();
        if (cancelled) return;
        const provinceEntries = provincesInvolved
          .map((p) => provinceOutlines[p])
          .filter((p): p is ProvinceOutline => Boolean(p));
        rings = provinceEntries.flatMap((p) => p.rings);
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[LocationGame] 배경 지도(도 경계) 로드 실패 - 배경 없이 진행합니다.', err);
      }
      if (cancelled) return;
      setRegion({ countyAddr, map: { rings, bounds: boundsForPoints(points) } });
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

  // 목표(ROUND_COUNT)를 못 채우고 더 적은 라운드로 시작한 경우(희소 지역이 몰려
  // 뽑힌 극단치 대비 안전장치)에도, 실제로 만들어진 라운드 수를 기준으로 마지막
  // 라운드인지 판단한다 - setup이 아직 없으면(로딩 중) ROUND_COUNT로 대체.
  const isLastRound = roundIndex >= (setup?.rounds.length ?? ROUND_COUNT) - 1;

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
    const picked = pickedId ? ranked.find((c) => c.id === pickedId) ?? null : null;
    // 병원 addr과 같은 형식("도/시 시/군/구 읍/면/동")으로 맞춰야 비교가 된다.
    const originAddr = rc.dong ? `${rc.countyAddr} ${rc.dong.name}` : rc.countyAddr;
    const points = pointsForPick(ranked, pickedId, originAddr);
    // 내가 뭘 골랐는지와 무관하게, 1등과 동률인 정답을 전부 모아 보여준다 - 대동의원을
    // 직접 맞혀도 같은 동네의 순창요양병원 역시 동률 정답이었다는 걸 알 수 있게.
    const tiedGroup = getTiedGroup(ranked, originAddr);
    const pickIsTied = Boolean(picked) && tiedGroup.some((t) => t.id === picked!.id);
    setRevealed(true);
    setScore((s) => s + points);
    setReveal({
      points,
      verdict: verdictForPoints(points, pickedId),
      tiedAnswers: tiedGroup.map((t) => ({
        id: t.id,
        name: t.name,
        addr: t.addr ?? '',
        km: Math.round(t.km * 10) / 10,
        isRemoteArea: Boolean(t.isRemoteArea),
        isPicked: picked?.id === t.id,
      })),
      pickedName: picked && !pickIsTied ? picked.name : null,
      pickedAddr: picked && !pickIsTied ? picked.addr ?? '' : null,
      pickedKm: picked && !pickIsTied ? Math.round(picked.km * 10) / 10 : null,
      pickIsTied,
    });
    setRecords((r) => [
      ...r,
      {
        countyLabel: cityLabel(rc.countyAddr),
        correctNames: tiedGroup.map((t) => t.name),
        points,
        isRemoteArea: tiedGroup.some((t) => t.isRemoteArea),
      },
    ]);
  }, []);

  // 라운드 제한시간. 확인하지 않고 시간이 끝나면 그때까지 고른 후보로(안 골랐으면 오답으로) 채점한다.
  // 일시정지 중에는 tick만 건너뛰어 카운트다운을 그대로 멈춘다.
  // roundRegion이 준비되기 전에는 시작하지 않는다 - 지도 배경/투영(KoreaMap의
  // projection)이 region에 의존해서, region이 없으면 핀이 아예 안 그려진
  // 빈 지도 상태다. 그 상태에서 타이머가 먼저 돌면 후보를 보지도 못한 채
  // 시간 초과로 자동 채점되어 버린다.
  useEffect(() => {
    if (revealed || showIntro || !roundRegion) return;
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
  }, [roundIndex, revealed, showIntro, finishRound, roundRegion]);

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
      // 목표(ROUND_COUNT)를 못 채운 극단치 대비 안전장치 - 실제로 진행된
      // 라운드 수(records.length)를 기준으로 통계를 낸다.
      const playedRounds = records.length;
      // 만점도 실제로 진행된 라운드 수 기준이어야 한다 - 고정값(500)을 쓰면
      // ROUND_COUNT(5)보다 적게 라운드가 만들어졌을 때 만점을 받아도 분모가
      // 그대로 500으로 표시되는 버그가 생긴다.
      const maxTotalScore = playedRounds * RANK_POINTS[0];
      const bestCount = records.filter((r) => r.points === RANK_POINTS[0]).length;
      const remoteCount = records.filter((r) => r.isRemoteArea).length;
      const remoteNote = remoteCount > 0 ? ` · 이번 판에서 도서·벽지 위탁병원 ${remoteCount}곳을 만났어요` : '';
      finishGame({
        gameId: 'location',
        title: '가장 가까운 위탁병원 찾기 완료',
        score,
        stats: [
          { icon: '◎', label: '총점', value: `${score} / ${maxTotalScore}` },
          { icon: '🧍', label: '진행 라운드', value: `${playedRounds} / ${playedRounds}` },
        ],
        detailsTitle: '라운드별 가장 가까운 위탁병원',
        details: records.map((r, i) => ({
          icon: '📍',
          label: `R${i + 1} · ${r.countyLabel}`,
          value: r.correctNames.join(' / '),
          badge: `${r.points}점`,
          tag: r.isRemoteArea ? '도서·벽지' : undefined,
        })),
        note: `${bestCount} / ${playedRounds}라운드 정답 · 가까운 순서에 따라 최대 100점부터 차등 채점됩니다.${remoteNote}`,
      });
      navigate('/result');
      return;
    }
    revealedRef.current = false;
    setRoundIndex((i) => i + 1);
    setSelectedId(null);
    setRevealed(false);
    setReveal(null);
    // 타이머 effect는 100ms 뒤 첫 tick에서야 remainingMs를 갱신하므로, 여기서
    // 미리 초기화하지 않으면 다음 라운드 화면이 뜨는 첫 순간 이전 라운드의
    // 잔여 시간(0초 등)이 잠깐 그대로 보인다.
    setRemainingMs(ROUND_TIME_MS);
  };

  if (loadError) {
    return (
      <DataLoadErrorNotice
        variant="modal"
        onRetry={() => {
          setLoadError(false);
          setRetryKey((k) => k + 1);
        }}
        onHome={() => navigate('/')}
      />
    );
  }
  if (!setup || !pool.length) {
    return <FullScreenNotice variant="modal" icon="⏳" title="게임 데이터를 불러오는 중입니다..." />;
  }
  if (setup.rounds.length === 0) {
    // 전국 데이터로는 사실상 안 나오지만(230개 시/군 중 5개조차 못 만들 정도로
    // 병원이 희소할 순 없음), 만에 하나를 대비한 안전장치 - 조용히 멈추는 것보다
    // 이유를 알려주는 게 낫다.
    return (
      <FullScreenNotice
        variant="modal"
        icon="⚠️"
        title="이번엔 라운드를 만들지 못했어요"
        subtitle="잠시 후 다시 시도해주세요."
      />
    );
  }
  // 병원이 희소한 지역이 몰려 뽑혀서 목표(ROUND_COUNT)를 못 채운 경우에도, 실제로
  // 만들어진 라운드 수를 기준으로 진행한다(재추첨 로직 자체는 nearestHospital.ts의
  // 8km/뭉침 하드 제약과 짝을 이루는 안전장치일 뿐, 여기서 또 억지로 채우지 않는다).
  const totalRounds = setup.rounds.length;

  const secondsLeft = Math.ceil(remainingMs / 1000);
  const countyLabel = countyAddr ?? '';
  // 동 이름까지 있으면 "경기도 양주시 옥정동 인근", 없으면 시/군 이름까지만.
  const dongName = roundChoice?.dong?.name ?? null;
  const locationLabel = dongName ? `${countyLabel} ${dongName} 인근` : countyLabel;
  const highlight = roundChoice?.dong ? { rings: roundChoice.dong.rings } : null;

  return (
    <div className={styles.page}>
      <BrandBar variant="game" />
      <GameHud
        onPause={handlePause}
        eyebrow={`ROUND ${roundIndex + 1} / ${totalRounds}`}
        title="가장 가까운 위탁병원 찾기"
        score={{ label: 'SCORE', value: score }}
        disabled={paused || showIntro}
      />
      <DesktopContextBar onBack={() => navigate('/')} onPause={handlePause} disabled={paused || showIntro}>
        <span className={styles.deskRound}>
          라운드 <b>{roundIndex + 1}/{totalRounds}</b>
        </span>
        <span className={styles.deskScore}>
          현재 총점 <b>{score} / {totalRounds * RANK_POINTS[0]}</b>
        </span>
      </DesktopContextBar>

      {paused && <PauseOverlay onResume={handleResume} onExit={handleExit} onRestart={handleRestart} />}

      {showIntro && (
        <GameIntroOverlay
          title="가장 가까운 위탁병원 찾기"
          onDone={() => setShowIntro(false)}
          rules={[
            { color: '#2abf9e', text: '주어진 위치에서 가장 가까운 위탁병원을 골라보세요' },
            { color: '#f0b429', text: <>라운드당 제한시간 <b>5초</b>, 총 <b>{totalRounds}라운드</b>예요</> },
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
            ◈ {countyLabel} 지도{!revealed && ` · 남은 시간 ${secondsLeft}초`}
          </span>
          <KoreaMap
            region={roundRegion?.map ?? null}
            highlight={highlight}
            pins={pins}
            selectedId={selectedId}
            correctIds={correctIds}
            revealed={revealed}
            disabled={paused || showIntro}
            onSelect={handleSelect}
          />

          {revealed && reveal ? (
            <div className={styles.resultCard}>
              <span className={styles.verdict}>{reveal.verdict}</span>
              {reveal.tiedAnswers.some((a) => a.isRemoteArea) && (
                <span className={styles.remoteBadge}>📍 도서·벽지 위탁병원</span>
              )}
              <span className={styles.km}>
                {/* 내가 뭘 골랐는지와 무관하게 동률 정답을 전부 보여준다("/") - 대부분은
                    한 곳뿐이지만, 같은 동네에 정답이 여럿이면 다 나온다. 내가 그중 하나를
                    골랐으면 그 옆에 "(내 선택)"을 붙인다. */}
                정답: {reveal.tiedAnswers
                  .map(
                    (a) =>
                      `${a.name}${a.addr ? ` (${a.addr})` : ''} · 약 ${a.km}km${a.isPicked ? ' (내 선택)' : ''}`,
                  )
                  .join(' / ')}
                {!reveal.pickIsTied &&
                  reveal.pickedName &&
                  ` · 내 선택: ${reveal.pickedName}${reveal.pickedAddr ? ` (${reveal.pickedAddr})` : ''} · 약 ${reveal.pickedKm}km`}
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
