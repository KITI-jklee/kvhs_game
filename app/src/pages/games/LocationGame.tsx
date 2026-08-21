import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandBar } from '../../components/layout/BrandBar';
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
  loadRegionsIndex,
  pointsForPick,
  selectNearestChoices,
  type HospitalPoint,
  type NearestRound,
} from '../../lib/nearestHospital';
import { shuffle } from '../../lib/array';
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

/** `pickedId`가 null이면(시간 초과까지 아무것도 안 고름) "빗나갔다"가 아니라
 * "시간이 초과됐다"로 - 둘 다 0점이라 점수만 보면 같지만, 안 고른 것과
 * 골랐는데 틀린 건 다른 상황이라 문구도 구분한다(사용자 피드백). */
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
  /** "보훈 대상자"가 있는 동(읍/면/동) - 시/군 전체를 다 강조하면 후보 병원이
   * 다 그 안에 들어와 판단 근거가 없어지므로(사용자 피드백), 시/군보다 한
   * 단계 좁은 동 하나를 라운드마다 무작위로 골라 지도에 옅게 강조하고 위치
   * 문구에도 그 동 이름을 쓴다. 그 시/군에 동 데이터가 없으면(정상적으로는
   * 발생하지 않아야 함) null - 이때는 시/군 이름만 보여주고 강조도 생략한다. */
  dong: DongOutline | null;
  /** 실제 거리 계산/지도 중심에 쓰는 원점 - `dong?.center`가 있으면 그것,
   * 없으면 시/군 중심(`RegionsIndex.centers`)으로 대체한다. */
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

  // 앱 시작 시 1회: 이번 판 5라운드에서 쓸 지역 + 병원 후보를 미리 다 뽑아
  // 둔다. `_regions.json`은 시/군 확대 지도 기능에서 이미 만들어 둔 시/군/구
  // 목록 + 중심점 인덱스를 그대로 재사용한다.
  //
  // 후보들이 서로 아주 가까운 건 문제 삼지 않는다 - 부산처럼 병원이 촘촘한
  // 대도시라면 후보 5곳이 좁은 범위에 몰려 있는 게 오히려 자연스럽다(사용자
  // 피드백). 대신 두 후보가 지도 위에서 핀/라벨이 겹쳐 하나처럼 보이는 것만
  // `selectNearestChoices`의 `minSeparationKm`으로 막는다.
  useEffect(() => {
    if (!pool.length) return;
    let cancelled = false;
    Promise.all([loadRegionsIndex(), loadDongOutlines()]).then(([index, dongsByAddr]) => {
      if (cancelled) return;
      // 병원 주소를 "OO시"까지가 아니라 "OO시 OO동"까지 보여달라는 요청
      // (사용자 피드백)에 따라, 병원 좌표가 실제로 어느 동 경계 안에
      // 들어가는지 역지오코딩한다 - hospital_locations.json 자체엔 동
      // 정보가 없고 좌표만 있어서, 이미 갖고 있는 동 경계 데이터로 직접
      // 찾는다. 못 찾으면(경계 위 오차 등) 시/군까지만 보여준다.
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
      const candidates = shuffle(Object.keys(index.centers));
      const rounds: RoundChoice[] = [];
      const usedAddrs = new Set<string>();
      for (const addr of candidates) {
        if (rounds.length >= ROUND_COUNT) break;
        if (usedAddrs.has(addr)) continue;
        // 그 시/군 안의 동 하나를 라운드마다 무작위로 골라 "보훈 대상자"의
        // 위치로 쓴다 - 시/군 중심 고정점 하나만 쓰면 매번 같은 지점이라
        // 다양성이 없고, 시/군 전체를 강조하면 후보가 다 그 안에 들어와
        // 판단 근거가 없어진다(사용자 피드백).
        const dongList = dongsByAddr[addr];
        const dong = dongList?.length ? shuffle(dongList)[0] : null;
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

  // 라운드마다 배경 지도를 만든다. 후보 병원/점수는 위에서 이미 다 정해져
  // 있으니, 여기서는 지도에 그릴 배경만 만든다.
  //
  // 배경으로 그리는 땅(도 경계)과 화면에 실제로 보여줄 확대 범위(줌)는
  // 서로 다른 문제라 따로 계산한다:
  // - 땅: 후보 병원이 시작 지점의 시/군 밖(이웃 시/군, 드물게 이웃 도)에
  //   있는 경우가 흔해서, 관련된 도(道) 전체를 합쳐 그린다(안 그러면 그
  //   시/군 밖 후보가 빈 그리드 위에 덩그러니 떠 있게 됨).
  // - 줌: 도 전체 크기로 맞추면, 후보들이 실제로는 한 동네에 몰려있을 때도
  //   지도가 넓게 잡혀 핀 라벨이 서로 겹친다 - 그래서 줌은 도 크기와 무관하게
  //   시작점+병원 후보들의 실제 위치만 기준으로 딱 맞게 잡는다
  //   (`boundsForPoints`). 도 폴리곤 중 화면 밖으로 나가는 부분은 그냥 안
  //   보일 뿐이고, 렌더링엔 문제없다.
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

  // finishRound(아래)의 정체성을 고정해 두어야, roundChoice/region이 라운드
  // 도중에 로드 완료되며 갈아끼워질 때 타이머 effect가 재실행되어 카운트다운이
  // 처음으로 되돌아가는 일이 없다(regionRef와 같은 패턴).
  const roundChoiceRef = useRef<RoundChoice | null>(null);
  useEffect(() => {
    roundChoiceRef.current = roundChoice;
  }, [roundChoice]);

  const isLastRound = roundIndex >= ROUND_COUNT - 1;

  // 라운드당 정확히 한 번만 채점되도록 ref로 가드한다. (React StrictMode는
  // setState(updaterFn) 형태의 업데이터 함수를 순수성 검증을 위해 개발 모드에서
  // 두 번 호출하므로, 점수 반영 같은 부수효과는 업데이터 함수 안에 두지 않는다.)
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
  const handleRestart = () => {
    try {
      sessionStorage.setItem('bohun_arcade.intentional_restart', '1');
    } catch {
      /* reload still resets the game */
    }
    window.location.reload();
  };

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
    return (
      <div className={styles.page}>
        <BrandBar variant="game" />
        <div className={styles.body}>
          <span>게임 데이터를 불러오는 중입니다...</span>
        </div>
      </div>
    );
  }

  const secondsLeft = Math.ceil(remainingMs / 1000);
  const countyLabel = countyAddr ?? '';
  // 동 이름까지 있으면 "경기도 양주시 옥정동 인근", 없으면(동 데이터가 없는
  // 극히 드문 경우) 시/군 이름까지만 - 시/군 전체를 강조하면 후보 병원이 다
  // 그 안에 들어와 판단 근거가 없어지므로, 되도록 동 단위까지 좁혀서 보여준다.
  const dongName = roundChoice?.dong?.name ?? null;
  const locationLabel = dongName ? `${countyLabel} ${dongName} 인근` : countyLabel;
  const roundRegion = countyAddr && region?.countyAddr === countyAddr ? region : null;
  const highlight = roundChoice?.dong ? { rings: roundChoice.dong.rings } : null;
  const pins: MapPin[] = roundChoice?.countyAddr === countyAddr
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
            { color: '#2abf9e', text: '보훈 대상자가 있는 지역과 병원 후보 5곳을 보고, 가장 가까운 위탁병원을 골라보세요' },
            { color: '#f0b429', text: <>라운드당 제한시간 <b>5초</b>, 총 <b>5라운드</b>예요</> },
            { color: '#d0705f', text: <>가까운 순서에 따라 최대 <b>100점</b>까지 차등 채점돼요</> },
          ]}
        />
      )}

      <div className={styles.body}>
        <div className={styles.questionPanel}>
          <div className={styles.qHeaderRow}>
            <span className={styles.qEyebrow}>MISSION {String(roundIndex + 1).padStart(2, '0')}</span>
            {/* 데스크톱엔 아래 noteBox에 남은 시간이 있지만 그건 데스크톱
                전용이라, 모바일에선 카운트다운이 아예 안 보이는 문제가
                있었다(사용자 피드백) - 모바일에서는 이 카드 우측 상단에
                따로 보여준다. */}
            {!revealed && (
              <span className={[styles.mobileTimer, 'hide-on-desktop'].join(' ')}>⏱ 남은 시간 {secondsLeft}초</span>
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
            <div className={[styles.noteBox, 'hide-until-desktop'].join(' ')}>
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
          <span className={[styles.mapLabel, 'hide-until-desktop'].join(' ')}>
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
              </span>
              <span className={styles.gain}>+{reveal.points}</span>
              <Button variant="ink" className={styles.next} onClick={handleNext}>
                {isLastRound ? '결과 보기' : '다음 라운드'}
              </Button>
            </div>
          ) : (
            <div className={styles.confirmWrap}>
              <span className={[styles.confirmHint, 'hide-on-desktop'].join(' ')}>
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
