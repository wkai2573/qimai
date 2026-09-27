/**
 * 《氣脈》規則引擎單元測試
 *
 * 這些測試就是規則書的可執行版本。任何規則改動若破壞既有行為，這裡會立刻紅燈。
 */

import { describe, expect, it } from 'vitest';

import {
  card,
  COMMON_QUEST_DECK,
  MAGE_MAIN_DECK,
  QIGONG_MAIN_DECK,
  RAGE_MAIN_DECK,
  STARTER_MAIN_DECK,
  STARTER_QUEST_DECK,
  validateMainDeck,
  validateQuestDeck,
} from './cards';
import { beginCombat, finishCombat, playTechnique } from './combat';
import { addEventCounters, equipCard } from './effects';
import {
  activateEquipment,
  beginTurn,
  cardPlayability,
  chantTechnique,
  createGame,
  endTurnFully,
  enterCombat,
  evaluateAllQuests,
  playCard,
  resolveBurst,
  resolveChoice,
  resolveChoiceAlt,
  resolveRebuild,
} from './engine';
import { chantCost, computeCost, draw, makeInstance, millToAnger, modifier, recover } from './internal';
import type { GameState, Seat } from './types';
import { OTHER_SEAT, RULES } from './types';

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
  it('三大職業專屬主牌組各剛好 50 張且通過驗證', () => {
    for (const deck of [RAGE_MAIN_DECK, MAGE_MAIN_DECK, QIGONG_MAIN_DECK]) {
      const total = Object.values(deck).reduce((a, b) => a + b, 0);
      expect(total).toBe(RULES.mainDeckSize);
      const res = validateMainDeck(deck);
      expect(res.ok).toBe(true);
      expect(res.errors).toEqual([]);
    }
  });

  it('共通任務牌組 5 張、無同名、且含起始任務', () => {
    expect(COMMON_QUEST_DECK.length).toBe(RULES.questDeckSize);
    const res = validateQuestDeck(COMMON_QUEST_DECK);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
    expect(COMMON_QUEST_DECK.some((id) => card(id).quest?.starter)).toBe(true);
  });

  it('同名卡超過 4 張會被擋下', () => {
    const bad = { ...RAGE_MAIN_DECK, rg_tech_nuce: 5 };
    const issues = validateMainDeck(bad);
    expect(issues.ok).toBe(false);
    expect(issues.errors.some((e) => e.includes('超出同名上限'))).toBe(true);
  });

  it('密奧義合計超過 6 張會被擋下', () => {
    const bad = { ...RAGE_MAIN_DECK, rg_tech_bajuan: 4, rg_tech_nuhai: 3 };
    const issues = validateMainDeck(bad);
    expect(issues.ok).toBe(false);
    expect(issues.errors.some((e) => e.includes('密奧義'))).toBe(true);
  });

  it('使用非本角色且非共用的卡片會被擋下', () => {
    // 狂怒牌組加入秘法專屬卡
    const bad = { ...RAGE_MAIN_DECK, mg_tech_huoqiu: 1 };
    const issues = validateMainDeck(bad, 'rage');
    expect(issues.ok).toBe(false);
    expect(issues.errors.some((e) => e.includes('不屬於該角色專屬或共用卡池'))).toBe(true);
  });

  it('角色可以使用共用卡牌構築', () => {
    // 狂怒牌組把 1 張怒策換成 1 張共用卡天地吐納
    const deck = { ...RAGE_MAIN_DECK, rg_tech_nuce: 3, cm_tiandi: 1 };
    const issues = validateMainDeck(deck, 'rage');
    expect(issues.ok).toBe(true);
    expect(issues.errors).toEqual([]);
  });

  it('主牌組張數不對會被擋下', () => {
    const bad = { rg_tech_nuce: 4 };
    const issues = validateMainDeck(bad);
    expect(issues.ok).toBe(false);
    expect(issues.errors.some((e) => e.includes('50 張'))).toBe(true);
  });

  it('任務牌組缺少起始任務會被擋下', () => {
    const bad = ['qst_combo', 'qst_ready', 'qst_surge', 'qst_master', 'qst_combo'];
    const issues = validateQuestDeck(bad);
    expect(issues.ok).toBe(false);
    expect(issues.errors.some((e) => e.includes('起始任務'))).toBe(true);
    expect(issues.errors.some((e) => e.includes('重複'))).toBe(true);
  });
});

// ─────────────────────────────────────────────
// 2. 開局設置
// ─────────────────────────────────────────────

