/**
 * 《氣脈》規則引擎單元測試
 *
 * 這些測試就是規則書的可執行版本。任何規則改動若破壞既有行為，這裡會立刻紅燈。
 */

import { describe, expect, it } from 'vitest';

import { card, STARTER_MAIN_DECK, STARTER_QUEST_DECK, validateMainDeck, validateQuestDeck } from './cards';
import { beginCombat, finishCombat, playTechnique } from './combat';
import {
  beginTurn,
  createGame,
  evaluateAllQuests,
  playCard,
  resolveBurst,
  resolveChoice,
  resolveRebuild,
} from './engine';
import { draw, makeInstance } from './internal';
import type { GameState, Seat } from './types';
import { RULES } from './types';

// ─────────────────────────────────────────────
// 測試輔助
// ─────────────────────────────────────────────

/** 把某座位的手牌直接換成指定卡（測試要精確控制場景） */
function setHand(state: GameState, seat: Seat, ids: string[]): void {
  state.sides[seat].hand = ids.map((id) => makeInstance(state, id));
}

/** 把指定的卡放到牌組最頂端（用來控制防禦判定翻到什麼） */
function stackDeckTop(state: GameState, seat: Seat, ids: string[]): void {
  const side = state.sides[seat];
  const insts = ids.map((id) => makeInstance(state, id));
  side.deck.unshift(...insts.reverse());
}

/** 進入戰鬥階段並準備好手牌 */
function setupCombat(state: GameState, seat: Seat, handIds: string[]): void {
  setHand(state, seat, handIds);
  state.activeSeat = seat;
  state.phase = 'combat';
  beginCombat(state, seat);
}

// ─────────────────────────────────────────────
// 1. 牌組構築規則
// ─────────────────────────────────────────────

describe('牌組構築規則', () => {
  it('預設主牌組剛好 50 張且通過驗證', () => {
    const total = Object.values(STARTER_MAIN_DECK).reduce((a, b) => a + b, 0);
    expect(total).toBe(RULES.mainDeckSize);
    expect(validateMainDeck(STARTER_MAIN_DECK)).toEqual([]);
  });

  it('預設任務牌組 5 張、無同名、且含起始任務', () => {
    expect(STARTER_QUEST_DECK.length).toBe(RULES.questDeckSize);
    expect(validateQuestDeck(STARTER_QUEST_DECK)).toEqual([]);
    expect(STARTER_QUEST_DECK.some((id) => card(id).quest?.starter)).toBe(true);
  });

  it('同名卡超過 4 張會被擋下', () => {
    const bad = { ...STARTER_MAIN_DECK, trick_beng: 5 };
    const issues = validateMainDeck(bad);
    expect(issues.some((i) => i.message.includes('同名卡最多'))).toBe(true);
  });

  it('密奧義合計超過 6 張會被擋下', () => {
    const bad = { ...STARTER_MAIN_DECK, hidden_tian: 4, hidden_wu: 4 };
    const issues = validateMainDeck(bad);
    expect(issues.some((i) => i.message.includes('密奧義'))).toBe(true);
  });

  it('主牌組張數不對會被擋下', () => {
    const bad = { trick_beng: 4 };
    const issues = validateMainDeck(bad);
    expect(issues.some((i) => i.message.includes('50 張'))).toBe(true);
  });

  it('任務牌組缺少起始任務會被擋下', () => {
    const bad = ['q_lianji', 'q_xushi', 'q_nuqi', 'q_dacheng', 'q_lianji'];
    const issues = validateQuestDeck(bad);
    expect(issues.some((i) => i.message.includes('起始任務'))).toBe(true);
    expect(issues.some((i) => i.message.includes('同名卡'))).toBe(true);
  });
});

// ─────────────────────────────────────────────
// 2. 開局設置
// ─────────────────────────────────────────────

