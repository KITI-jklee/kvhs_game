/**
 * 게임 페이지의 "다시하기"는 상태를 깨끗이 초기화하려고 `window.location.reload()`를
 * 쓰는데, `App.tsx`의 `RefreshToHome`은 게임/결과 화면에서의 새로고침을 감지하면
 * 메인으로 튕겨보낸다(사용자가 브라우저 새로고침 버튼을 눌렀을 때의 의도).
 * 그래서 "의도된 재시작"은 새로고침 직전에 세션 플래그를 남겨 구분한다 - 이
 * 키 하나를 쓰는 쪽(각 게임의 handleRestart)과 읽는 쪽(RefreshToHome)이
 * 예전엔 따로따로 하드코딩되어 있어 한 곳만 오타 나면 그 게임만 조용히
 * 깨지는 위험이 있었다.
 */
const RESTART_FLAG_KEY = 'bohun_arcade.intentional_restart';

/** 다시하기 버튼에서 호출 - 플래그를 남기고 새로고침한다. */
export function restartGame(): void {
  try {
    sessionStorage.setItem(RESTART_FLAG_KEY, '1');
  } catch {
    /* reload still resets the game */
  }
  window.location.reload();
}

/** `RefreshToHome`에서 호출 - 플래그가 있으면 소비하고 true(의도된 재시작이니
 * 홈으로 안 보내도 됨), 없으면 false(일반 새로고침)를 돌려준다. */
export function consumeIntentionalRestartFlag(): boolean {
  try {
    if (sessionStorage.getItem(RESTART_FLAG_KEY) === '1') {
      sessionStorage.removeItem(RESTART_FLAG_KEY);
      return true;
    }
  } catch {
    // sessionStorage가 막힌 환경에서도 일반 새로고침 처리는 계속한다.
  }
  return false;
}