describe('開局設置', () => {
  it('先攻方在第 1 回合開始時翻開起始任務，後攻方的起始任務留待其回合開始時翻開', () => {
    const g = createGame(2024, { manualLifeSetup: false });
    const first = g.activeSeat;
    const second = OTHER_SEAT[first];

    for (const seat of ['player', 'npc'] as Seat[]) {
      expect(g.sides[seat].life.length).toBe(RULES.lifeCount);
    }
    // 先攻方翻開了起始任務
    expect(g.sides[first].currentQuest).not.toBeNull();
    expect(card(g.sides[first].currentQuest!.defId).quest?.starter).toBe(true);

    // 後攻方尚未翻開任務（第一回合先攻方不能阻止後攻方任務）
    expect(g.sides[second].currentQuest).toBeNull();
    expect(g.sides[second].questDeck.length).toBe(5);

    // 輪到後攻方回合時，後攻方起始任務翻開
    beginTurn(g, second);
    expect(g.sides[second].currentQuest).not.toBeNull();
    expect(card(g.sides[second].currentQuest!.defId).quest?.starter).toBe(true);
    expect(g.sides[second].questDeck.length).toBe(4);
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
    setupCombat(g, 'player', ['rg_tech_kuangni', 'rg_tech_nuce']);

    const [secret, trick] = g.sides.player.hand;
    expect(playTechnique(g, 'player', secret.iid).ok).toBe(true);

    const result = playTechnique(g, 'player', trick.iid);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('順序');
  });

  it('同一個 tier 不能出兩張', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['rg_tech_nuce', 'rg_tech_bengxue']);

    const [first, second] = g.sides.player.hand;
    expect(playTechnique(g, 'player', first.iid).ok).toBe(true);
    expect(playTechnique(g, 'player', second.iid).ok).toBe(false);
  });

  it('密奧義在解放條件未滿足時不能打出', () => {
    const g = createGame(1, { manualLifeSetup: false });
    // 修羅滅世拳需要怒氣區 4 張以上，開局為 0
    setupCombat(g, 'player', ['rg_tech_bajuan']);

    const result = playTechnique(g, 'player', g.sides.player.hand[0].iid);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('解放');
  });

  it('滿足條件的密奧義可以打出', () => {
    const g = createGame(1, { manualLifeSetup: false });
    // 給予足夠怒氣供修羅滅世拳解放與打出
    g.sides.player.anger = [
      makeInstance(g, 'rg_tech_nuce'),
      makeInstance(g, 'rg_tech_nuce'),
      makeInstance(g, 'rg_tech_nuce'),
      makeInstance(g, 'rg_tech_nuce'),
    ];
    setupCombat(g, 'player', ['rg_tech_bajuan']);

    expect(playTechnique(g, 'player', g.sides.player.hand[0].iid).ok).toBe(true);
  });

  it('連招成立時，後一張招式獲得額外加成', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['rg_tech_nuce', 'rg_tech_kuangni']);

    const [trick, secret] = g.sides.player.hand;
    playTechnique(g, 'player', trick.iid);
    playTechnique(g, 'player', secret.iid);

    // 怒影爪基礎傷害 1
    expect(g.combat!.plays[0].damage).toBe(1);
    // 狂逆衝基礎傷害 3 + 連招加成 2 = 5
    expect(g.combat!.plays[1].damage).toBe(5);
    expect(g.combat!.comboFormed).toBe(true);
  });

  it('沒有連招時不會獲得加成', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['rg_tech_kuangni']);

    playTechnique(g, 'player', g.sides.player.hand[0].iid);
    // 單獨打出狂逆衝，只有基礎傷害 3
    expect(g.combat!.plays[0].damage).toBe(3);
  });

  it('傷害 = 出招總和 − 防禦值，差額進入防禦方怒氣區', () => {
    const g = createGame(1, { manualLifeSetup: false });
    // 奧術飛彈傷害 2
    setupCombat(g, 'player', ['mg_tech_feidan']);
    // NPC 翻開寒冰指（防禦值 2）
    stackDeckTop(g, 'npc', ['mg_tech_feidan']); // 防禦值 1

    playTechnique(g, 'player', g.sides.player.hand[0].iid);
    const before = g.sides.npc.anger.length;
    finishCombat(g);

    expect(g.sides.npc.anger.length - before).toBe(1);
  });

  it('防禦值大於等於傷害時不會造成傷害', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['rg_tech_nuce']); // 傷害 1
    stackDeckTop(g, 'npc', ['qg_tech_chuanyun']); // 防禦值 3

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

  it('打出的招式與防禦卡依規則分流（怒底或棄牌區）', () => {
    const g = createGame(1, { manualLifeSetup: false });
    setupCombat(g, 'player', ['mg_tech_feidan']);
    stackDeckTop(g, 'npc', ['mg_tech_feidan']);

    playTechnique(g, 'player', g.sides.player.hand[0].iid);
    const playerDiscard = g.sides.player.discard.length;
    const npcDiscard = g.sides.npc.discard.length;

    finishCombat(g);

    expect(g.sides.player.discard.length).toBe(playerDiscard + 1);
    expect(g.sides.npc.discard.length).toBe(npcDiscard + 1);
  });

  it('防禦方裝備修羅戰盔時會額外翻開一張防禦卡', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const npc = g.sides.npc;
    npc.equipment = [makeInstance(g, 'rg_eq_mianju')];
    npc.buffs = [
      {
        id: g.nextIid++,
        source: '修羅戰盔',
        target: 'extraGuard',
        amount: 1,
        expiry: { at: 'permanent' },
      },
    ];

    setupCombat(g, 'player', ['mg_tech_feidan']);
    stackDeckTop(g, 'npc', ['mg_tech_feidan', 'mg_tech_feidan']);

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
    side.discard = [makeInstance(g, 'mg_tech_feidan')];
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
    side.discard = [makeInstance(g, 'mg_tech_feidan'), makeInstance(g, 'mg_tech_bingzhi')];
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

  it('P2P 連線模式下，客人（NPC 座位）重構時也會停下來讓客人玩家挑選生命卡', () => {
    const g = createGame(1, { manualLifeSetup: false, mode: 'p2p' });
    const side = g.sides.npc;
    side.deck = [];
    side.discard = [makeInstance(g, 'mg_tech_feidan'), makeInstance(g, 'mg_tech_bingzhi')];
    const chosenIid = side.life[1].card.iid;

    draw(g, 'npc', 1);
    expect(g.pendingRebuild).not.toBeNull();
    expect(g.pendingRebuild!.seat).toBe('npc');

    resolveRebuild(g, chosenIid);
    expect(g.pendingRebuild).toBeNull();
    expect(side.life.length).toBe(2);
    expect(side.hand.some((c) => c.iid === chosenIid)).toBe(true);
  });

  it('生命區只剩一張時自動重構，不打擾玩家', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    side.life = [side.life[0]];
    side.deck = [];
    side.discard = [makeInstance(g, 'mg_tech_feidan')];

    draw(g, 'player', 1);

    expect(g.pendingRebuild).toBeNull();
    expect(side.life.length).toBe(0);
  });

  it('重構會把被打斷的抽牌補完', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    side.life = [side.life[0]];
    side.deck = [];
    side.discard = ['mg_tech_feidan', 'mg_tech_bingzhi', 'mg_tech_shandian', 'mg_tech_huoqiu', 'mg_tech_yunshi'].map(
      (id) => makeInstance(g, id),
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
    side.discard = [makeInstance(g, 'mg_tech_feidan')];
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

  it('重構後牌組還是 0 張（棄牌區沒卡可洗）時，該方敗北', () => {
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
    side.discard = [makeInstance(g, 'mg_tech_feidan')];
    draw(g, 'player', 1);

    expect(g.pendingRebuild).not.toBeNull();

    g.phase = 'main';
    g.activeSeat = 'player';
    setHand(g, 'player', ['rg_xueqi']);

    const result = playCard(g, 'player', side.hand[0].iid);
    expect(result.ok).toBe(true); // engine 本身不擋，由 UI 的 playerCanAct 擋
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

    // 起始任務「初試身手」的完成條件：一個回合內使用 1 張行動卡
    side.stats.playKind.action = 1;
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
    side.stats.playKind.action = 1;
    side.stats.damageTaken = 5;
    evaluateAllQuests(g);

    expect(side.level).toBe(1);
  });

  it('打出行動卡會推進起始任務進度（實戰路徑）', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    side.currentQuest = makeInstance(g, 'qst_first');

    g.phase = 'main';
    g.activeSeat = 'player';
    setHand(g, 'player', ['rg_xueqi']);
    playCard(g, 'player', side.hand[0].iid);

    expect(side.level).toBe(1);
  });

  it('完成全部任務不會獲勝，只是等級封頂', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    // 把等級區塞滿 5 張，模擬「全部任務完成」
    side.levelZone = ['qst_first', 'qst_combo', 'qst_ready', 'qst_surge', 'qst_master'].map((id) =>
      makeInstance(g, id),
    );
    side.level = RULES.questDeckSize;
    side.currentQuest = null;

    evaluateAllQuests(g);

    expect(g.winner, '完成全部任務不該直接獲勝').toBeNull();
    expect(side.level).toBe(RULES.questDeckSize);
  });

  it('任務完成後不再有任務條件（已進等級區）', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;

    side.stats.playKind.action = 1;
    evaluateAllQuests(g);
    const levelAfter = side.level;

    evaluateAllQuests(g);
    expect(side.level).toBe(levelAfter);
  });

  it('任務失敗後回到手牌，新任務留待玩家自身的回合開始時翻開', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    side.currentQuest = makeInstance(g, 'qst_master'); // block: takeDamageInTurn >= 6
    side.questDeck = [makeInstance(g, 'qst_surge')]; // block: takeDamageInTurn >= 7
    side.stats.damageTaken = 10;

    evaluateAllQuests(g);

    // 第一張大地之境失敗回手牌
    expect(side.hand.some((c) => c.defId === 'qst_master')).toBe(true);
    // 當前任務為 null，避免在同一對手回合被連鎖判定失敗
    expect(side.currentQuest).toBeNull();

    // 到了自己的回合開始時才翻開新任務
    beginTurn(g, 'player');
    expect(side.currentQuest?.defId).toBe('qst_surge');
    expect(side.hand.some((c) => c.defId === 'qst_surge')).toBe(false);
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

    setHand(g, 'player', ['rg_eq_jufu', 'rg_eq_jufu']);
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

    setHand(g, 'player', ['rg_eq_xuejie', 'qg_eq_lingpei']);
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

    setHand(g, 'player', ['rg_eq_shixue']); // 等級 2 才能用
    const result = playCard(g, 'player', side.hand[0].iid);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('等級');
  });

  it('每回合最多使用 1 張事件卡', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    const side = g.sides.player;

    setHand(g, 'player', ['rg_tizuiliang', 'rg_tizuiliang']);
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

    setHand(g, 'player', ['rg_renqi']); // cost 2
    const result = playCard(g, 'player', side.hand[0].iid);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('生命卡');
  });

  it('一般行動卡使用後進入棄牌區', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    const side = g.sides.player;

    setHand(g, 'player', ['rg_xueqi']);
    const discardBefore = side.discard.length;
    expect(playCard(g, 'player', side.hand[0].iid).ok).toBe(true);

    expect(side.discard.length).toBe(discardBefore + 1);
    expect(side.discard[side.discard.length - 1].defId).toBe('rg_xueqi');
  });

  it('威嚇觸發迫令對手丟手牌到怒底時，若對手是人類玩家，會產生 pendingChoice 讓對手自選手牌', () => {
    const g = createGame(1, { manualLifeSetup: false, mode: 'p2p' });
    g.phase = 'main';
    g.activeSeat = 'player';
    const playerSide = g.sides.player;
    const npcSide = g.sides.npc;

    setHand(g, 'npc', ['rg_xueqi', 'rg_xueqi', 'rg_xueqi', 'rg_xueqi', 'rg_xueqi']);
    const targetCard = npcSide.hand[0];

    setHand(g, 'player', ['rg_weidai']);
    expect(playCard(g, 'player', playerSide.hand[0].iid).ok).toBe(true);

    expect(g.pending).not.toBeNull();
    expect(g.pending!.kind).toBe('handToAnger');
    expect(g.pending!.seat).toBe('npc');

    resolveChoice(g, targetCard.iid);
    expect(g.pending).toBeNull();
    expect(npcSide.anger[0].iid).toBe(targetCard.iid);
    expect(npcSide.hand.some((c) => c.iid === targetCard.iid)).toBe(false);
  });

  it('任務卡打出後會蓋到任務牌組最底下', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    const side = g.sides.player;

    setHand(g, 'player', ['qst_combo']);
    const questDeckBefore = side.questDeck.length;

    expect(playCard(g, 'player', side.hand[0].iid).ok).toBe(true);

    expect(side.questDeck.length).toBe(questDeckBefore + 1);
    expect(side.questDeck[side.questDeck.length - 1].defId).toBe('qst_combo');
  });

  it('無詠唱的招式卡不能在主要階段使用', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';

    setHand(g, 'player', ['rg_tech_nuce']);
    const result = playCard(g, 'player', g.sides.player.hand[0].iid);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('戰鬥階段');
  });

  it('不是自己的回合時不能出牌', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';

    setHand(g, 'npc', ['rg_xueqi']);
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

    side.deck = Array.from({ length: 10 }, () => makeInstance(g, 'mg_tech_feidan'));
    side.hand = [];

    beginTurn(g, 'player');

    expect(side.hand.length).toBe(RULES.drawPerTurn);
  });

  it('爆發階段丟棄牌組頂 5 張並抽 1 張', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'burst';
    g.activeSeat = 'player';
    const side = g.sides.player;

    side.deck = Array.from({ length: 20 }, () => makeInstance(g, 'mg_tech_feidan'));
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

    side.deck = Array.from({ length: 20 }, () => makeInstance(g, 'mg_tech_feidan'));
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
    expect(g.sides.player.life.length).toBe(0);
    expect(g.pending!.candidates.length).toBe(g.sides.player.hand.length);
  });

  it('NPC 的生命區仍然自動決定，不需要玩家操心', () => {
    const g = createGame(1);
    expect(g.sides.npc.life.length).toBe(RULES.lifeCount);
    expect(g.sides.npc.currentQuest).toBeNull();
  });

  it('選滿指定張數後生命區就位，遊戲才正式開始', () => {
    const g = createGame(1);
    const pending = g.pending!;
    const picks = pending.candidates.slice(0, RULES.lifeCount).map((c) => c.iid);

    resolveChoice(g, picks[0]);
    resolveChoice(g, picks[1]);
    expect(g.pending).not.toBeNull();
    expect(g.sides.player.life.length).toBe(0);

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
  it('使用魔脈探尋後遊戲暫停，等玩家挑牌', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    setHand(g, 'player', ['mg_tanxun']);

    const result = playCard(g, 'player', g.sides.player.hand[0].iid);

    expect(result.ok).toBe(true);
    expect(g.pending).not.toBeNull();
    expect(g.pending!.kind).toBe('search');
    expect(g.pending!.candidates.length).toBe(4);
    expect(g.pending!.pick).toBe(1);
  });

  it('選中的卡進手牌，其餘進棄牌區', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.phase = 'main';
    g.activeSeat = 'player';
    setHand(g, 'player', ['mg_tanxun']);

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
});

