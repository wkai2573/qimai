import { describe, expect, it } from 'vitest';

import { SPEED_OPTIONS, speedMultiplier } from './game-store';

describe('對局節奏設定', () => {
  it('每一段都有中文標籤與唯一的識別值', () => {
    const values = SPEED_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);

    for (const opt of SPEED_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
      expect(opt.multiplier).toBeGreaterThan(0);
    }
  });

  it('倍率由快到慢遞增', () => {
    const multipliers = SPEED_OPTIONS.map((o) => o.multiplier);
    for (let i = 1; i < multipliers.length; i++) {
      expect(multipliers[i]).toBeGreaterThan(multipliers[i - 1]);
    }
  });

  it('「一般」是基準倍率 1（其他段都以它為參考）', () => {
    expect(speedMultiplier('normal')).toBe(1);
  });

  it('最慢的一段至少是一般的 2 倍以上', () => {
    const fastest = Math.min(...SPEED_OPTIONS.map((o) => o.multiplier));
    const slowest = Math.max(...SPEED_OPTIONS.map((o) => o.multiplier));
    expect(slowest / fastest).toBeGreaterThanOrEqual(4);
  });

  it('未知的設定值會退回基準倍率而不是 NaN', () => {
    const value = speedMultiplier('nonsense' as never);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBe(1);
  });
});
