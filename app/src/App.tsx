import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { GameProvider } from './state/GameContext';
import { GameDataProvider } from './data/loader';
import { useGameData } from './data/gameDataContext';
import { consumeIntentionalRestartFlag } from './lib/restart';
import { FullScreenNotice } from './components/FullScreenNotice';
import { DataLoadErrorNotice } from './components/DataLoadErrorNotice';
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

// StrictMode의 이중 effect에서 재시작 플래그를 두 번 소비하지 않는다.
let refreshCheckDone = false;

/** 게임 중 브라우저 새로고침은 홈으로 보낸다. */
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
  }, []);

  return null;
}

/** 게임 데이터 로드 상태에 따라 플레이 화면을 제한한다. */
function GameDataGate({ children }: { children: ReactNode }) {
  const { status, retry } = useGameData();
  const navigate = useNavigate();

  if (status === 'loading') {
    return <FullScreenNotice variant="modal" icon="⏳" title="게임 데이터를 불러오는 중입니다..." />;
  }
  if (status === 'error') {
    return <DataLoadErrorNotice onRetry={retry} onHome={() => navigate('/')} />;
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