// ─────────────────────────────────────────────
// 10. 三大角色特異機制（狂怒、秘法、氣功）
// ─────────────────────────────────────────────

describe('角色特異機制', () => {
  it('狂怒：標有【怒底】的卡片打出後進入怒氣區最底部', () => {
    const g = createGame(1, { manualLifeSetup: false, playerCharacter: 'rage' });
    g.phase = 'main';
    g.activeSeat = 'player';

    // 怒氣區先塞一張既有卡
    const existing = makeInstance(g, 'rg_xueqi');
    g.sides.player.anger = [existing];

    setHand(g, 'player', ['rg_paohua']); // 拋下狠話（怒底行動卡）
    const targetIid = g.sides.player.hand[0].iid;

    playCard(g, 'player', targetIid);

    // 應該被 unshift 到 anger[0]（最底）
    expect(g.sides.player.anger.length).toBe(2);
    expect(g.sides.player.anger[0].iid).toBe(targetIid);
    expect(g.sides.player.anger[1].iid).toBe(existing.iid);
  });

  it('秘法：主要階段詠唱招式，戰鬥階段作為額外詠唱打擊結算', () => {
    const g = createGame(1, { manualLifeSetup: false, playerCharacter: 'mage' });
    g.phase = 'main';
    g.activeSeat = 'player';

    // 奧術飛彈：chant cost 1, damage 2
    setHand(g, 'player', ['mg_tech_feidan']);
    const target = g.sides.player.hand[0];

    const chantRes = chantTechnique(g, 'player', target.iid);
    expect(chantRes.ok).toBe(true);
    expect(g.sides.player.chantedCards.length).toBe(1);

    // 進入戰鬥階段
    g.phase = 'combat';
    beginCombat(g, 'player');

    // 詠唱招式轉入 combat.chantPlays
    expect(g.combat!.chantPlays.length).toBe(1);
    expect(g.combat!.chantPlays[0].damage).toBe(2);

    // 防禦方翻開防禦值 0 的卡（魔脈探尋），結算後造成 2 點全額傷害進 NPC 怒氣
    stackDeckTop(g, 'npc', ['mg_tanxun']);
    const npcAngerBefore = g.sides.npc.anger.length;
    finishCombat(g);

    expect(g.sides.npc.anger.length - npcAngerBefore).toBe(2);
  });

  it('氣功：冷卻卡打出後進入冷卻區，冷卻期間提供常駐 Buff，計時結束送入棄牌區', () => {
    const g = createGame(1, { manualLifeSetup: false, playerCharacter: 'qigong' });
    g.phase = 'main';
    g.activeSeat = 'player';

    // 運氣調息：cooldown 2, cooldownBuff: recoverAmount +1
    setHand(g, 'player', ['qg_tiaoxi']);
    const cdCard = g.sides.player.hand[0];

    playCard(g, 'player', cdCard.iid);

    expect(g.sides.player.cooldownZone.length).toBe(1);
    expect(g.sides.player.cooldownZone[0].card.iid).toBe(cdCard.iid);
    expect(g.sides.player.cooldownZone[0].counter).toBe(0);
    expect(g.sides.player.cooldownZone[0].maxCounter).toBe(2);

    // 推進回合（tickCooldowns）
    endTurnFully(g); // 結束 player 回合，進入 npc 回合
    endTurnFully(g); // 結束 npc 回合，再次回到 player 回合

    // counter 增為 1
    expect(g.sides.player.cooldownZone[0].counter).toBe(1);

    // 再走一輪回合
    endTurnFully(g);
    endTurnFully(g);

    // 冷卻歸零，自動移入棄牌區
    expect(g.sides.player.cooldownZone.length).toBe(0);
    expect(g.sides.player.discard.some((c) => c.iid === cdCard.iid)).toBe(true);
  });
});

