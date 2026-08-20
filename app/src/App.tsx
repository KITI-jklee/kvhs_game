import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { GameProvider } from './state/GameContext';
import { GameDataProvider } from './data/loader';
import { useGameData } from './data/gameDataContext';
import { FullScreenNotice } from './components/FullScreenNotice';
import { Home } from './pages/Home';
import { LocationGame } from './pages/games/LocationGame';
import { JudgeGame } from './pages/games/JudgeGame';
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

/**
 * 게임/결과 화면에서 브라우저를 새로고침하면 이전 진행 상태를
 * 복원하지 않고 메인에서 다시 시작한다. 앱 내부 라우팅에는 영향을 주지 않는다.
 */
function RefreshToHome() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    try {
      if (sessionStorage.getItem('bohun_arcade.intentional_restart') === '1') {
        sessionStorage.removeItem('bohun_arcade.intentional_restart');
        return;
      }
    } catch {
      // sessionStorage가 막힌 환경에서도 일반 새로고침 처리는 계속한다.
    }
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type === 'reload' && pathname !== '/') {
      navigate('/', { replace: true });
    }
  }, [navigate, pathname]);

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
    return <FullScreenNotice icon="⏳" title="게임 데이터를 불러오는 중입니다..." />;
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
              path="/games/judge"
              element={
                <GameDataGate>
                  <JudgeGame />
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
