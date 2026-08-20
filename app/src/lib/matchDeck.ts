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