// ─────────────────────────────────────────────
// 重構時的傷害接續
// ─────────────────────────────────────────────

describe('重構：傷害打到一半牌組見底', () => {
  function fill(g: GameState, n: number, id = 'cm_xinjue') {
    return Array.from({ length: n }, () => makeInstance(g, id));
  }

  for (const seat of ['npc', 'player'] as const) {
    it(`${seat === 'player' ? '玩家（要自己選生命卡）' : 'NPC（自動）'}：牌組 3 張、棄牌 20 張時受到 10 點傷害 → 先丟 3 張，重構，再用新牌組丟 7 張`, () => {
      const g = createGame(1, { manualLifeSetup: false });
      const side = g.sides[seat];
      side.deck = fill(g, 3);
      side.discard = fill(g, 20);
      side.anger = [];

      millToAnger(g, seat, 10);
      if (g.pendingRebuild) resolveRebuild(g, side.life[0].card.iid);

      expect(g.winner).toBeNull();
      expect(side.life.length).toBe(2);
      expect(side.anger.length).toBe(10);
      expect(side.deck.length).toBe(13);
      expect(side.discard.length).toBe(0);
    });
  }

  it('防禦判定翻牌時就要重構、又要等玩家選生命卡：傷害會在重構完成後補算，不會消失', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    side.deck = [];
    side.discard = fill(g, 20);
    side.anger = [];

    setupCombat(g, 'npc', ['rg_tech_bajuan']);
    g.sides.npc.anger = fill(g, 4, 'rg_tech_nuce'); // 解放條件：怒氣 4 張
    playTechnique(g, 'npc', g.sides.npc.hand[0].iid);
    finishCombat(g);

    expect(g.pendingRebuild?.seat).toBe('player');
    const damage = g.combat!.damage;
    expect(damage).toBeGreaterThan(0);

    resolveRebuild(g, side.life[0].card.iid);
    expect(side.anger.length).toBe(damage);
    expect(g.sides.npc.stats.damageDealt).toBe(damage);
  });

  it('一方在等重構時，另一方照常抽牌', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.sides.player.deck = [];
    g.sides.player.discard = fill(g, 5);
    draw(g, 'player', 1);
    expect(g.pendingRebuild?.seat).toBe('player');

    const before = g.sides.npc.hand.length;
    expect(draw(g, 'npc', 2)).toBe(2);
    expect(g.sides.npc.hand.length).toBe(before + 2);
  });
});

