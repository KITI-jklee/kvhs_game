import type { MedicalCostItem } from '../data/types';
import { sample, shuffle } from './array';

/** 의료비 게임의 라운드 생성과 채점 로직. */

export const ROUND_COUNT = 5;
export const MAX_TOTAL_SCORE = 500;

// 가격 범위가 넓어 로그 슬라이더를 쓴다.
export const SLIDER_MIN = 10_000;
// 실제 데이터 상한에 맞춰 정답이 없는 슬라이더 구간을 없앤다.
export const SLIDER_MAX = 1_200_000;

/** 가격을 슬라이더가 다룰 수 있는 [SLIDER_MIN, SLIDER_MAX] 범위로 자른다 -
 * 슬라이더 위치 변환과 +-버튼 조정이 모두 이 함수를 같이 써야 두 곳의
 * 클램프 규칙이 따로 놀지 않는다. */
export function clampPrice(price: number): number {
  return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, price));
}

/** 슬라이더 위치(0~1) -> 실제 가격(원, 1천원 단위로 보기 좋게 반올림). */
export function sliderPositionToPrice(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const value = SLIDER_MIN * (SLIDER_MAX / SLIDER_MIN) ** clamped;
  return Math.round(value / 1000) * 1000;
}

/** 가격을 로그 슬라이더 위치(0~1)로 변환한다. */
export function pricePositionRatio(price: number): number {
  const clamped = clampPrice(price);
  return Math.log(clamped / SLIDER_MIN) / Math.log(SLIDER_MAX / SLIDER_MIN);
}

export interface SliderVerdict {
  points: number;
  label: string;
  errorPercent: number;
}

/** 오차율(%) 기준 채점 - 정확한 금액보다 "감각"에 후하게 점수를 준다. */
export function scoreSlider(guess: number, actual: number): SliderVerdict {
  const errorRatio = actual > 0 ? Math.abs(guess - actual) / actual : 1;
  const errorPercent = Math.round(errorRatio * 100);
  if (errorRatio <= 0.1) return { points: 100, label: 'PERFECT!', errorPercent };
  if (errorRatio <= 0.25) return { points: 70, label: 'GREAT', errorPercent };
  if (errorRatio <= 0.4) return { points: 40, label: 'CLOSE', errorPercent };
  if (errorRatio <= 0.7) return { points: 15, label: 'FAR', errorPercent };
  return { points: 0, label: 'MISS', errorPercent };
}

// 가장 가까운 로그 사다리 값과 인접한 오답 3개를 제시한다.
const BAND_LADDER = [
  5_000, 7_000, 10_000, 20_000, 30_000, 50_000, 70_000, 100_000, 200_000, 300_000, 500_000, 700_000, 1_000_000,
  2_000_000, 3_000_000, 5_000_000,
];

export interface PriceBand {
  value: number;
  label: string;
}

function bandLabel(value: number, exact = false): string {
  const prefix = exact ? '' : '약 ';
  if (value >= 10_000) return `${prefix}${Math.round(value / 10_000)}만원`;
  return `${prefix}${value.toLocaleString('ko-KR')}원`;
}

export interface BandRound {
  bands: PriceBand[];
  correctIndex: number;
}

