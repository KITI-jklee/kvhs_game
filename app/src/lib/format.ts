// 호출부(타이머 state)는 전부 0 이상만 넘기지만, JS의 %는 피제수 부호를
// 따라가서 음수가 들어오면 "−01:−05"처럼 깨진 문자열이 나온다(코드리뷰로
// 발견) - 방어적으로 0 밑으로는 자른다.
export function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatMinSec(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}분 ${s}초`;
}

/** FR-G3-05: 짝을 맞출 때 노출하는 실제 비용. */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}