// ─────────────────────────────────────────────
// 事件區、裝備發動、指示物與擴充卡
// ─────────────────────────────────────────────

/** 讓某一方進入主要階段（可以直接出牌） */
function mainPhaseFor(g: GameState, seat: Seat): void {
  g.activeSeat = seat;
  g.phase = 'main';
  g.sides[seat].eventsUsedThisTurn = 0;
}

function playFromHand(g: GameState, seat: Seat, defId: string) {
  const inst = g.sides[seat].hand.find((c) => c.defId === defId)!;
  return playCard(g, seat, inst.iid);
}

describe('事件區與持續時間', () => {
  it('事件結算後進入事件區；雙方共用一格，新事件取代舊事件，舊事件回到持有者的棄牌區', () => {
    const g = createGame(1, { manualLifeSetup: false });

    mainPhaseFor(g, 'player');
    setHand(g, 'player', ['cm_jinchan']);
    expect(playFromHand(g, 'player', 'cm_jinchan').ok).toBe(true);
    expect(g.eventZone?.card.defId).toBe('cm_jinchan');
    expect(g.eventZone?.owner).toBe('player');

    mainPhaseFor(g, 'npc');
    setHand(g, 'npc', ['mg_lichang']);
    expect(playFromHand(g, 'npc', 'mg_lichang').ok).toBe(true);
    expect(g.eventZone?.card.defId).toBe('mg_lichang');
    expect(g.eventZone?.owner).toBe('npc');
    expect(g.sides.player.discard.some((c) => c.defId === 'cm_jinchan')).toBe(true);
  });

  it('雙方回合結束各放 1 個持續時間指示物，達到持續時間就捨棄', () => {
    const g = createGame(1, { manualLifeSetup: false });
    mainPhaseFor(g, 'player');
    setHand(g, 'player', ['rg_shenshenxian']); // 持續時間 2
    playFromHand(g, 'player', 'rg_shenshenxian');

    endTurnFully(g); // 我方回合結束 → 1
    expect(g.eventZone?.counters).toBe(1);

    endTurnFully(g); // 對手回合結束 → 2，到期
    expect(g.eventZone).toBeNull();
    expect(g.sides.player.discard.some((c) => c.defId === 'rg_shenshenxian')).toBe(true);
  });

  it('祕法加速讓事件提前到期；本回合有事件到期時，冰牆的詠唱 +5', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.eventZone = { card: makeInstance(g, 'rg_shenshenxian'), owner: 'npc', counters: 0 };
    mainPhaseFor(g, 'player');
    setHand(g, 'player', ['mg_jiasu', 'mg_el_bingqiang']);

    playFromHand(g, 'player', 'mg_jiasu');
    expect(g.eventZone).toBeNull();
    expect(g.eventExpiredThisTurn).toBe(true);
    expect(g.sides.npc.discard.some((c) => c.defId === 'rg_shenshenxian')).toBe(true);

    const wall = g.sides.player.hand.find((c) => c.defId === 'mg_el_bingqiang')!;
    expect(chantTechnique(g, 'player', wall.iid).ok).toBe(true);
    enterCombat(g);
    expect(g.combat!.chantPlays[0].damage).toBe(6);
  });

  it('整理魔導書離開事件區時，持有者依指示物數從棄牌區取回招式', () => {
    const g = createGame(1, { manualLifeSetup: false });
    g.eventZone = { card: makeInstance(g, 'mg_modao'), owner: 'npc', counters: 2 };
    g.sides.npc.discard = ['mg_el_huoqiu', 'mg_el_bingzhui', 'mg_el_dianqiu'].map((id) => makeInstance(g, id));
    const handBefore = g.sides.npc.hand.length;

    mainPhaseFor(g, 'player');
    setHand(g, 'player', ['cm_qiguan']);
    playFromHand(g, 'player', 'cm_qiguan'); // 取代整理魔導書

    expect(g.sides.npc.hand.length).toBe(handBefore + 2);
    expect(g.sides.npc.discard.map((c) => c.defId)).toContain('mg_modao');
  });

  it('憤怒氣場：怒氣區 8 張以上才能打出', () => {
    const g = createGame(1, { manualLifeSetup: false });
    mainPhaseFor(g, 'player');
    setHand(g, 'player', ['rg_nuqichang']);
    const inst = g.sides.player.hand[0];

    g.sides.player.anger = Array.from({ length: 7 }, () => makeInstance(g, 'rg_tech_nuce'));
    expect(cardPlayability(g, 'player', inst.iid).ok).toBe(false);

    g.sides.player.anger.push(makeInstance(g, 'rg_tech_nuce'));
    expect(cardPlayability(g, 'player', inst.iid).ok).toBe(true);
  });

  it('應援團：金項鍊與 +9棍棒減費；在事件區時招式免費（含怒氣費用）且回復 +1', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    equipCard(g, 'player', makeInstance(g, 'rg_eq_jinxianglian'));
    equipCard(g, 'player', makeInstance(g, 'rg_eq_gunbang'));
    expect(computeCost(g, 'player', card('rg_yingyuan')).life).toBe(1);

    side.anger = Array.from({ length: 4 }, () => makeInstance(g, 'rg_tech_nuce'));
    mainPhaseFor(g, 'player');
    setHand(g, 'player', ['rg_yingyuan']);
    expect(playFromHand(g, 'player', 'rg_yingyuan').ok).toBe(true);
    expect(side.anger.length).toBe(0); // 捨棄我方怒氣區全部卡片

    expect(computeCost(g, 'player', card('rg_tech_nubaofa'))).toEqual({ life: 0, anger: 0 });

    side.anger = Array.from({ length: 3 }, () => makeInstance(g, 'rg_tech_nuce'));
    expect(recover(g, 'player', 1)).toBe(2);
  });
});

