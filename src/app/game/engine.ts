/**
 * 《氣脈》— 回合流程與主要階段
 *
 * 回合流程（依原規則書）：
 *   重置階段   橫置的生命卡復原
 *   抽牌階段   抽 2 張（裝備可增加）
 *   爆發階段   每回合一次，可丟棄牌組頂 5 張換 1 張手牌（等待玩家決定）
 *   主要階段   打出裝備／行動／事件／任務卡，費用為橫置生命卡（等待玩家操作）
 *   戰鬥階段   出招 → 防禦判定 → 傷害計算 → 歸還
 *
 * 這是一個「階段機」：reset 與 draw 會自動跑完，之後停在需要玩家輸入的階段。
 */

import { STARTER_MAIN_DECK, STARTER_QUEST_DECK, card, expandDeck } from './cards';
import { beginCombat, finishCombat, playTechnique, clearCombat } from './combat';
import { applyEffects } from './effects';
import {
  draw,
  emptyStats,
  endGame,
  expireBuffs,
  log,
  makeInstance,
  millToDiscard,
  modifier,
  nameOf,
  payAngerCost,
  payLifeCost,
  readyAllLife,
  resetTurnStats,
  resolveRebuild,
  seatLabel,
  toDiscard,
  withRng,
} from './internal';
import { evaluateQuest } from './quests';
import type { GameState, PendingChoice, Seat, SideState } from './types';
import { EQUIP_LABEL, EQUIP_LIMITS, OTHER_SEAT, RULES } from './types';
import type { PlayResult } from './combat';

// ─────────────────────────────────────────────
// 建立對局
// ─────────────────────────────────────────────

function emptySide(seat: Seat): SideState {
  return {
    seat,
    level: 0,
    deck: [],
    hand: [],
    life: [],
    anger: [],
    discard: [],
    equipment: [],
    levelZone: [],
    questDeck: [],
    currentQuest: null,
    stats: emptyStats(),
    eventsUsedThisTurn: 0,
    buffs: [],
  };
}

export interface CreateGameOptions {
  mainDeck?: Readonly<Record<string, number>>;
  questDeck?: readonly string[];
  /**
   * 開局生命卡是否由玩家自己挑。
   * 預設 true；測試與 AI 對戰可設 false 走自動流程。
   */
  manualLifeSetup?: boolean;
}

/**
 * 建立一局遊戲。同一 seed 必然產生完全相同的開局與洗牌結果。
 */
export function createGame(seed: number, opts: CreateGameOptions = {}): GameState {
  const mainDeck = opts.mainDeck ?? STARTER_MAIN_DECK;
  const questIds = opts.questDeck ?? STARTER_QUEST_DECK;

  const state: GameState = {
    seed,
    rngState: seed >>> 0 || 0x9e3779b9,
    turn: 0,
    activeSeat: 'player',
    phase: 'setup',
    sides: { player: emptySide('player'), npc: emptySide('npc') },
    combat: null,
    winner: null,
    log: [],
    nextIid: 1,
    pending: null,
    pendingRebuild: null,
  };

  log(state, null, `對局開始（seed ${seed}）。`, 'system');

  // 雙方各自建立主牌組與任務牌組
  for (const seat of ['player', 'npc'] as Seat[]) {
    const side = state.sides[seat];

    side.deck = expandDeck(mainDeck).map((id) => makeInstance(state, id));
    side.deck = withRng(state, (rng) => rng.shuffle(side.deck));

    // 任務牌組：挑出 1 張起始任務蓋在最上方，其餘洗勻墊在下面
    const starterId = questIds.find((id) => card(id).quest?.starter);
    if (!starterId) throw new Error('任務牌組必須至少包含 1 張帶有「起始任務」特徵的任務卡');

    const restIds = questIds.filter((id) => id !== starterId);
    const starter = makeInstance(state, starterId);
    const rest = withRng(state, (rng) => rng.shuffle(restIds.map((id) => makeInstance(state, id))));

    side.questDeck = [starter, ...rest];
  }

  // 隨機決定先攻。真正的回合要等雙方生命區都設定好才會開始
  const playerFirst = withRng(state, (rng) => rng.int(2) === 0);
  const first: Seat = playerFirst ? 'player' : 'npc';
  state.activeSeat = first; // 暫存先攻，beginTurn 時才真正使用

  log(state, null, `${seatLabel(first)}取得先攻。`, 'system');

  // 起始抽牌（先攻 8 張、後攻 10 張）
  for (const seat of ['player', 'npc'] as Seat[]) {
    const count = seat === first ? RULES.firstDraw : RULES.secondDraw;
    drawForSetup(state, seat, count);
    log(state, seat, `${seatLabel(seat)}起始抽 ${count} 張卡。`, 'info');
  }

  // NPC 的生命區自動決定
  autoSetupLife(state, 'npc');

  // 玩家自己挑 3 張（除非呼叫端要求自動，例如測試或 AI 對戰）
  if (opts.manualLifeSetup === false) {
    autoSetupLife(state, 'player');
    finishSetup(state);
  } else {
    state.pending = {
      kind: 'lifeSetup',
      seat: 'player',
      prompt: `從手牌選擇 ${RULES.lifeCount} 張覆蓋到生命區`,
      candidates: [...state.sides.player.hand],
      pick: RULES.lifeCount,
      selected: [],
    };
    log(state, 'player', `請從手牌選擇 ${RULES.lifeCount} 張卡作為生命區，選好才會開始遊戲。`, 'system');
  }

  return state;
}