describe('開局設置', () => {
  it('雙方各有 3 張生命卡，且都翻開了起始任務', () => {
    const g = createGame(2024, { manualLifeSetup: false });

    for (const seat of ['player', 'npc'] as Seat[]) {
      expect(g.sides[seat].life.length).toBe(RULES.lifeCount);
      expect(g.sides[seat].currentQuest).not.toBeNull();
      expect(card(g.sides[seat].currentQuest!.defId).quest?.starter).toBe(true);
    }
  });

  it('先攻方的生命卡是從起始抽牌中選出的，生命區的卡不在牌組裡', () => {
    const g = createGame(99, { manualLifeSetup: false });
    const side = g.sides.player;
    const lifeIids = new Set(side.life.map((l) => l.card.iid));
    const deckIids = new Set([...side.deck, ...side.hand].map((c) => c.iid));

    for (const iid of lifeIids) {
      expect(deckIids.has(iid)).toBe(false);
    }
  });

  it('回合開始後停在爆發階段等待玩家決定', () => {
    const g = createGame(5, { manualLifeSetup: false });
    expect(g.phase).toBe('burst');
    expect(g.turn).toBe(1);
  });

  it('同一 seed 產生完全相同的對局', () => {
    const a = createGame(123456, { manualLifeSetup: false });
    const b = createGame(123456, { manualLifeSetup: false });

    expect(a.activeSeat).toBe(b.activeSeat);
    expect(a.sides.player.deck.map((c) => c.defId)).toEqual(b.sides.player.deck.map((c) => c.defId));
    expect(a.sides.player.hand.map((c) => c.defId)).toEqual(b.sides.player.hand.map((c) => c.defId));
    expect(a.sides.npc.deck.map((c) => c.defId)).toEqual(b.sides.npc.deck.map((c) => c.defId));
  });

  it('不同 seed 產生不同的洗牌結果', () => {
    const a = createGame(1, { manualLifeSetup: false });
    const b = createGame(2, { manualLifeSetup: false });
    const same =
      a.sides.player.deck.map((c) => c.defId).join(',') === b.sides.player.deck.map((c) => c.defId).join(',');
    expect(same).toBe(false);
  });
});

// ─────────────────────────────────────────────
// 3. 戰鬥階段
// ─────────────────────────────────────────────

describe('戰鬥階段', () => {
  it('必須依 特技→密技→奧義→密奧義 的順序出招', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['secret_lie', 'trick_beng']);

    const [secret, trick] = g.sides.player.hand;
    expect(playTechnique(g, 'player', secret.iid).ok).toBe(true);

    const result = playTechnique(g, 'player', trick.iid);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('順序');
  });

  it('同一個 tier 不能出兩張', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['trick_beng', 'trick_cun']);

    const [first, second] = g.sides.player.hand;
    expect(playTechnique(g, 'player', first.iid).ok).toBe(true);
    expect(playTechnique(g, 'player', second.iid).ok).toBe(false);
  });

  it('密奧義在解放條件未滿足時不能打出', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['hidden_tian']);

    const result = playTechnique(g, 'player', g.sides.player.hand[0].iid);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('解放');
  });

  it('本回合用過奧義後，天罡滅脈可以打出', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['ult_guan', 'hidden_tian']);

    const [ult, hidden] = g.sides.player.hand;
    // 貫脈衝 cost 1、天罡滅脈 cost 1，生命區 3 張足夠
    expect(playTechnique(g, 'player', ult.iid).ok).toBe(true);
    expect(playTechnique(g, 'player', hidden.iid).ok).toBe(true);
  });

  it('連招成立時，後一張招式獲得額外加成', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['trick_beng', 'secret_lie']);

    const [trick, secret] = g.sides.player.hand;
    playTechnique(g, 'player', trick.iid);
    playTechnique(g, 'player', secret.iid);

    // 崩拳基礎傷害 1
    expect(g.combat!.plays[0].damage).toBe(1);
    // 裂空掌基礎傷害 2 + 連招加成 2 = 4
    expect(g.combat!.plays[1].damage).toBe(4);
    expect(g.combat!.comboFormed).toBe(true);
  });

  it('沒有連招時不會獲得加成', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['secret_lie']);

    playTechnique(g, 'player', g.sides.player.hand[0].iid);
    // 單獨打出裂空掌，只有基礎傷害 2
    expect(g.combat!.plays[0].damage).toBe(2);
  });

  it('傷害 = 出招總和 − 防禦值，差額進入防禦方怒氣區', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['trick_cun']); // 傷害 2
    stackDeckTop(g, 'npc', ['trick_beng']); // 防禦值 1

    playTechnique(g, 'player', g.sides.player.hand[0].iid);
    const before = g.sides.npc.anger.length;
    finishCombat(g);

    expect(g.sides.npc.anger.length - before).toBe(1);
  });

  it('防禦值大於等於傷害時不會造成傷害', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['trick_beng']); // 傷害 1
    stackDeckTop(g, 'npc', ['trick_chan']); // 防禦值 3

    playTechnique(g, 'player', g.sides.player.hand[0].iid);
    const before = g.sides.npc.anger.length;
    finishCombat(g);

    expect(g.sides.npc.anger.length).toBe(before);
    expect(g.combat!.damage).toBe(0);
  });

  it('攻擊方不出招時不進防禦判定', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', []);

    const npcDiscardBefore = g.sides.npc.discard.length;
    finishCombat(g);

    // 沒有翻任何防禦卡
    expect(g.sides.npc.discard.length).toBe(npcDiscardBefore);
  });

  it('打出的招式與防禦卡進各自持有者的棄牌區', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['trick_cun']);
    stackDeckTop(g, 'npc', ['trick_beng']);

    playTechnique(g, 'player', g.sides.player.hand[0].iid);
    const playerDiscard = g.sides.player.discard.length;
    const npcDiscard = g.sides.npc.discard.length;

    finishCombat(g);

    expect(g.sides.player.discard.length).toBe(playerDiscard + 1);
    expect(g.sides.npc.discard.length).toBe(npcDiscard + 1);
  });

  it('防禦方裝備玄鐵面時會額外翻開一張防禦卡', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const npc = g.sides.npc;
    npc.equipment = [makeInstance(g, 'eq_xuantie')];
    // 手動套用裝備的持續效果
    npc.buffs = [
      {
        id: g.nextIid++,
        source: '玄鐵面',
        target: 'extraGuard',
        amount: 1,
        expiry: { at: 'permanent' },
      },
    ];

    setupCombat(g, 'player', ['trick_cun']);
    stackDeckTop(g, 'npc', ['trick_beng', 'trick_beng']);

    playTechnique(g, 'player', g.sides.player.hand[0].iid);
    finishCombat(g);

    // 兩張防禦卡都被翻開並歸還
    expect(g.sides.npc.discard.length).toBe(2);
  });
});

