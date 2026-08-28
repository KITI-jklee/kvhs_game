import type { MedicalTermPair } from '../data/types';
import { shuffle } from './array';

export interface DeckCard {
  key: string;
  pairIndex: number;
  title: string;
  kind: 'item' | 'category';
  num: string;
  cost: number;
}

/** 짝(항목명 카드 + 분류 카드) N장씩을 뒤섞어 카드 뒷면 번호를 매긴다. 매 라운드 새로 호출되어 배치가 달라진다. */
export function buildMatchDeck(pairs: MedicalTermPair[]): DeckCard[] {
  const deck: Omit<DeckCard, 'num'>[] = [];
  pairs.forEach((pair, i) => {
    deck.push({ key: `t${i}`, pairIndex: i, title: pair.item_name, kind: 'item', cost: pair.cost });
    deck.push({ key: `d${i}`, pairIndex: i, title: pair.kind_mid, kind: 'category', cost: pair.cost });
  });
  return shuffle(deck).map((card, idx) => ({ ...card, num: String(idx + 1).padStart(2, '0') }));
}

/** 한 라운드에 같은 분류(kind_mid)가 두 번 이상 들어가면, 정확한 짝이 아니어도
 * "항목-분류" 카드 한 쌍이 같은 분류를 가리키기만 하면 정답으로 인정한다.
 *
 * 현재 실제 데이터(분류 10개, 최소 분류당 2개, ROUND_SIZES=[6,8,10])에서는
 * pickRoundPairs가 라운드마다 분류를 최대한 다양하게 채우기 때문에 이 조건이
 * 사실상 발동하지 않는다 - 그래도 향후 데이터셋(분류 수가 줄거나 특정 분류가
 * 아주 작아지는 경우)을 위한 안전장치로 남겨두며, pickRoundPairs를 거치지
 * 않고도 이 함수 자체를 단위 테스트할 수 있도록 순수 함수로 분리해 둔다. */
export function isFallbackCategoryMatch(
  aKind: DeckCard['kind'],
  bKind: DeckCard['kind'],
  aCategory: string | undefined,
  bCategory: string | undefined,
  duplicatedCategories: Set<string>,
): boolean {
  return aKind !== bKind && aCategory !== undefined && aCategory === bCategory && duplicatedCategories.has(aCategory);
}
