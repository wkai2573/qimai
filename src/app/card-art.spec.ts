/**
 * 卡圖測試。
 *
 * 卡圖是手寫的 SVG 字串，打錯一個標籤不會讓 TypeScript 或 build 失敗，
 * 只會在瀏覽器裡默默變成空白。這裡用 DOMParser 實際解析每個字串，
 * 確保 32 張卡的圖騰都是合法 SVG。
 */

import { describe, expect, it } from 'vitest';

import { CARD_BACK, cardArt } from './card-art';
import { CARD_DEFS } from './game/cards';

/** 解析 SVG 字串，回傳是否合法 */
function parseSvg(svg: string): { ok: boolean; hasSvg: boolean } {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  return {
    ok: doc.querySelector('parsererror') === null,
    hasSvg: doc.querySelector('svg') !== null,
  };
}

describe('卡圖', () => {
  it('每一張卡都有合法且專屬的 SVG 圖騰', () => {
    const fallback = cardArt('__definitely_not_a_card__');

    for (const def of CARD_DEFS) {
      const svg = cardArt(def.id);
      const { ok, hasSvg } = parseSvg(svg);

      expect(ok, `${def.name}（${def.id}）的 SVG 解析失敗`).toBe(true);
      expect(hasSvg, `${def.name}（${def.id}）缺少 <svg> 根元素`).toBe(true);
      expect(svg, `${def.name}（${def.id}）沒有專屬卡圖，掉到備援圖了`).not.toBe(fallback);
    }
  });

  it('卡背是合法的 SVG', () => {
    const { ok, hasSvg } = parseSvg(CARD_BACK);
    expect(ok).toBe(true);
    expect(hasSvg).toBe(true);
  });

  it('未知卡 id 會回傳備援圖而不是拋錯', () => {
    expect(() => cardArt('nope')).not.toThrow();
    const { ok } = parseSvg(cardArt('nope'));
    expect(ok).toBe(true);
  });

  it('卡圖數量與卡表一致（沒有漏畫或多畫）', () => {
    const ids = CARD_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);

    const fallback = cardArt('__none__');
    const missing = CARD_DEFS.filter((d) => cardArt(d.id) === fallback);
    expect(missing.map((d) => d.id)).toEqual([]);
  });
});
