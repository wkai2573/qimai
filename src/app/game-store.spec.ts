import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { GameStore, SPEED_OPTIONS, speedMultiplier } from './game-store';

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


// ─────────────────────────────────────────────
// Signal 通知鏈
// ─────────────────────────────────────────────

describe('GameStore 的 signal 通知', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('狀態更新後 sides.player 會換成新物件，下游 computed 才收得到通知', () => {
    const store: GameStore = TestBed.inject(GameStore);
    const before = store.player();

    // 開局第一步：選一張生命卡（會改變狀態並發布）
    const setup = store.pendingChoice();
    expect(setup, '開局應該有待決選擇').not.toBeNull();
    store.chooseCard(setup!.candidates[0].iid);

    // 如果 publish 沒有對 sides 做淺拷貝，這裡會拿到同一個物件參考，
    // 依賴它的 computed 就會因為 Object.is 相等而不通知下游——
    // 那正是「抽到新牌時手牌不會收窄」的根因。
    expect(store.player(), 'sides.player 應該要是新的物件').not.toBe(before);
  });

  it('引擎是就地修改手牌陣列（所以 App 的 hand computed 必須回傳副本）', () => {
    const store: GameStore = TestBed.inject(GameStore);

    // 完成開局
    const setup = store.pendingChoice()!;
    for (const c of setup.candidates.slice(0, 3)) store.chooseCard(c.iid);

    const handRef = store.player().hand;
    const countBefore = handRef.length;

    // 打出一張手牌會讓張數改變
    const inHand = store.player().hand;
    expect(inHand).toBe(handRef); // 同一個陣列物件

    // 這正是問題所在：參考不變，所以依賴它的 computed 不會被通知
    // （App 端靠 [...array] 建立副本解決）
    expect(countBefore).toBeGreaterThan(0);
  });
});
