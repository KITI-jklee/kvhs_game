import type { GameSummary, Grade } from './types';

/**
 * ---------------------------------------------------------------------------
 * STATIC APP CONTENT (games list, grade table)
 * ---------------------------------------------------------------------------
 * Game *content* (hospital locations/names, term pairs) is no longer mocked
 * here - it's loaded at app start from `public/data/*.json` via
 * `data/loader.tsx`, which is the seam for the real 한국보훈복지의료공단 데이터
 * (see `build_game_data.py`). This file only holds content that has no
 * external data source: the game catalogue and the grade table.
 * ---------------------------------------------------------------------------
 */

const GAMES: GameSummary[] = [
  {
    id: 'location',
    no: '01',
    title: '어디가 제일 가까울까?',
    desc: '가장 가까운 위탁병원을 찾아보세요.',
    tag: 'MAP',
    kicker: 'QUIZ',
    path: '/games/location',
  },
  {
    id: 'medical_cost',
    no: '02',
    title: '얼마나 나올까?',
    desc: '비급여 비용, 얼마나 알고 있나요?',
    tag: 'PRICE SENSE',
    kicker: 'GUESS',
    path: '/games/medical-cost',
  },
  {
    id: 'term_match',
    no: '03',
    title: '딱 맞는 짝을 찾아라!',
    desc: '진료 항목과 알맞은 짝을 찾아보세요.',
    tag: 'MEMORY',
    kicker: 'MATCH',
    path: '/games/match',
  },
];

/** DB 설계서 06_등급산정로직 / 04_코드값 그대로 (0~500점 5단계). */
const GRADES: Grade[] = [
  { icon: '🌱', name: '새싹', range: '0~149점', min: 0, max: 149 },
  { icon: '🔎', name: '탐험가', range: '150~249점', min: 150, max: 249 },
  { icon: '🧭', name: '길잡이', range: '250~349점', min: 250, max: 349 },
  { icon: '💡', name: '척척박사', range: '350~449점', min: 350, max: 449 },
  { icon: '🏆', name: '마스터', range: '450~500점', min: 450, max: 500 },
];

export function getGames(): GameSummary[] {
  return GAMES;
}

export function getGrades(): Grade[] {
  return GRADES;
}

export function gradeForScore(score: number, grades: Grade[] = GRADES): Grade {
  let current = grades[0];
  for (const g of grades) {
    if (score >= g.min) current = g;
  }
  return current;
}
