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

/** 짝(항목명 카드 + 분류 카드) N장씩을 뒤섞어 카드 뒷면 번호를 매긴다. 매 라운드 새로 호출되어 배치가 달라진다.
 *
 * 정답 판정은 카드 텍스트가 아니라 pairIndex(= 고유한 pair.id가 가리키는
 * 같은 항목)로만 한다 - 카드에 보여줄 category 텍스트가 라운드
 * 안에서 우연히 겹치더라도 정답 여부에는 영향이 없다. */
export function buildMatchDeck(pairs: MedicalTermPair[]): DeckCard[] {
  const deck: Omit<DeckCard, 'num'>[] = [];
  pairs.forEach((pair, i) => {
    deck.push({ key: `t${i}`, pairIndex: i, title: pair.item_name, kind: 'item', cost: pair.cost });
    deck.push({ key: `d${i}`, pairIndex: i, title: pair.category, kind: 'category', cost: pair.cost });
  });
  return shuffle(deck).map((card, idx) => ({ ...card, num: String(idx + 1).padStart(2, '0') }));
}