/** 自動取手牌前 N 張作為生命區（NPC 與測試用） */
function autoSetupLife(state: GameState, seat: Seat): void {
  const side = state.sides[seat];

  for (let i = 0; i < RULES.lifeCount; i++) {
    const c = side.hand.shift();
    if (!c) break;
    side.life.push({ card: c, tapped: false });
  }

  log(state, seat, `${seatLabel(seat)}覆蓋 ${side.life.length} 張生命卡，手牌 ${side.hand.length} 張。`, 'info');
}

/**
 * 開局收尾：翻開雙方起始任務，然後開始第一個回合。
 * 由 createGame（自動模式）或 resolveChoice（玩家選完生命卡）呼叫。
 */
function finishSetup(state: GameState): void {
  for (const seat of ['player', 'npc'] as Seat[]) {
    const side = state.sides[seat];
    const q = side.questDeck.shift();
    if (q) {
      side.currentQuest = q;
      log(state, seat, `${seatLabel(seat)}的起始任務：${card(q.defId).name}。`, 'quest');
    }
  }

  beginTurn(state, state.activeSeat);
}

// ─────────────────────────────────────────────
// 玩家選擇（檢索、開局生命區）
// ─────────────────────────────────────────────

/**
 * 玩家做完選擇後接手。支援多選：每次呼叫加入一張，累積到 pick 張才結算。
 * 再點一次已選中的卡可以取消選取。
 */
export function resolveChoice(state: GameState, iid: number): void {
  const pending = state.pending;
  if (!pending || state.winner) return;
  if (!pending.candidates.some((c) => c.iid === iid)) return;

  const at = pending.selected.indexOf(iid);
  if (at >= 0) {
    pending.selected.splice(at, 1);
    return;
  }

  pending.selected.push(iid);
  if (pending.selected.length < pending.pick) return;

  if (pending.kind === 'search') finishSearchChoice(state, pending);
  else finishLifeSetupChoice(state, pending);
}

/** 檢索結算：選中的進手牌，其餘依設定進棄牌區或放回牌組頂 */
function finishSearchChoice(state: GameState, pending: PendingChoice): void {
  const side = state.sides[pending.seat];

  const picked = pending.candidates.filter((c) => pending.selected.includes(c.iid));
  const rest = pending.candidates.filter((c) => !pending.selected.includes(c.iid));

  side.hand.push(...picked);
  if (pending.rest === 'deckTop') side.deck.unshift(...rest);
  else side.discard.push(...rest);

  state.pending = null;
  log(state, pending.seat, `檢索取得「${picked.map(nameOf).join('、')}」。`, 'info');
}

/** 開局生命區結算：選中的卡從手牌移到生命區，然後開始遊戲 */
function finishLifeSetupChoice(state: GameState, pending: PendingChoice): void {
  const side = state.sides[pending.seat];
  const picked = pending.candidates.filter((c) => pending.selected.includes(c.iid));

  for (const target of picked) {
    const i = side.hand.findIndex((c) => c.iid === target.iid);
    if (i >= 0) {
      side.hand.splice(i, 1);
      side.life.push({ card: target, tapped: false });
    }
  }

  state.pending = null;
  log(
    state,
    pending.seat,
    `生命區設定完成（${side.life.length} 張），手牌 ${side.hand.length} 張。`,
    'info',
  );

  finishSetup(state);
}