// ─────────────────────────────────────────────
// 4. 重構與勝負
// ─────────────────────────────────────────────

describe('重構與勝負', () => {
  it('生命區有多張時，重構會停下來等玩家挑選（不急著扣血）', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    side.deck = [];
    side.discard = [makeInstance(g, 'trick_beng')];
    const lifeBefore = side.life.length;

    draw(g, 'player', 1);

    expect(g.pendingRebuild).not.toBeNull();
    expect(g.pendingRebuild!.seat).toBe('player');
    // 還沒挑之前，生命區不該少任何一張
    expect(side.life.length).toBe(lifeBefore);
  });

  it('玩家挑選後完成重構：該卡進手牌、棄牌區洗成新牌組', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    side.deck = [];
    side.discard = [makeInstance(g, 'trick_beng'), makeInstance(g, 'trick_cun')];
    const chosenIid = side.life[1].card.iid;

    draw(g, 'player', 1);
    expect(g.pendingRebuild).not.toBeNull();

    resolveRebuild(g, chosenIid);

    expect(g.pendingRebuild).toBeNull();
    expect(side.life.length).toBe(2);
    expect(side.hand.some((c) => c.iid === chosenIid)).toBe(true);
    expect(side.discard.length).toBe(0);
    expect(side.deck.length).toBeGreaterThan(0);
  });

  it('生命區只剩一張時自動重構，不打擾玩家', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    side.life = [side.life[0]];
    side.deck = [];
    side.discard = [makeInstance(g, 'trick_beng')];

    draw(g, 'player', 1);

    expect(g.pendingRebuild).toBeNull();
    expect(side.life.length).toBe(0);
  });

  it('重構會把被打斷的抽牌補完', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    side.life = [side.life[0]];
    side.deck = [];
    side.discard = ['trick_beng', 'trick_cun', 'secret_lie', 'trick_ta', 'ult_guan'].map((id) =>
      makeInstance(g, id),
    );
    side.hand = [];

    // 牌組空 → 重構（5 張洗入）→ 繼續把 3 張抽完
    draw(g, 'player', 3);

    // 手牌 = 重構拿到的那張生命卡 + 抽到的 3 張
    expect(side.hand.length).toBe(4);
    expect(side.deck.length).toBe(2);
  });

  it('重構洗入的牌不夠時，抽到的張數以實際數量為準', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    side.life = [side.life[0]];
    side.deck = [];
    side.discard = [makeInstance(g, 'trick_beng')];
    side.hand = [];

    // 只能洗入 1 張，所以最多抽到 1 張
    const drawn = draw(g, 'player', 3);

    expect(drawn).toBe(1);
    // 生命卡 1 張 + 抽到 1 張
    expect(side.hand.length).toBe(2);
  });

  it('生命區為空且需要重構時，該方敗北', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    side.deck = [];
    side.discard = [];
    side.life = [];

    draw(g, 'player', 1);

    expect(g.winner).toBe('npc');
    expect(g.phase).toBe('ended');
  });

  it('棄牌區也是空的時候無法重建牌組，該方敗北', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    side.life = [side.life[0]]; // 只留一張，自動處理
    side.deck = [];
    side.discard = []; // 沒東西可以洗回去

    draw(g, 'player', 1);

    expect(g.winner).toBe('npc');
  });

  it('重構期間玩家不能出牌', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    side.deck = [];
    side.discard = [makeInstance(g, 'trick_beng')];
    draw(g, 'player', 1);

    expect(g.pendingRebuild).not.toBeNull();

    g.phase = 'main';
    g.activeSeat = 'player';
    setHand(g, 'player', ['act_ning']);

    const result = playCard(g, 'player', side.hand[0].iid);
    expect(result.ok).toBe(true); // engine 本身不擋，由 UI 的 playerCanAct 擋
    // 這裡只確認 engine 沒有因此壞掉
    expect(g.winner).toBeNull();
  });
});

