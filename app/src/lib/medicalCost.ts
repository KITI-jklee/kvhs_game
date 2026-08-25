import type { MedicalCostItem } from '../data/types';
import { sample, shuffle } from './array';

/**
 * "의료비 감각 테스트"(게임②) 라운드 5개의 순수 로직 - 라운드마다 조작
 * 방식이 완전히 다르다(슬라이더/4지선다/순서 맞추기/예산/하이로우). 데이터는
 * 실제 비급여 수가 공개 데이터를 큐레이션한 `medical_costs.json`을 쓴다
 * (`scripts/build-medical-costs.cjs`).
 */

export const ROUND_COUNT = 5;
export const MAX_TOTAL_SCORE = 500;

// ---------------------------------------------------------------------------
// 라운드① 「얼마나 나올까?」 - 슬라이더
// ---------------------------------------------------------------------------
// 항목마다 가격 스케일이 크게 달라서(1.5만원~120만원) 슬라이더를 로그
// 스케일로 잡는다 - 선형이면 저가 항목은 슬라이더 왼쪽 끝에 다 뭉쳐서
// 정밀하게 못 고른다.
export const SLIDER_MIN = 10_000;
// 실제 데이터의 최고가(120만원)에 정확히 맞춘다(사용자 피드백) - 예전엔
// 500만원까지 잡혀 있어서, 로그 스케일 특성상 슬라이더 오른쪽 23% 구간은
// 어떤 라운드에서도 정답이 될 일이 없는 죽은 구간이었다.
export const SLIDER_MAX = 1_200_000;

/** 슬라이더 위치(0~1) -> 실제 가격(원, 1천원 단위로 보기 좋게 반올림). */
export function sliderPositionToPrice(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const value = SLIDER_MIN * (SLIDER_MAX / SLIDER_MIN) ** clamped;
  return Math.round(value / 1000) * 1000;
}

/** sliderPositionToPrice의 역함수 - 가격 -> 슬라이더 위치(0~1, %로 쓰려면 *100).
 * 로그 스케일 눈금 라벨을 실제 위치에 정확히 찍기 위해 쓴다(사용자 피드백:
 * 눈금이 화면에 균등 간격으로만 찍혀 있어 실제 값 위치와 어긋나 있었다). */
export function pricePositionRatio(price: number): number {
  const clamped = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, price));
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

// ---------------------------------------------------------------------------
// 라운드② 「어느 가격대일까?」 - 4지선다
// ---------------------------------------------------------------------------
// 실제 가격을 그대로 보기로 주면 라운드①과 다를 게 없어서, "1-2-3-5-7" 로그
// 사다리 위의 대표값 중 정답과 가장 가까운 것을 정답 밴드로 삼고, 사다리에서
// 그다음으로 가까운 3개를 오답으로 채운다(정답 근처일수록 헷갈리게). 예전엔
// "1-3-5"라 자릿수마다 대표값이 2개뿐이어서, 실제 가격이 "7만원"처럼 딱
// 맞아떨어지는 값이어도 사다리엔 5만/10만만 있어 둘 중 하나로 억지로
// 근사되고, 그 결과가 애매하게 느껴졌다(사용자 피드백: "7만원이면 5만하고
// 10만 사이인데 10을 골랐더니 틀렸다고 하니 애매하다"). "7"을 사다리에
// 추가해 자릿수마다 대표값을 5개로 늘려서, 실제 가격이 딱 떨어지는 값일
// 때는 그 값 자체가 정답 보기로 나오게 한다.
const BAND_LADDER = [
  5_000, 7_000, 10_000, 20_000, 30_000, 50_000, 70_000, 100_000, 200_000, 300_000, 500_000, 700_000, 1_000_000,
  2_000_000, 3_000_000, 5_000_000,
];

export interface PriceBand {
  value: number;
  label: string;
}

function bandLabel(value: number): string {
  if (value >= 10_000) return `약 ${Math.round(value / 10_000)}만원`;
  return `약 ${value.toLocaleString('ko-KR')}원`;
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
  const allIdx = shuffle([closestIdx, ...decoyIdx.slice(0, 3)]);
  const bands = allIdx.map((i) => ({ value: BAND_LADDER[i], label: bandLabel(BAND_LADDER[i]) }));
  return { bands, correctIndex: allIdx.indexOf(closestIdx) };
}

// ---------------------------------------------------------------------------
// 라운드③ 「가격 순서를 맞춰라!」 - 순서 맞추기(4개)
// ---------------------------------------------------------------------------
export const REORDER_ITEM_COUNT = 4;