export function pickBandChoices(actualCost: number): BandRound {
  let closestIdx = 0;
  let bestDiff = Infinity;
  BAND_LADDER.forEach((value, i) => {
    const diff = Math.abs(Math.log(value) - Math.log(actualCost));
    if (diff < bestDiff) {
      bestDiff = diff;
      closestIdx = i;
    }
  });
  const decoyIdx: number[] = [];
  for (let d = 1; d < BAND_LADDER.length && decoyIdx.length < 3; d++) {
    if (closestIdx - d >= 0) decoyIdx.push(closestIdx - d);
    if (decoyIdx.length < 3 && closestIdx + d < BAND_LADDER.length) decoyIdx.push(closestIdx + d);
  }

  // 실제 가격이 만원 단위로 딱 떨어지면(예: 40,000원) 사다리에서 로그상 가장
  // 가까운 값(예: 5만원)으로 뭉뚱그리지 않고 실제 가격 그대로를 정답으로
  // 보여준다. 이때 정답 라벨에서만 "약"을 빼면 그 자체가 힌트가 되므로
  // (다른 셋은 "약 OO만원"인데 하나만 "OO만원"이면 바로 눈에 띔), 이 경우엔
  // 오답 3개도 똑같이 "약" 없이 보여줘서 넷 다 표기 형식이 같게 만든다.
  const isExactManwon = actualCost >= 10_000 && actualCost % 10_000 === 0;
  if (isExactManwon) {
    const decoyBands = decoyIdx.slice(0, 3).map((i) => ({ value: BAND_LADDER[i], label: bandLabel(BAND_LADDER[i], true) }));
    const correctBand = { value: actualCost, label: bandLabel(actualCost, true) };
    const order = shuffle([0, 1, 2, 3]);
    const all = [correctBand, ...decoyBands];
    return { bands: order.map((i) => all[i]), correctIndex: order.indexOf(0) };
  }

  const allIdx = shuffle([closestIdx, ...decoyIdx.slice(0, 3)]);
  const bands = allIdx.map((i) => ({ value: BAND_LADDER[i], label: bandLabel(BAND_LADDER[i]) }));
  return { bands, correctIndex: allIdx.indexOf(closestIdx) };
}

export const REORDER_ITEM_COUNT = 4;

export function pickReorderItems(pool: MedicalCostItem[]): MedicalCostItem[] {
  for (let attempt = 0; attempt < 30; attempt++) {
    const picked = sample(pool, REORDER_ITEM_COUNT);
    const sorted = [...picked].sort((a, b) => a.cost - b.cost);
    // 가격 차이가 너무 작은 조합을 피한다.
    const allSpread = sorted.every((item, i) => i === 0 || item.cost / sorted[i - 1].cost >= 1.15);
    if (allSpread) return picked;
  }
  return sample(pool, REORDER_ITEM_COUNT);
}

export interface ReorderVerdict {
  points: number;
  fixedCount: number;
}

/** 제자리에 놓인 항목 수로 채점한다. */
export function scoreReorder(displayOrder: MedicalCostItem[], userOrderIds: string[]): ReorderVerdict {
  const correctIds = [...displayOrder].sort((a, b) => a.cost - b.cost).map((item) => item.id);
  const fixedCount = correctIds.filter((id, i) => id === userOrderIds[i]).length;
  const total = correctIds.length;
  if (fixedCount === total) return { points: 100, fixedCount };
  if (fixedCount * 2 >= total) return { points: 50, fixedCount };
  if (fixedCount >= 1) return { points: 20, fixedCount };
  return { points: 0, fixedCount };
}

// 예산 내 정답 수는 1개 또는 2개다.
export const BUDGET_ITEM_COUNT = 5;
const BUDGET_LADDER = [50_000, 100_000, 150_000, 200_000, 300_000, 500_000, 1_000_000];
const BUDGET_FIT_COUNT_OPTIONS = [1, 2];

export interface BudgetRound {
  items: MedicalCostItem[];
  budget: number;
  /** 예산 안에 드는 항목들의 id - 이번 라운드엔 1개 또는 2개. */
  fitIds: string[];
}

export function pickBudgetRound(pool: MedicalCostItem[]): BudgetRound | null {
  const preferredFitCount = sample(BUDGET_FIT_COUNT_OPTIONS, 1)[0];
  const fitCountOrder = [preferredFitCount, ...BUDGET_FIT_COUNT_OPTIONS.filter((c) => c !== preferredFitCount)];
  for (const fitCount of fitCountOrder) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const picked = sample(pool, BUDGET_ITEM_COUNT);
      const sorted = [...picked].sort((a, b) => a.cost - b.cost);
      const budget = BUDGET_LADDER.find((b) => b >= sorted[fitCount - 1].cost && b < sorted[fitCount].cost);
      if (budget !== undefined) {
        return { items: shuffle(picked), budget, fitIds: sorted.slice(0, fitCount).map((item) => item.id) };
      }
    }
  }
  return null;
}