// ─────────────────────────────────────────────
// 5. 任務系統
// ─────────────────────────────────────────────

describe('任務系統', () => {
  it('達成完成條件時任務完成、等級 +1、卡片進等級區', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    const questBefore = side.currentQuest!.defId;

    // 起始任務「初試身手」的完成條件：一個回合內打出 2 張招式卡
    side.stats.playKind.technique = 2;
    evaluateAllQuests(g);

    expect(side.level).toBe(1);
    expect(side.levelZone.length).toBe(1);
    expect(side.levelZone[0].defId).toBe(questBefore);
    expect(side.currentQuest?.defId).not.toBe(questBefore);
  });

  it('被促成阻止條件時任務失敗、卡片回到手牌', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    const handBefore = side.hand.length;
    const questBefore = side.currentQuest!.defId;

    // 起始任務的阻止條件：一個回合內受到 5 點以上傷害
    side.stats.damageTaken = 5;
    evaluateAllQuests(g);

    expect(side.level).toBe(0);
    expect(side.hand.length).toBe(handBefore + 1);
    expect(side.hand.some((c) => c.defId === questBefore)).toBe(true);
  });

  it('完成條件優先於阻止條件', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    // 兩個條件同時成立
    side.stats.playKind.technique = 2;
    side.stats.damageTaken = 5;
    evaluateAllQuests(g);

    expect(side.level).toBe(1);
  });

  it('打出招式會推進任務進度（實戰路徑）', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    side.currentQuest = makeInstance(g, 'q_shishi'); // 初試身手

    setupCombat(g, 'player', ['trick_beng', 'secret_lie']);
    const [a, b] = side.hand;
    playTechnique(g, 'player', a.iid);
    playTechnique(g, 'player', b.iid);

    expect(side.level).toBe(1);
  });

  it('任務完成後不再有任務條件（已進等級區）', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    side.stats.playKind.technique = 2;
    evaluateAllQuests(g);
    const levelAfter = side.level;

    // 再檢查一次不會重複加等級
    evaluateAllQuests(g);
    expect(side.level).toBe(levelAfter);
  });
});

// ─────────────────────────────────────────────
// 6. 主要階段與卡牌使用
// ─────────────────────────────────────────────