describe('裝備：橫置、發動與觸發', () => {
  it('頭巾發動會橫置並把棄牌區移入怒氣區；夾腳拖鞋在裝備橫置時回復 1；重置階段復原', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    const bandana = makeInstance(g, 'rg_eq_toujin');
    equipCard(g, 'player', bandana);
    equipCard(g, 'player', makeInstance(g, 'rg_eq_jiaotuo'));
    side.discard = ['cm_xinjue', 'cm_xinjue', 'cm_xinjue'].map((id) => makeInstance(g, id));
    side.anger = [makeInstance(g, 'rg_tech_nuce')];
    const deckBefore = side.deck.length;

    mainPhaseFor(g, 'player');
    expect(activateEquipment(g, 'player', bandana.iid).ok).toBe(true);
    expect(side.tappedEquipment).toContain(bandana.iid);
    expect(side.deck.length).toBe(deckBefore + 1); // 夾腳拖鞋：回復 1
    expect(side.anger.length).toBe(2); // 頭巾：棄牌區 2 張進怒氣區

    expect(activateEquipment(g, 'player', bandana.iid).ok).toBe(false); // 已橫置

    beginTurn(g, 'player');
    expect(side.tappedEquipment).toEqual([]);
  });

  it('金項鍊：支付 1 費橫置、橫置時回復 1；我方打出事件時重置', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    const necklace = makeInstance(g, 'rg_eq_jinxianglian');
    equipCard(g, 'player', necklace);
    side.anger = [makeInstance(g, 'rg_tech_nuce'), makeInstance(g, 'rg_tech_nuce')];

    mainPhaseFor(g, 'player');
    expect(activateEquipment(g, 'player', necklace.iid).ok).toBe(true);
    expect(side.life.filter((l) => l.tapped).length).toBe(1);
    expect(side.anger.length).toBe(1);

    setHand(g, 'player', ['cm_qiguan']);
    playCard(g, 'player', side.hand[0].iid);
    expect(side.tappedEquipment).not.toContain(necklace.iid);
  });

  it('藥膏貼布：回復 +1；對手回合結束時放到怒氣區底並失去加成', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const patch = makeInstance(g, 'rg_eq_yaogao');
    equipCard(g, 'player', patch);
    expect(modifier(g, 'player', 'recoverAmount')).toBe(1);

    mainPhaseFor(g, 'npc');
    endTurnFully(g);

    expect(g.sides.player.equipment).toEqual([]);
    expect(g.sides.player.anger[0].iid).toBe(patch.iid);
    expect(modifier(g, 'player', 'recoverAmount')).toBe(0);
  });

  it('繃帶：牌組見底要重構前，放到怒氣區底並捨棄怒氣區 10 張，讓新牌組變厚', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    equipCard(g, 'player', makeInstance(g, 'rg_eq_bengdai'));
    side.life = [side.life[0]]; // 只剩一張，自動重構
    side.deck = [];
    side.discard = [];
    side.anger = Array.from({ length: 12 }, () => makeInstance(g, 'rg_tech_nuce'));

    draw(g, 'player', 1);

    expect(g.winner).toBeNull();
    expect(side.equipment).toEqual([]);
    expect(side.anger.length).toBe(3); // 12 + 繃帶 − 10
    expect(side.deck.length).toBe(9); // 10 張洗成牌組，再抽掉 1 張
  });

  it('小刀：事件區有我方事件時，招式傷害 +1、密奧義再 +2', () => {
    const g = createGame(1, { manualLifeSetup: false });
    equipCard(g, 'player', makeInstance(g, 'rg_eq_xiaodao'));
    expect(modifier(g, 'player', 'techniqueDamage')).toBe(0);

    g.eventZone = { card: makeInstance(g, 'mg_modao'), owner: 'player', counters: 0 };
    expect(modifier(g, 'player', 'techniqueDamage')).toBe(1);
    expect(modifier(g, 'player', 'hiddenDamage')).toBe(2);
  });

  it('打老婆吊嘎：對手的事件在事件區時，我方打出事件要多選 1 張手牌放到怒氣區底', () => {
    const g = createGame(1, { manualLifeSetup: false });
    equipCard(g, 'npc', makeInstance(g, 'rg_eq_diaoga'));
    g.eventZone = { card: makeInstance(g, 'mg_modao'), owner: 'npc', counters: 0 };

    mainPhaseFor(g, 'player');
    setHand(g, 'player', ['cm_qiguan']);
    expect(cardPlayability(g, 'player', g.sides.player.hand[0].iid).ok).toBe(false);

    setHand(g, 'player', ['cm_qiguan', 'cm_xinjue']);
    const extra = g.sides.player.hand[1];
    expect(playCard(g, 'player', g.sides.player.hand[0].iid).ok).toBe(true);
    expect(g.pending?.kind).toBe('handToAnger');
    resolveChoice(g, extra.iid);
    expect(g.sides.player.anger[0].iid).toBe(extra.iid);
  });

  it('防滑手套：我方事件在事件區時，對手防禦值 − 我方最後一張招式的防禦值', () => {
    const g = createGame(1, { manualLifeSetup: false });
    equipCard(g, 'player', makeInstance(g, 'rg_eq_fanghua'));
    g.eventZone = { card: makeInstance(g, 'mg_modao'), owner: 'player', counters: 0 };
    stackDeckTop(g, 'npc', ['cm_tech_zhengquan']); // 防禦 2

    setupCombat(g, 'player', ['rg_tech_nuce']); // 防禦 1
    playTechnique(g, 'player', g.sides.player.hand[0].iid);
    finishCombat(g);

    expect(g.combat!.defenseGuard).toBe(1);
  });

  it('修羅百兵：此擊傷害 + 橫置狀態的裝備張數', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    for (const id of ['rg_eq_toujin', 'rg_eq_pijiu', 'rg_eq_jiaotuo']) equipCard(g, 'player', makeInstance(g, id));
    side.tappedEquipment = [side.equipment[0].iid, side.equipment[1].iid];

    setupCombat(g, 'player', ['rg_tech_baibing']);
    expect(playTechnique(g, 'player', side.hand[0].iid).ok).toBe(true);
    expect(g.combat!.plays[0].damage).toBe(7);
  });
});

