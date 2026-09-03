import { describe, expect, it } from 'vitest';
import type { MedicalTermPair } from '../data/types';
import { buildMatchDeck } from './matchDeck';

const pairs: MedicalTermPair[] = [
  { id: 'term_0001', item_name: '주의력 검사(청각)', category: '신경계기능검사', cost: 60000 },
  { id: 'term_0002', item_name: '간섬유화검사', category: '기능검사료(소화기 기능검사)', cost: 40000 },
];

describe('게임③ 짝맞추기 - 카드 짝 판정', () => {
  it('같은 항목에서 나온 item/category 카드끼리만 pairIndex가 같다', () => {
    const deck = buildMatchDeck(pairs);
    expect(deck).toHaveLength(4);
    for (const pair of pairs) {
      const matching = deck.filter((c) => c.title === pair.item_name || c.title === pair.category);
      expect(matching).toHaveLength(2);
      expect(matching[0].pairIndex).toBe(matching[1].pairIndex);
      expect(matching[0].kind).not.toBe(matching[1].kind);
    }
    // 서로 다른 원본 행끼리는 category 텍스트가 같아도(=여기선 우연히 다르지만)
    // pairIndex가 다르다는 것이 핵심 계약이므로, 두 쌍의 pairIndex가 겹치지 않는지도 확인한다.
    const pairIndexes = new Set(deck.map((c) => c.pairIndex));
    expect(pairIndexes.size).toBe(pairs.length);
  });
});
