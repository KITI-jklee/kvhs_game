export const MATCH_MIN_SCORE = 100;
export const MATCH_MAX_SCORE = 500;
// 12→16→20장을 처음 접하는 사용자도 내용을 읽으며 끝까지 풀 수 있도록
// 2분 30초까지는 시간 감점을 유예하고, 오답 감점도 완만하게 적용한다.
export const MATCH_BASE_TIME_SEC = 150;
export const MATCH_TIME_PENALTY_PER_SEC = 1;
export const MATCH_MISMATCH_PENALTY = 3;

/** 현재 밸런스 값. 최종 산식 확정 전까지 단조성과 100~500 범위를 보장한다. */
export function computeMatchScore(elapsedSec: number, mismatches: number): number {
  const overTime = Math.max(0, elapsedSec - MATCH_BASE_TIME_SEC);
  const raw = MATCH_MAX_SCORE
    - overTime * MATCH_TIME_PENALTY_PER_SEC
    - mismatches * MATCH_MISMATCH_PENALTY;
  return Math.max(MATCH_MIN_SCORE, Math.min(MATCH_MAX_SCORE, Math.round(raw)));
}
