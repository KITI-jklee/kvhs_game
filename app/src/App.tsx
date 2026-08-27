import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { GameProvider } from './state/GameContext';
import { GameDataProvider } from './data/loader';
import { useGameData } from './data/gameDataContext';
import { consumeIntentionalRestartFlag } from './lib/restart';
import { FullScreenNotice } from './components/FullScreenNotice';
import { Home } from './pages/Home';
import { LocationGame } from './pages/games/LocationGame';
import { MedicalCostGame } from './pages/games/MedicalCostGame';
import { MatchGame } from './pages/games/MatchGame';
import { Result } from './pages/Result';
import { Grade } from './pages/Grade';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// StrictMode(main.tsx)는 개발 모드에서 마운트 시 effect를 일부러 두 번
// 불러 버그를 드러낸다. 아래 effect는 sessionStorage 플래그를 "읽고 지우는"
// 부수효과가 있어서 두 번 불리면 결과가 달라진다 - 1번째 호출: 플래그를
// 보고 지우고 return(정상). 2번째 호출: 플래그가 이미 없으니 그대로
// "새로고침으로 열렸다" 분기로 빠져서 홈으로 튕겨버린다(사용자 피드백:
// "다시하기 누르면 메인페이지로 넘어가는 오류"). 컴포넌트가 이 세션에서
// 다시 마운트될 일이 없으므로, 모듈 스코프 변수로 "이미 판정했음"을
// 기억해 두 번째 호출을 완전히 무시한다.
let refreshCheckDone = false;

/**
 * 게임/결과 화면에서 브라우저를 새로고침하면 이전 진행 상태를
 * 복원하지 않고 메인에서 다시 시작한다. 앱 내부 라우팅에는 영향을 주지 않는다.
 */
function RefreshToHome() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (refreshCheckDone) return;
    refreshCheckDone = true;
    if (consumeIntentionalRestartFlag()) return;
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type === 'reload' && location.pathname !== '/') {
      navigate('/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 문서가 처음 로드될 때 1회만 - pathname을 deps에 넣으면 안 됨(위 설명 참고)

  return null;
}

/**
 * 게임 플레이 화면은 정적 JSON 3종이 로드된 뒤에만 진입 가능하다(DR-04).
 * 기능설계서 8장: 로드 실패 시 재시도/메인 복귀 안내를 보여준다.
 */
function GameDataGate({ children }: { children: ReactNode }) {
  const { status, retry } = useGameData();
  const navigate = useNavigate();

  if (status === 'loading') {
    return <FullScreenNotice variant="modal" icon="⏳" title="게임 데이터를 불러오는 중입니다..." />;
  }
  if (status === 'error') {
    return (
      <FullScreenNotice
        icon="⚠️"
        title="게임 데이터를 불러오지 못했어요"
        subtitle="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
        actionLabel="다시 시도"
        onAction={retry}
        secondaryLabel="메인으로 돌아가기"
        onSecondary={() => navigate('/')}
      />
    );
  }
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <GameDataProvider>
        <GameProvider>
          <ScrollToTop />
          <RefreshToHome />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/games/location"
              element={
                <GameDataGate>
                  <LocationGame />
                </GameDataGate>
              }
            />
            <Route
              path="/games/medical-cost"
              element={
                <GameDataGate>
                  <MedicalCostGame />
                </GameDataGate>
              }
            />
            <Route
              path="/games/match"
              element={
                <GameDataGate>
                  <MatchGame />
                </GameDataGate>
              }
            />
            <Route path="/result" element={<Result />} />
            <Route path="/grade" element={<Grade />} />
          </Routes>
        </GameProvider>
      </GameDataProvider>
    </BrowserRouter>
  );
}

export default App;
