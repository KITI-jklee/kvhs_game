import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandBar } from '../../components/layout/BrandBar';
import { GameHud } from '../../components/layout/GameHud';
import { DesktopContextBar } from '../../components/layout/DesktopContextBar';
import { KoreaMap, type MapRegion } from '../../components/map/KoreaMap';
import { IconTile } from '../../components/icons/IconTile';
import { HospitalGlyph } from '../../components/icons/Glyphs';
import { Button } from '../../components/Button';
import { PauseOverlay } from '../../components/PauseOverlay';
import { GameIntroOverlay } from '../../components/GameIntroOverlay';
import { useGameData } from '../../data/gameDataContext';
import type { HospitalLocation } from '../../data/types';
import { useGame } from '../../state/gameState';
import { KOREA_BOUNDS, type LatLng, boundsForRegion, haversineKm, scoreForLocationAttempt, spanKmOfBounds } from '../../lib/geo';
import { loadCityOutline } from '../../lib/cityOutline';
import { shuffle } from '../../lib/array';
import styles from './LocationGame.module.css';

const ROUND_COUNT = 5;
const ROUND_TIME_MS = 8000;
const MAX_TOTAL_SCORE = 500;

/** FR-G1-01/06: 회차당 5곳을 중복 없이 뽑되, region_note 병원이 최소 1곳 포함되도록 보장한다. */
function pickRounds(pool: HospitalLocation[]): HospitalLocation[] {
  const withNote = shuffle(pool.filter((p) => p.region_note));
  const rest = shuffle(pool);
  const picks: HospitalLocation[] = [];
  if (withNote.length) picks.push(withNote[0]);
  for (const item of rest) {
    if (picks.length >= ROUND_COUNT) break;
    if (picks.some((p) => p.id === item.id)) continue;
    picks.push(item);
  }
  return shuffle(picks);
}

interface RevealInfo {
  km: number;
  points: number;
  verdict: string;
  timedOut: boolean;
}

interface RoundRecord {
  name: string;
  km: number;
  points: number;
  timedOut: boolean;
}

// scoreForDistanceKm(lib/geo.ts)과 같은 반경 비율 구간을 써서 문구와 점수가 항상 맞물리게 한다.
function verdictFor(km: number, spanKm: number): string {
  const radiusKm = spanKm / 2;
  const ratio = radiusKm > 0 ? km / radiusKm : 1;
  if (ratio <= 0.2) return '거의 정확해요!';
  if (ratio <= 0.45) return '꽤 가까웠어요';
  if (ratio <= 0.8) return '조금 빗나갔어요';
  return '많이 빗나갔어요';
}

