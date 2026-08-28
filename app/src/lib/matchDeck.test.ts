import { describe, expect, it } from 'vitest';
import { isFallbackCategoryMatch } from './matchDeck';

describe('게임③ 짝맞추기 - 중복 분류 대체 매칭', () => {
  it('같은 분류가 중복된 라운드에서는 항목-분류 카드가 정확한 짝이 아니어도 정답으로 인정한다', () => {
    const duplicated = new Set(['치과']);
    expect(isFallbackCategoryMatch('item', 'category', '치과', '치과', duplicated)).toBe(true);
  });

  it('같은 종류(item-item, category-category)끼리는 대체 매칭을 인정하지 않는다', () => {
    const duplicated = new Set(['치과']);
    expect(isFallbackCategoryMatch('item', 'item', '치과', '치과', duplicated)).toBe(false);
    expect(isFallbackCategoryMatch('category', 'category', '치과', '치과', duplicated)).toBe(false);
  });

  it('분류가 다르면 인정하지 않는다', () => {
    const duplicated = new Set(['치과', '검사']);
    expect(isFallbackCategoryMatch('item', 'category', '치과', '검사', duplicated)).toBe(false);
  });

  it('그 라운드에서 실제로 중복되지 않은 분류는 대체 매칭을 인정하지 않는다', () => {
    const duplicated = new Set<string>(); // 이번 라운드엔 중복 분류가 없음
    expect(isFallbackCategoryMatch('item', 'category', '치과', '치과', duplicated)).toBe(false);
  });
});