export interface BudgetVerdict {
  points: number;
  correctPickCount: number;
  wrongPickCount: number;
  missedCount: number;
}

/** 정답·오답·누락 수로 예산 선택을 채점한다. */
export function scoreBudgetPicks(fitIds: string[], pickedIds: string[]): BudgetVerdict {
  const fitSet = new Set(fitIds);
  const pickedSet = new Set(pickedIds);
  const correctPickCount = pickedIds.filter((id) => fitSet.has(id)).length;
  const wrongPickCount = pickedIds.filter((id) => !fitSet.has(id)).length;
  const missedCount = fitIds.filter((id) => !pickedSet.has(id)).length;
  if (wrongPickCount === 0 && missedCount === 0) return { points: 100, correctPickCount, wrongPickCount, missedCount };
  if (correctPickCount > 0 && wrongPickCount === 0) return { points: 50, correctPickCount, wrongPickCount, missedCount };
  if (correctPickCount > 0) return { points: 20, correctPickCount, wrongPickCount, missedCount };
  return { points: 0, correctPickCount, wrongPickCount, missedCount };
}

export interface HigherLowerRound {
  refItem: MedicalCostItem;
  nextItem: MedicalCostItem;
  isHigher: boolean;
}

// 가격 차이가 지나치게 큰 조합을 피한다.
const HIGHER_LOWER_CLOSE_RATIO_MAX = 3;

export function pickHigherLowerRound(pool: MedicalCostItem[]): HigherLowerRound | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const [a, b] = sample(pool, 2);
    if (!a || !b || a.cost === b.cost) continue; // 동가는 방향을 정할 수 없어 제외
    const ratio = Math.max(a.cost, b.cost) / Math.min(a.cost, b.cost);
    if (ratio > HIGHER_LOWER_CLOSE_RATIO_MAX) continue;
    return { refItem: a, nextItem: b, isHigher: b.cost > a.cost };
  }
  // 후보가 부족하면 동가만 제외한다.
  for (let attempt = 0; attempt < 40; attempt++) {
    const [a, b] = sample(pool, 2);
    if (!a || !b || a.cost === b.cost) continue;
    return { refItem: a, nextItem: b, isHigher: b.cost > a.cost };
  }
  return null;
}

export type RoundSpec =
  | { kind: 'slider'; item: MedicalCostItem }
  | { kind: 'band'; item: MedicalCostItem; bands: PriceBand[]; correctIndex: number }
  | { kind: 'reorder'; items: MedicalCostItem[] }
  | { kind: 'budget'; items: MedicalCostItem[]; budget: number; fitIds: string[] }
  | { kind: 'higherLower'; refItem: MedicalCostItem; nextItem: MedicalCostItem; isHigher: boolean };

export function buildRounds(pool: MedicalCostItem[]): RoundSpec[] {
  const [sliderItem, bandItem] = sample(pool, 2);
  const { bands, correctIndex } = pickBandChoices(bandItem.cost);
  const reorderItems = pickReorderItems(pool);
  const budgetRound = pickBudgetRound(pool) ?? {
    items: sample(pool, BUDGET_ITEM_COUNT),
    budget: BUDGET_LADDER[BUDGET_LADDER.length - 1],
    fitIds: [pool[0].id],
  };
  const hlRound = pickHigherLowerRound(pool) ?? {
    refItem: pool[0],
    nextItem: pool[1] ?? pool[0],
    isHigher: (pool[1] ?? pool[0]).cost > pool[0].cost,
  };
  return [
    { kind: 'slider', item: sliderItem },
    { kind: 'band', item: bandItem, bands, correctIndex },
    { kind: 'reorder', items: reorderItems },
    { kind: 'budget', ...budgetRound },
    { kind: 'higherLower', ...hlRound },
  ];
}