export function pickReorderItems(pool: MedicalCostItem[]): MedicalCostItem[] {
  for (let attempt = 0; attempt < 30; attempt++) {
    const picked = sample(pool, REORDER_ITEM_COUNT);
    const sorted = [...picked].sort((a, b) => a.cost - b.cost);
    // 서로 최소 1.15배 이상 차이 나야 헷갈리지 않게 구분 가능한 문제가 된다.
    const allSpread = sorted.every((item, i) => i === 0 || item.cost / sorted[i - 1].cost >= 1.15);
    if (allSpread) return picked;
  }
  return sample(pool, REORDER_ITEM_COUNT);
}

export interface ReorderVerdict {
  points: number;
  fixedCount: number;
}

/** 고정점(자리가 맞은 개수) 기반 채점 - 몇 개를 배열하든 "정확히 n-1개만
 * 맞다"는 상태는 나올 수 없다(마지막 하나는 갈 자리가 그 자리뿐이라 자동으로
 * 맞게 됨). 그래서 항목이 4개면 가능한 고정점은 0/1/2/4뿐이라, 절반 이상
 * 맞았는지(2개↑)를 기준으로 한 단계 더 나눈다. */
export function scoreReorder(displayOrder: MedicalCostItem[], userOrderIds: string[]): ReorderVerdict {
  const correctIds = [...displayOrder].sort((a, b) => a.cost - b.cost).map((item) => item.id);
  const fixedCount = correctIds.filter((id, i) => id === userOrderIds[i]).length;
  const total = correctIds.length;
  if (fixedCount === total) return { points: 100, fixedCount };
  if (fixedCount * 2 >= total) return { points: 50, fixedCount };
  if (fixedCount >= 1) return { points: 20, fixedCount };
  return { points: 0, fixedCount };
}

// ---------------------------------------------------------------------------
// 라운드④ 「예산 안에서 고르세요」 - 예산 챌린지
// ---------------------------------------------------------------------------
// 후보 5개 중 예산 안에 드는 게 매번 1개뿐이면 "아무거나 골라도 절반은
// 맞음"이 되어 오히려 쉬워진다(사용자 피드백) - 그래서 "하나만 고르기"가
// 아니라 "예산 안에 드는 걸 전부 고르기"로 바꾸고, 정답 개수도 라운드마다
// 1개 또는 2개로 무작위로 달라지게 한다. 정답 개수가 2개인 라운드가 실제로
// 더 어렵도록(다 찾아야 하고, 아닌 것도 안 골라야 함) 만드는 핵심은 바로
// "전부 고르기" 방식이다.
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

/** 예산 안에 드는 항목을 정확히 다 골랐으면 100점, 잘못 고른 것 없이 일부만
 * 찾았으면 50점, 잘못 고른 게 있어도 맞는 것도 있으면 20점, 하나도 못
 * 맞혔으면 0점. */
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

// ---------------------------------------------------------------------------
// 라운드⑤(FINAL) 「HIGHER or LOWER」
// ---------------------------------------------------------------------------
export interface HigherLowerRound {
  refItem: MedicalCostItem;
  nextItem: MedicalCostItem;
  isHigher: boolean;
}

// FINAL 라운드 안내문에 "두 항목의 차이는 크지 않아요"라고 못 박아 두는
// 만큼, 실제로도 너무 티 나게 차이 나는 조합(15,000원 vs 100만원처럼 보자마자
// 답이 뻔한 경우)은 최대한 피하고 적당히 헷갈리는 조합을 우선 뽑는다.
const HIGHER_LOWER_CLOSE_RATIO_MAX = 3;

export function pickHigherLowerRound(pool: MedicalCostItem[]): HigherLowerRound | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const [a, b] = sample(pool, 2);
    if (!a || !b || a.cost === b.cost) continue; // 동가는 방향을 정할 수 없어 제외
    const ratio = Math.max(a.cost, b.cost) / Math.min(a.cost, b.cost);
    if (ratio > HIGHER_LOWER_CLOSE_RATIO_MAX) continue;
    return { refItem: a, nextItem: b, isHigher: b.cost > a.cost };
  }
  // 적당히 가까운 조합을 못 찾았으면(풀이 작거나 편중된 경우) 동가만
  // 아니면 되는 조건으로 완화해서 재시도한다.
  for (let attempt = 0; attempt < 40; attempt++) {
    const [a, b] = sample(pool, 2);
    if (!a || !b || a.cost === b.cost) continue;
    return { refItem: a, nextItem: b, isHigher: b.cost > a.cost };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 라운드 5개 조립
// ---------------------------------------------------------------------------
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