describe('主要階段', () => {
  it('裝備卡受部位上限限制（武器只能 1 張）', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    const side = g.sides.player;
    side.level = 5;

    setHand(g, 'player', ['eq_duanyue', 'eq_duanyue']);
    expect(playCard(g, 'player', side.hand[0].iid).ok).toBe(true);

    const second = playCard(g, 'player', side.hand[0].iid);
    expect(second.ok).toBe(false);
    expect(second.reason).toContain('已滿');
  });

  it('飾品可以裝備 2 張', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    const side = g.sides.player;
    side.level = 5;

    setHand(g, 'player', ['eq_juqi', 'eq_huxin']);
    expect(playCard(g, 'player', side.hand[0].iid).ok).toBe(true);
    expect(playCard(g, 'player', side.hand[0].iid).ok).toBe(true);
    expect(side.equipment.length).toBe(2);
  });

  it('裝備卡受等級門檻限制', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    const side = g.sides.player;
    side.level = 0;

    setHand(g, 'player', ['eq_huxin']); // 等級 2 才能用
    const result = playCard(g, 'player', side.hand[0].iid);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('等級');
  });

  it('每回合最多使用 1 張事件卡', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    const side = g.sides.player;

    setHand(g, 'player', ['ev_tiebi', 'ev_tiebi']);
    expect(playCard(g, 'player', side.hand[0].iid).ok).toBe(true);

    const second = playCard(g, 'player', side.hand[0].iid);
    expect(second.ok).toBe(false);
    expect(second.reason).toContain('事件卡');
  });

  it('生命卡不足時無法支付費用', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    const side = g.sides.player;

    // 把所有生命卡橫置
    side.life.forEach((l) => (l.tapped = true));

    setHand(g, 'player', ['act_xunxi']); // cost 1
    const result = playCard(g, 'player', side.hand[0].iid);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('生命卡');
  });

  it('使用行動卡後會進入棄牌區', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    const side = g.sides.player;

    setHand(g, 'player', ['act_ning']);
    const discardBefore = side.discard.length;
    expect(playCard(g, 'player', side.hand[0].iid).ok).toBe(true);

    expect(side.discard.length).toBe(discardBefore + 1);
    expect(side.discard[side.discard.length - 1].defId).toBe('act_ning');
  });

  it('任務卡打出後會蓋到任務牌組最底下', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    const side = g.sides.player;

    setHand(g, 'player', ['q_lianji']);
    const questDeckBefore = side.questDeck.length;

    expect(playCard(g, 'player', side.hand[0].iid).ok).toBe(true);

    expect(side.questDeck.length).toBe(questDeckBefore + 1);
    expect(side.questDeck[side.questDeck.length - 1].defId).toBe('q_lianji');
  });

  it('招式卡不能在主要階段使用', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';

    setHand(g, 'player', ['trick_beng']);
    const result = playCard(g, 'player', g.sides.player.hand[0].iid);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('戰鬥階段');
  });

  it('不是自己的回合時不能出牌', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';

    setHand(g, 'npc', ['act_ning']);
    const result = playCard(g, 'npc', g.sides.npc.hand[0].iid);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('不是你的回合');
  });
});

// ─────────────────────────────────────────────
// 7. 回合流程
// ─────────────────────────────────────────────

describe('回合流程', () => {
  it('重置階段會復原橫置的生命卡', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.sides.player.life.forEach((l) => (l.tapped = true));

    beginTurn(g, 'player');

    expect(g.sides.player.life.every((l) => !l.tapped)).toBe(true);
  });

  it('抽牌階段抽 2 張', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    // 先清空手牌方便計算
    side.deck = Array.from({ length: 10 }, () => makeInstance(g, 'trick_beng'));
    side.hand = [];

    beginTurn(g, 'player');

    expect(side.hand.length).toBe(RULES.drawPerTurn);
  });

  it('爆發階段丟棄牌組頂 5 張並抽 1 張', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'burst';
    g.activeSeat = 'player';
    const side = g.sides.player;

    side.deck = Array.from({ length: 20 }, () => makeInstance(g, 'trick_beng'));
    side.hand = [];

    resolveBurst(g, true);

    expect(side.deck.length).toBe(20 - RULES.burstMill - 1);
    expect(side.hand.length).toBe(1);
    expect(side.discard.length).toBe(RULES.burstMill);
    expect(g.phase).toBe('main');
  });

  it('放棄爆發不會改變牌組', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'burst';
    g.activeSeat = 'player';
    const side = g.sides.player;

    side.deck = Array.from({ length: 20 }, () => makeInstance(g, 'trick_beng'));
    const before = side.deck.length;

    resolveBurst(g, false);

    expect(side.deck.length).toBe(before);
    expect(g.phase).toBe('main');
  });

  it('每回合開始時雙方的回合統計都會歸零', () => {
    const g = createGame(1, { manualLifeSetup: false });

    g.sides.player.stats.damageTaken = 7;
    g.sides.npc.stats.damageTaken = 3;

    beginTurn(g, 'player');

    expect(g.sides.player.stats.damageTaken).toBe(0);
    expect(g.sides.npc.stats.damageTaken).toBe(0);
  });
});


