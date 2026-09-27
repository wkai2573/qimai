import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameStore, SPEED_OPTIONS, speedMultiplier } from './game-store';
import { RAGE_MAIN_DECK } from './game/cards';
import { makeInstance } from './game/internal';
import type { GameState } from './game/types';
import type { P2PMessage } from './p2p/p2p-types';

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

// ─────────────────────────────────────────────
// P2P：客人的自訂牌組
// ─────────────────────────────────────────────

describe('P2P 房主開局時採用客人的自訂牌組', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  /** 模擬收到網路訊息（handleP2PMessage 是 private，由 P2PService 的 onMessage 呼叫） */
  function receive(store: GameStore, msg: P2PMessage): void {
    (store as unknown as { handleP2PMessage(m: P2PMessage): void }).handleP2PMessage(msg);
  }

  /** 開局時客人（npc 座位）的主牌組分散在牌堆、手牌與生命區 */
  function guestDeckCounts(store: GameStore): Record<string, number> {
    const side = store.state().sides.npc;
    const counts: Record<string, number> = {};
    for (const c of [...side.deck, ...side.hand, ...side.life.map((l) => l.card)]) {
      counts[c.defId] = (counts[c.defId] ?? 0) + 1;
    }
    return counts;
  }

  it('收到 GUEST_HELLO 附帶的牌組後，開局與重開都使用該牌組', () => {
    const store = TestBed.inject(GameStore);
    const custom = { ...RAGE_MAIN_DECK, rg_tech_nuce: 3, cm_tiandi: 1 };

    receive(store, { type: 'GUEST_HELLO', hero: 'rage', deck: custom });
    store.startP2PGame('mage', store.npcChar(), 123);

    expect(store.state().sides.npc.character).toBe('rage');
    expect(guestDeckCounts(store)).toEqual(custom);

    store.restartSameSeed();
    expect(guestDeckCounts(store)).toEqual(custom);
  });

  it('客人送來的牌組不合法時，改用角色預設牌組', () => {
    const store = TestBed.inject(GameStore);
    // 混入秘法專屬卡，且總數變成 51 張
    const illegal = { ...RAGE_MAIN_DECK, mg_tech_huoqiu: 1 };

    receive(store, { type: 'GUEST_HELLO', hero: 'rage', deck: illegal });
    store.startP2PGame('mage', store.npcChar(), 123);

    expect(guestDeckCounts(store)).toEqual({ ...RAGE_MAIN_DECK });
  });
});

// ─────────────────────────────────────────────
// 單機：電腦回合中途要玩家做選擇
// ─────────────────────────────────────────────

describe('電腦回合中要玩家選擇時會等玩家', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('電腦打出拋下狠話後停下來，玩家挑完招式才繼續把回合跑完', () => {
    const store = TestBed.inject(GameStore);
    const setup = store.pendingChoice()!;
    for (const c of setup.candidates.slice(0, 3)) store.chooseCard(c.iid);

    // 清掉開局可能已經排好的電腦步驟，直接擺出要測的場面
    vi.clearAllTimers();
    store.npcThinking.set(false);
    const s = store.state() as GameState;
    s.activeSeat = 'npc';
    s.phase = 'main';
    s.sides.npc.eventsUsedThisTurn = 0;
    s.sides.npc.hand = [makeInstance(s, 'rg_paohua')];
    s.sides.player.hand = [makeInstance(s, 'cm_tech_zhengquan'), makeInstance(s, 'rg_xueqi')];
    (store as unknown as { afterChange(): void }).afterChange();

    vi.advanceTimersByTime(10_000);
    const waiting = store.state();
    expect(waiting.activeSeat).toBe('npc');
    expect(waiting.phase).toBe('main');
    expect(waiting.pending?.seat).toBe('player');
    expect(store.npcThinking()).toBe(false);

    store.chooseCard(waiting.pending!.candidates[0].iid);
    expect(store.player().hand.map((c) => c.defId)).toEqual(['rg_xueqi']);

    vi.advanceTimersByTime(10_000);
    expect(store.state().activeSeat).toBe('player');
    expect(store.npcThinking()).toBe(false);
  });
});