/** 開局抽牌：此時還沒有生命區，所以牌組不可能抽完，不需要重構邏輯 */
function drawForSetup(state: GameState, seat: Seat, n: number): void {
  const side = state.sides[seat];
  for (let i = 0; i < n; i++) {
    const c = side.deck.shift();
    if (!c) break;
    side.hand.push(c);
  }
}

// ─────────────────────────────────────────────
// 回合流程
// ─────────────────────────────────────────────

export function beginTurn(state: GameState, seat: Seat): void {
  if (state.winner) return;

  state.activeSeat = seat;
  state.turn += 1;
  state.phase = 'reset';
  state.combat = null;

  // 「本回合」的統計對雙方都歸零：任務條件說的是「一個回合內」，
  // 而受傷發生在對手的回合，所以兩邊的統計都必須跟著當前回合重算。
  resetTurnStats(state.sides.player);
  resetTurnStats(state.sides.npc);

  // 重置階段：我方橫置的生命卡復原
  expireBuffs(state, seat, 'turnStart');
  readyAllLife(state, seat);

  log(state, null, `── 第 ${state.turn} 回合：${seatLabel(seat)}的回合 ──`, 'system');

  // 抽牌階段
  state.phase = 'draw';
  const n = RULES.drawPerTurn + modifier(state, seat, 'drawCount');
  const drawn = draw(state, seat, n);
  log(state, seat, `抽牌階段：抽 ${drawn} 張。`, 'info');

  if (state.winner) return;

  // 停在爆發階段等待玩家決定
  state.phase = 'burst';
}

/** 爆發階段：丟棄牌組頂 5 張，換 1 張手牌（每回合一次，可選擇不使用） */
export function resolveBurst(state: GameState, use: boolean): PlayResult {
  if (state.phase !== 'burst') return { ok: false, reason: '現在不是爆發階段' };
  const seat = state.activeSeat;
  const side = state.sides[seat];

  if (use) {
    const milled = millToDiscard(state, seat, RULES.burstMill);
    const drawn = draw(state, seat, 1);
    log(
      state,
      seat,
      `爆發：丟棄牌組頂 ${milled} 張，抽 ${drawn} 張。`,
      'info',
    );
    if (state.winner) return { ok: true };
  } else {
    log(state, seat, '爆發階段：放棄。', 'info');
  }

  state.phase = 'main';
  void side;
  return { ok: true };
}

// ─────────────────────────────────────────────
// 主要階段
// ─────────────────────────────────────────────