export function LocationGame() {
  const navigate = useNavigate();
  const { finishGame } = useGame();
  const { data } = useGameData();
  const pool = data?.locations ?? [];

  const [targets] = useState<HospitalLocation[]>(() => pickRounds(pool));
  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reveal, setReveal] = useState<RevealInfo | null>(null);
  const [records, setRecords] = useState<RoundRecord[]>([]);
  const [remainingMs, setRemainingMs] = useState(ROUND_TIME_MS);
  const [paused, setPaused] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [loadedRegion, setLoadedRegion] = useState<{ targetId: string; value: MapRegion } | null>(null);

  const pinRef = useRef<LatLng | null>(null);
  useEffect(() => {
    pinRef.current = pin;
  }, [pin]);

  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const target = targets[Math.min(roundIndex, targets.length - 1)];
  const isLastRound = roundIndex >= targets.length - 1;
  const region = target && loadedRegion?.targetId === target.id ? loadedRegion.value : null;

  // 정답 병원이 속한 시/군/구 확대 지도를 라운드마다 지연 로드한다 - 사용자
  // 요청: 전국 지도만으로는 정밀하게 찍기 어려우니 시/군 단위로 확대해서 보여줄 것.
  // 매칭 실패/로딩 중에는 region이 null이라 KoreaMap이 전국 지도로 자연스럽게 대체된다.
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    (async () => {
      const outline = await loadCityOutline(target.addr_hint);
      if (cancelled || !outline) return;
      const bounds = boundsForRegion(outline.bbox, { lat: target.latitude, lng: target.longitude });
      setLoadedRegion({
        targetId: target.id,
        value: { rings: outline.rings, bounds, label: target.addr_hint },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  // finishRound(아래)가 region을 최신값으로 읽되, region이 바뀔 때마다
  // finishRound의 정체성이 바뀌어 라운드 타이머 effect가 재실행되며 카운트다운이
  // 8초로 되돌아가는 걸 막기 위해 ref로 참조한다(pinRef/pausedRef와 같은 패턴).
  const regionRef = useRef<MapRegion | null>(null);
  useEffect(() => {
    regionRef.current = region;
  }, [region]);

  // 라운드당 정확히 한 번만 채점되도록 ref로 가드한다. (React StrictMode는
  // setState(updaterFn) 형태의 업데이터 함수를 순수성 검증을 위해 개발 모드에서
  // 두 번 호출하므로, 점수 반영 같은 부수효과는 업데이터 함수 안에 두지 않는다.)
  const revealedRef = useRef(false);
  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);

  const finishRound = useCallback(
    (finalPin: LatLng | null) => {
      if (revealedRef.current) return;
      revealedRef.current = true;
      const timedOut = finalPin === null;
      const km = timedOut ? 0 : haversineKm(finalPin, { lat: target.latitude, lng: target.longitude });
      const spanKm = spanKmOfBounds(regionRef.current?.bounds ?? KOREA_BOUNDS);
      const points = scoreForLocationAttempt(timedOut ? null : km, spanKm);
      const roundedKm = Math.round(km);
      setRevealed(true);
      setScore((s) => s + points);
      setReveal({ km: roundedKm, points, verdict: timedOut ? '시간이 초과됐어요' : verdictFor(km, spanKm), timedOut });
      setRecords((r) => [...r, { name: target.name, km: roundedKm, points, timedOut }]);
    },
    [target],
  );

  // 라운드 제한시간 8초. 확인하지 않고 시간이 끝나면 핀 유무와 관계없이 0점 처리한다.
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
        finishRound(null);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [roundIndex, revealed, showIntro, finishRound]);

  const handleDropPin = (point: LatLng) => {
    if (revealed || paused || showIntro) return;
    setPin(point);
  };

  const handleConfirm = () => {
    if (!pin || revealed || paused || showIntro) return;
    finishRound(pin);
  };

  const handlePause = () => setPaused(true);
  const handleResume = () => setPaused(false);
  const handleExit = () => navigate('/');
  const handleRestart = () => {
    try {
      sessionStorage.setItem('bohun_arcade.intentional_restart', '1');
    } catch { /* reload still resets the game */ }
    window.location.reload();
  };

  const handleNext = () => {
    if (isLastRound) {
      const measuredRecords = records.filter((record) => !record.timedOut);
      const avgKm = measuredRecords.length
        ? Math.round(measuredRecords.reduce((sum, record) => sum + Math.max(record.km, 0), 0) / measuredRecords.length)
        : null;
      finishGame({
        gameId: 'location',
        title: '위치감각게임 완료',
        score,
        stats: [
          { icon: '◎', label: '총점', value: `${score} / ${MAX_TOTAL_SCORE}` },
          { icon: '🧍', label: '진행 라운드', value: `${targets.length} / ${targets.length}` },
        ],
        detailsTitle: '라운드별 위치 감각',
        details: records.map((r, i) => ({
          icon: '📍',
          label: `R${i + 1}`,
          value: r.timedOut ? '시간 초과' : `${r.km}km`,
          badge: `${r.points}점`,
        })),
        note: `${avgKm === null ? '측정된 라운드 없음' : `평균 오차 약 ${avgKm}km`} · 시간 초과 라운드는 평균에서 제외됩니다.`,
      });
      navigate('/result');
      return;
    }
    revealedRef.current = false;
    setRoundIndex((i) => i + 1);
    setPin(null);
    setRevealed(false);
    setReveal(null);
  };

  if (targets.length < ROUND_COUNT) {
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

  return (
    <div className={styles.page}>
      <BrandBar variant="game" />
      <GameHud
        onPause={handlePause}
        eyebrow={`ROUND ${roundIndex + 1} / ${targets.length}`}
        title="보훈병원 위치감각게임"
        score={{ label: 'SCORE', value: score }}
      />
      <DesktopContextBar onBack={() => navigate('/')} onPause={handlePause}>
        <span className={styles.deskRound}>
          라운드 <b>{roundIndex + 1}/{targets.length}</b>
        </span>
        <span className={styles.deskScore}>
          현재 총점 <b>{score} / {MAX_TOTAL_SCORE}</b>
        </span>
      </DesktopContextBar>

      {paused && <PauseOverlay onResume={handleResume} onExit={handleExit} onRestart={handleRestart} />}

      {showIntro && (
        <GameIntroOverlay
          title="보훈병원 위치감각게임"
          onDone={() => setShowIntro(false)}
          rules={[
            { color: '#2abf9e', text: '병원 이름과 지역 힌트를 보고 지도에서 위치를 찍어보세요' },
            { color: '#f0b429', text: <>라운드당 제한시간 <b>8초</b>, 총 <b>5라운드</b>예요</> },
            { color: '#d0705f', text: <>정답과 가까울수록 높은 점수를 얻어요 (최대 <b>100점</b>)</> },
          ]}
        />
      )}

      <div className={styles.body}>
        <div className={styles.questionPanel}>
          <span className={styles.qEyebrow}>QUESTION {String(roundIndex + 1).padStart(2, '0')}</span>
          <IconTile size={52} className="hide-until-desktop">
            <HospitalGlyph accent="var(--color-ink)" size={24} />
          </IconTile>
          <div className={styles.qTextGroup}>
            <span className={styles.qTitle}>
              {target.name},
              <br />
              어디에 있을까요?
            </span>
            <span className={styles.qHint}>{target.addr_hint}</span>
          </div>
          {!revealed && (
            <div className={[styles.noteBox, 'hide-until-desktop'].join(' ')}>
              <span aria-hidden style={{ fontSize: 14, color: 'var(--color-ink)' }}>
                ⏱
              </span>
              <div>
                <div className={styles.noteTitle}>남은 시간 {secondsLeft}초</div>
                <div className={styles.noteSub}>지도에서 예상 위치를 탭하고 확인해 주세요.</div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.mapPanel}>
          <span className={[styles.mapLabel, 'hide-until-desktop'].join(' ')}>
            ◈ {region ? region.label : '대한민국'} 지도 · 남은 시간 {secondsLeft}초
          </span>
          <KoreaMap
            pin={pin}
            target={{ lat: target.latitude, lng: target.longitude }}
            targetLabel={target.name}
            revealed={revealed}
            disabled={paused || showIntro}
            onDropPin={handleDropPin}
            region={region}
          />

          {revealed && reveal ? (
            <div className={styles.resultCard}>
              <span className={styles.verdict}>{reveal.verdict}</span>
              <span className={styles.km}>
                {reveal.timedOut ? '위치를 선택하지 못했어요.' : `정답과 약 ${reveal.km}km 차이입니다.`}
              </span>
              <span className={styles.gain}>+{reveal.points}</span>
              <Button variant="ink" className={styles.next} onClick={handleNext}>
                {isLastRound ? '결과 보기' : '다음 라운드'}
              </Button>
            </div>
          ) : (
            <div className={styles.confirmWrap}>
              <span className={[styles.confirmHint, 'hide-on-desktop'].join(' ')}>
                지도를 탭해서 위치를 찍어보세요
              </span>
              <Button variant="accent" disabled={!pin || paused || showIntro} onClick={handleConfirm}>
                ✓ 이 위치로 확인하기
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
