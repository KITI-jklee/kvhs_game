import type { HospitalName } from '../data/types';
import { sample, shuffle } from './array';

export const TOTAL_QUESTIONS = 20;
export const REAL_RATIO = 0.7;
export const POINTS_PER_QUESTION = 25;
export const TIME_START_MS = 4500;
export const TIME_END_MS = 1500;

export function timeForIndex(index: number): number {
  const progress = TOTAL_QUESTIONS <= 1 ? 0 : index / (TOTAL_QUESTIONS - 1);
  return Math.round(TIME_START_MS - (TIME_START_MS - TIME_END_MS) * progress);
}

export function pickJudgeQuestions(pool: HospitalName[]): HospitalName[] {
  const reals = pool.filter((hospital) => hospital.is_real);
  const reviewedFakes = pool.filter((hospital) => !hospital.is_real && hospital.reviewed);
  const realCount = Math.round(TOTAL_QUESTIONS * REAL_RATIO);
  const fakeCount = TOTAL_QUESTIONS - realCount;
  if (reals.length < realCount || reviewedFakes.length < fakeCount) {
    throw new Error('not enough hospital names to build a 70:30 round');
  }
  return shuffle([...sample(reals, realCount), ...sample(reviewedFakes, fakeCount)]);
}

export function judgeScore(correctCount: number): number {
  return Math.max(0, Math.min(500, correctCount * POINTS_PER_QUESTION));
}