// ─────────────────────────────────────────────
// 8. 開局生命區選擇（玩家自選）
// ─────────────────────────────────────────────

describe('開局生命區選擇', () => {
  it('玩家要自己挑，不會被自動決定', () => {
    const g = createGame(1);

    expect(g.pending).not.toBeNull();
    expect(g.pending!.kind).toBe('lifeSetup');
    expect(g.pending!.pick).toBe(RULES.lifeCount);
    // 還沒選之前，生命區是空的
    expect(g.sides.player.life.length).toBe(0);
    // 候選牌就是手牌
    expect(g.pending!.candidates.length).toBe(g.sides.player.hand.length);
  });

  it('NPC 的生命區仍然自動決定，不需要玩家操心', () => {
    const g = createGame(1);
    expect(g.sides.npc.life.length).toBe(RULES.lifeCount);
    // 起始任務要等雙方生命區都設定好、finishSetup 執行時才翻開
    expect(g.sides.npc.currentQuest).toBeNull();
  });

  it('選滿指定張數後生命區就位，遊戲才正式開始', () => {
    const g = createGame(1);
    const pending = g.pending!;
    const picks = pending.candidates.slice(0, RULES.lifeCount).map((c) => c.iid);

    // 前兩張選完還不結算
    resolveChoice(g, picks[0]);
    resolveChoice(g, picks[1]);
    expect(g.pending).not.toBeNull();
    expect(g.sides.player.life.length).toBe(0);

    // 最後一張選完才結算
    resolveChoice(g, picks[2]);
    expect(g.pending).toBeNull();
    expect(g.sides.player.life.length).toBe(RULES.lifeCount);
    expect(g.phase).not.toBe('setup');
  });

  it('再點一次已選的卡可以取消選取', () => {
    const g = createGame(1);
    const iid = g.pending!.candidates[0].iid;

    resolveChoice(g, iid);
    expect(g.pending!.selected).toContain(iid);

    resolveChoice(g, iid);
    expect(g.pending!.selected).not.toContain(iid);
  });

  it('設 manualLifeSetup: false 時走自動流程（給測試與 AI 對戰用）', () => {
    const g = createGame(1, { manualLifeSetup: false });
    expect(g.pending).toBeNull();
    expect(g.sides.player.life.length).toBe(RULES.lifeCount);
  });
});

// ─────────────────────────────────────────────
// 9. 檢索（玩家自選）
// ─────────────────────────────────────────────

describe('檢索（玩家自選）', () => {
  it('使用尋隙後遊戲暫停，等玩家挑牌', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    setHand(g, 'player', ['act_xunxi']);

    const result = playCard(g, 'player', g.sides.player.hand[0].iid);

    expect(result.ok).toBe(true);
    expect(g.pending).not.toBeNull();
    expect(g.pending!.kind).toBe('search');
    expect(g.pending!.candidates.length).toBe(3);
    expect(g.pending!.pick).toBe(1);
  });

  it('選中的卡進手牌，其餘進棄牌區', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    setHand(g, 'player', ['act_xunxi']);

    playCard(g, 'player', g.sides.player.hand[0].iid);

    const pending = g.pending!;
    const chosen = pending.candidates[1].iid;
    const others = pending.candidates.filter((c) => c.iid !== chosen).map((c) => c.iid);
    const discardBefore = g.sides.player.discard.length;

    resolveChoice(g, chosen);

    expect(g.pending).toBeNull();
    expect(g.sides.player.hand.some((c) => c.iid === chosen)).toBe(true);
    for (const iid of others) {
      expect(g.sides.player.discard.some((c) => c.iid === iid), '沒選到的卡應該進棄牌區').toBe(true);
    }
    expect(g.sides.player.discard.length).toBe(discardBefore + others.length);
  });

  it('檢索期間玩家不能出牌（由 UI 的 playerCanAct 擋）', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    setHand(g, 'player', ['act_xunxi']);

    playCard(g, 'player', g.sides.player.hand[0].iid);
    expect(g.pending).not.toBeNull();
    // engine 本身不擋，狀態保持乾淨即可
    expect(g.winner).toBeNull();
  });
});
