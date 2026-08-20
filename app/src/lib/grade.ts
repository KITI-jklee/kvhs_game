import type { Grade } from '../data/types';
import { gradeForScore } from '../data/provider';

export interface GradeProgress {
  grade: Grade;
  index: number;
  next: Grade | null;
  /** 0-100 progress within the current grade's span. */
  percent: number;
  /** Points remaining until the next grade (0 if at the top grade). */
  toNext: number;
}

export function getGradeProgress(score: number, grades: Grade[]): GradeProgress {
  const grade = gradeForScore(score, grades);
  const index = grades.indexOf(grade);
  const next = grades[index + 1] ?? null;
  const spanLo = grade.min;
  const spanHi = grade.max + 1;
  const percent = Math.max(0, Math.min(100, Math.round(((score - spanLo) / (spanHi - spanLo)) * 100)));
  const toNext = next ? Math.max(0, next.min - score) : 0;
  return { grade, index, next, percent, toNext };
}

/**
 * DB 설계서 06_등급산정로직의 getGrade(score)를 그대로 구현한 것.
 * localStorage(`bohun_arcade.last_result.grade`)에 저장하는 정확한 문자열이
 * 필요할 때 사용한다. 화면 표시에는 `Grade` 객체(icon/name 분리)를 쓴다.
 */
export function getGrade(score: number, grades: Grade[]): string {
  const grade = gradeForScore(score, grades);
  return `${grade.icon} 보훈 ${grade.name}`;
}
