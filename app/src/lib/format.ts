export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatMinSec(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}분 ${s}초`;
}

/** FR-G3-05: 짝을 맞출 때 노출하는 실제 비용. */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}