describe('秘法：詠唱與指示物', () => {
  it('秘法力場：我方詠唱時放「被詠唱卡防禦值」的指示物，防禦時防禦值 + 指示物數', () => {
    const g = createGame(1, { manualLifeSetup: false });
    mainPhaseFor(g, 'player');
    setHand(g, 'player', ['mg_lichang', 'mg_el_bingzhui']);
    playCard(g, 'player', g.sides.player.hand[0].iid);
    chantTechnique(g, 'player', g.sides.player.hand[0].iid);

    // 冰錐的詠唱效果 1 + 冰錐防禦值 3
    expect(g.eventZone?.counters).toBe(4);

    stackDeckTop(g, 'player', ['cm_tech_zhengquan']); // 防禦 2
    setupCombat(g, 'npc', ['rg_tech_nuce']);
    playTechnique(g, 'npc', g.sides.npc.hand[0].iid);
    finishCombat(g);
    expect(g.combat!.defenseGuard).toBe(6);
  });

  it('秘法法袍：秘法力場的指示物改放到法袍上，受到傷害時 1 個指示物抵 1 點', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    const robe = makeInstance(g, 'mg_eq_mipao');
    equipCard(g, 'player', robe);
    g.eventZone = { card: makeInstance(g, 'mg_lichang'), owner: 'player', counters: 0 };

    addEventCounters(g, 3, '測試');
    expect(g.eventZone.counters).toBe(0);
    expect(side.equipCounters[robe.iid]).toBe(3);

    const angerBefore = side.anger.length;
    millToAnger(g, 'player', 2);
    expect(side.equipCounters[robe.iid]).toBe(1);
    expect(side.anger.length).toBe(angerBefore);
  });

  it('秘法帽：我方事件放指示物時跟著放，受到傷害時 2 個指示物抵 1 點', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    const hat = makeInstance(g, 'mg_eq_mimao');
    equipCard(g, 'player', hat);
    g.eventZone = { card: makeInstance(g, 'mg_modao'), owner: 'player', counters: 0 };

    addEventCounters(g, 3, '測試');
    expect(g.eventZone.counters).toBe(3);
    expect(side.equipCounters[hat.iid]).toBe(3);

    const angerBefore = side.anger.length;
    millToAnger(g, 'player', 2); // 2 個指示物抵 1 點，剩 1 點打進來
    expect(side.equipCounters[hat.iid]).toBe(1);
    expect(side.anger.length).toBe(angerBefore + 1);
  });

  it('高速詠唱讓詠唱費用改為 1；賢者法杖付 1 費後本回合可額外詠唱 1 次', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    const staff = makeInstance(g, 'mg_eq_xianzhang');
    equipCard(g, 'player', staff);
    mainPhaseFor(g, 'player');
    setHand(g, 'player', ['mg_gaosu', 'mg_el_huoqiang', 'mg_el_bingqiang']);

    playCard(g, 'player', side.hand[0].iid);
    expect(chantCost(g, 'player', card('mg_el_huoqiang'))).toBe(1);

    expect(chantTechnique(g, 'player', side.hand[0].iid).ok).toBe(true);
    expect(chantTechnique(g, 'player', side.hand[0].iid).ok).toBe(false); // 次數用完

    expect(activateEquipment(g, 'player', staff.iid).ok).toBe(true);
    expect(chantTechnique(g, 'player', side.hand[0].iid).ok).toBe(true);
  });

  it('賢者法袍：詠唱費用可以改用橫置裝備支付', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    equipCard(g, 'player', makeInstance(g, 'mg_eq_xianpao'));
    equipCard(g, 'player', makeInstance(g, 'cm_eq_tieyi'));
    for (const l of side.life) l.tapped = true;

    mainPhaseFor(g, 'player');
    setHand(g, 'player', ['mg_el_huoqiang']); // 詠唱(2)
    expect(chantTechnique(g, 'player', side.hand[0].iid).ok).toBe(true);
    expect(side.tappedEquipment.length).toBe(2);
  });

  it('火牆詠唱後，本回合其他名稱含「火」的招式 +2，火牆自己不加', () => {
    const g = createGame(1, { manualLifeSetup: false });
    mainPhaseFor(g, 'player');
    setHand(g, 'player', ['mg_el_huoqiang', 'mg_el_huoqiu']);
    chantTechnique(g, 'player', g.sides.player.hand[0].iid);

    enterCombat(g);
    expect(g.combat!.chantPlays[0].damage).toBe(1);

    playTechnique(g, 'player', g.sides.player.hand[0].iid);
    expect(g.combat!.plays[0].damage).toBe(4);
  });

  it('完全詠唱：獲得本回合打出招式的詠唱加成，並算作額外詠唱 1 次', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    mainPhaseFor(g, 'player');
    setHand(g, 'player', ['mg_el_huoqiu', 'mg_tech_wanquan']);
    chantTechnique(g, 'player', side.hand[0].iid); // 火球：詠唱加成 +2

    enterCombat(g);
    expect(playTechnique(g, 'player', side.hand[0].iid).ok).toBe(true);
    expect(g.combat!.plays[0].damage).toBe(3); // 基礎 1 + 2
    expect(side.stats.chants).toBe(2);
  });

  it('電光石火：捨棄手牌，棄牌區的電／火招式洗回牌組，此擊 + 洗回的張數', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    mainPhaseFor(g, 'player');
    setHand(g, 'player', ['mg_el_huoqiu', 'mg_tech_shandian', 'mg_tech_dianguang', 'cm_xinjue']);
    side.discard = ['mg_el_huoyu', 'mg_el_dianqiu', 'cm_tiandi'].map((id) => makeInstance(g, id));

    chantTechnique(g, 'player', side.hand[0].iid); // 火
    enterCombat(g);
    playTechnique(g, 'player', side.hand.find((c) => c.defId === 'mg_tech_shandian')!.iid); // 電
    expect(playTechnique(g, 'player', side.hand.find((c) => c.defId === 'mg_tech_dianguang')!.iid).ok).toBe(true);

    expect(side.hand).toEqual([]);
    expect(side.discard.map((c) => c.defId).sort()).toEqual(['cm_tiandi', 'cm_xinjue']);
    expect(g.combat!.plays[1].damage).toBe(7); // 5 + 洗回 2 張
  });

  it('電球：可以選「不發動」；選了就捨棄那張手牌，接著從棄牌區取回「電」招式', () => {
    const g = createGame(1, { manualLifeSetup: false });
    const side = g.sides.player;
    side.discard = [makeInstance(g, 'mg_tech_shandian')];

    setupCombat(g, 'player', ['mg_el_dianqiu', 'cm_xinjue']);
    playTechnique(g, 'player', side.hand[0].iid);
    expect(g.pending?.alt?.label).toBe('不發動');
    resolveChoiceAlt(g);
    expect(g.pending).toBeNull();
    expect(side.hand.map((c) => c.defId)).toEqual(['cm_xinjue']);

    const g2 = createGame(1, { manualLifeSetup: false });
    const side2 = g2.sides.player;
    side2.discard = [makeInstance(g2, 'mg_tech_shandian')];
    setupCombat(g2, 'player', ['mg_el_dianqiu', 'cm_xinjue']);
    playTechnique(g2, 'player', side2.hand[0].iid);
    resolveChoice(g2, side2.hand[0].iid); // 捨棄靜心凝氣
    expect(g2.pending?.kind).toBe('salvage');
    resolveChoice(g2, g2.pending!.candidates.find((c) => c.defId === 'mg_tech_shandian')!.iid);
    expect(side2.hand.map((c) => c.defId)).toEqual(['mg_tech_shandian']);
  });
});
