import { describe, expect, it } from 'vitest';

import { DEFAULT_CARD_WIDTH, IDEAL_GAP, computeHandSpacing, handRowWidth } from './hand-layout';

describe('手牌排版', () => {
  it('只有 0 或 1 張時不需要間距', () => {
    expect(computeHandSpacing(0, 104, 1200)).toBe(0);
    expect(computeHandSpacing(1, 104, 1200)).toBe(0);
  });

  it('寬度充裕時正常排開，不重疊', () => {
    // 5 張 104px 的卡 = 520px + 4*6px = 544px，容器 1200px 綽綽有餘
    const spacing = computeHandSpacing(5, 104, 1200);
    expect(spacing).toBe(IDEAL_GAP);
    expect(spacing).toBeGreaterThan(0);
  });

  it('剛好放得下時仍不重疊', () => {
    const cardWidth = 104;
    const count = 5;
    const exact = count * cardWidth + (count - 1) * IDEAL_GAP;
    expect(computeHandSpacing(count, cardWidth, exact)).toBe(IDEAL_GAP);
  });

  it('放不下時才開始重疊（負間距）', () => {
    const spacing = computeHandSpacing(10, 104, 800);
    expect(spacing).toBeLessThan(0);
  });

  it('容器越窄，重疊越嚴重', () => {
    const wide = computeHandSpacing(8, 104, 700);
    const narrow = computeHandSpacing(8, 104, 400);
    expect(narrow).toBeLessThan(wide);
  });

  it('重疊不會超過卡寬的 60%', () => {
    // 極端：20 張牌塞進 200px
    const spacing = computeHandSpacing(20, 104, 200);
    expect(spacing).toBeGreaterThanOrEqual(-104 * 0.6);
    expect(spacing).toBe(-62);
  });

  it('重疊後整排寬度不超過容器（在合理張數內）', () => {
    const cardWidth = DEFAULT_CARD_WIDTH;
    const container = 900;

    for (let count = 2; count <= 12; count++) {
      const spacing = computeHandSpacing(count, cardWidth, container);
      const width = handRowWidth(count, cardWidth, spacing);
      expect(width, `${count} 張時超出容器`).toBeLessThanOrEqual(container + 1);
    }
  });

  it('張數越多，單張分到的間距越小', () => {
    const few = computeHandSpacing(4, 104, 600);
    const many = computeHandSpacing(9, 104, 600);
    expect(many).toBeLessThan(few);
  });

  it('量不到寬度時退回理想間距而不是崩掉', () => {
    expect(computeHandSpacing(5, 0, 800)).toBe(IDEAL_GAP);
    expect(computeHandSpacing(5, 104, 0)).toBe(IDEAL_GAP);
  });
});