export function playCard(state: GameState, seat: Seat, iid: number): PlayResult {
  if (state.winner) return { ok: false, reason: '遊戲已經結束' };
  if (state.phase !== 'main') return { ok: false, reason: '現在不是主要階段' };
  if (state.activeSeat !== seat) return { ok: false, reason: '不是你的回合' };

  const side = state.sides[seat];
  const inst = side.hand.find((c) => c.iid === iid);
  if (!inst) return { ok: false, reason: '手牌中沒有這張卡' };

  const def = card(inst.defId);

  if (def.kind === 'technique') {
    return { ok: false, reason: '招式卡只能在戰鬥階段出招步驟使用' };
  }

  if (def.kind === 'event' && side.eventsUsedThisTurn >= RULES.eventsPerTurn) {
    return { ok: false, reason: `每回合最多使用 ${RULES.eventsPerTurn} 張事件卡` };
  }

  if (def.kind === 'equipment') {
    const slot = def.slot;
    const req = def.levelRequirement ?? 1;
    if (!slot) return { ok: false, reason: '裝備卡缺少部位資訊' };
    if (side.level < req) return { ok: false, reason: `需要等級 ${req} 才能使用（目前 ${side.level}）` };

    const used = side.equipment.filter((c) => card(c.defId).slot === slot).length;
    if (used >= EQUIP_LIMITS[slot]) {
      return { ok: false, reason: `${EQUIP_LABEL[slot]}欄位已滿（上限 ${EQUIP_LIMITS[slot]} 張）` };
    }
  }

  const cost = Math.max(0, def.cost + modifier(state, seat, 'cost'));
  if (state.sides[seat].life.filter((l) => !l.tapped).length < cost) {
    return { ok: false, reason: `需要橫置 ${cost} 張生命卡，目前不足` };
  }

  const angerCost = def.angerCost ?? 0;
  if (state.sides[seat].anger.length < angerCost) {
    return { ok: false, reason: `需要捨棄怒氣區 ${angerCost} 張卡，目前不足` };
  }

  // ── 所有檢查通過，開始結算 ──
  if (cost > 0) payLifeCost(state, seat, cost);
  if (angerCost > 0) {
    payAngerCost(state, seat, angerCost);
    log(state, seat, `捨棄怒氣區 ${angerCost} 張卡作為代價。`, 'info');
  }

  side.hand.splice(
    side.hand.findIndex((c) => c.iid === iid),
    1,
  );
  side.stats.playKind[def.kind] += 1;

  switch (def.kind) {
    case 'equipment':
      side.equipment.push(inst);
      applyEffects(state, seat, def.effects, def.name);
      log(state, seat, `${seatLabel(seat)}裝備了「${def.name}」（${EQUIP_LABEL[def.slot ?? 'weapon']}）。`, 'info');
      break;

    case 'action':
      log(state, seat, `${seatLabel(seat)}使用了行動卡「${def.name}」。`, 'info');
      applyEffects(state, seat, def.effects, def.name);
      toDiscard(state, seat, [inst]);
      break;

    case 'event':
      side.eventsUsedThisTurn += 1;
      log(state, seat, `${seatLabel(seat)}使用了事件卡「${def.name}」。`, 'info');
      applyEffects(state, seat, def.effects, def.name);
      toDiscard(state, seat, [inst]);
      break;

    case 'quest':
      // 任務卡打出後蓋到任務牌組最底下，排入未來的任務隊列
      side.questDeck.push(inst);
      log(state, seat, `${seatLabel(seat)}將任務「${def.name}」蓋到任務牌組最底下。`, 'quest');
      break;

    default:
      break;
  }

  evaluateAllQuests(state);
  return { ok: true };
}

/** 結束主要階段，進入戰鬥階段 */
export function enterCombat(state: GameState): PlayResult {
  if (state.winner) return { ok: false, reason: '遊戲已經結束' };
  if (state.phase !== 'main') return { ok: false, reason: '現在不是主要階段' };

  state.phase = 'combat';
  beginCombat(state, state.activeSeat);
  return { ok: true };
}

/** 戰鬥階段出招（轉呼叫 combat 模組，集中在這裡方便 UI 只用 engine 的 API） */
export { playTechnique };

/** 重構時玩家挑完生命卡後繼續遊戲 */
export { resolveRebuild };

/** 結束戰鬥階段並換手 */
export function endTurn(state: GameState): void {
  if (state.winner) return;

  const seat = state.activeSeat;

  // 回合結束時檢查任務條件（例如「回合結束時手牌 6 張以上」）
  evaluateAllQuests(state);
  if (state.winner) return;

  clearCombat(state);
  expireBuffs(state, seat, 'turnEnd');

  beginTurn(state, OTHER_SEAT[seat]);
}

/**
 * 直接結束當前回合（UI 的「結束回合」按鈕）：
 * 若還在主要階段，會先自動進入戰鬥階段並結算完，再換手。
 */
export function endTurnFully(state: GameState): void {
  if (state.winner) return;

  if (state.phase === 'burst') resolveBurst(state, false);
  if (state.phase === 'main') enterCombat(state);
  if (state.phase === 'combat') {
    finishCombat(state);
    clearCombat(state);
  }
  if (state.winner) return;

  evaluateAllQuests(state);
  if (state.winner) return;

  expireBuffs(state, state.activeSeat, 'turnEnd');
  beginTurn(state, OTHER_SEAT[state.activeSeat]);
}

// ─────────────────────────────────────────────
// 輔助
// ─────────────────────────────────────────────

export function evaluateAllQuests(state: GameState): void {
  if (state.winner) return;
  evaluateQuest(state, 'player');
  if (state.winner) return;
  evaluateQuest(state, 'npc');
}

/** 認輸／直接判定勝負（測試與除錯用） */
export function concede(state: GameState, seat: Seat): void {
  endGame(state, OTHER_SEAT[seat]);
}
