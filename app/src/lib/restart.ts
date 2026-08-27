/** 일반 새로고침과 게임의 의도된 재시작을 구분하는 세션 플래그. */
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
