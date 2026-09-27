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

import {
  CHARACTER_MAIN_DECKS,
  COMMON_QUEST_DECK,
  card,
  expandDeck,
} from './cards';
import { beginCombat, finishCombat, playTechnique, clearCombat } from './combat';
import {
  applyEffect,
  applyEffects,
  chantFromDiscard,
  chantResources,
  checkCondition,
  equipBlockReason,
  equipCard,
  equipFromHand,
  payChantCost,
  performChant,
  placeEvent,
  tapEquipment,
  tickEventZone,
} from './effects';
import {
  advancePending,
  canPlayWithCooldown,
  chantCost,
  chantsLeft,
  computeCost,
  consumeOnceCostBuffs,
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
  readyAllEquipment,
  readyAllLife,
  removeEquipment,
  resetTurnStats,
  resolveRebuild,
  routeCardAfterPlay,
  seatLabel,
  tickCooldowns,
  toDiscard,
  withRng,
} from './internal';
import { evaluateQuest, revealNextQuest } from './quests';
import type { CardDef, CharacterId, GameState, PendingChoice, Seat, SideState } from './types';
import { OTHER_SEAT, RULES } from './types';
import type { PlayResult } from './combat';

// ─────────────────────────────────────────────
// 建立對局
// ─────────────────────────────────────────────

function emptySide(seat: Seat, character: CharacterId = 'rage'): SideState {
  return {
    seat,
    character,
    level: 0,
    deck: [],
    hand: [],
    life: [],
    anger: [],
    discard: [],
    equipment: [],
    tappedEquipment: [],
    equipCounters: {},
    levelZone: [],
    questDeck: [],
    currentQuest: null,
    cooldownZone: [],
    techniqueZone: [],
    chantsUsedThisTurn: 0,
    freeNextCards: [],
    immuneTrickSecretNextTurn: false,
    stats: emptyStats(),
    eventsUsedThisTurn: 0,
    questResolvedThisTurn: false,
    buffs: [],
  };
}

export interface CreateGameOptions {
  playerCharacter?: CharacterId;
  npcCharacter?: CharacterId;
  mainDeck?: Readonly<Record<string, number>>;
  npcMainDeck?: Readonly<Record<string, number>>;
  questDeck?: readonly string[];
  /**
   * 開局生命卡是否由玩家自己挑。
   * 預設 true；測試與 AI 對戰可設 false 走自動流程。
   */
  manualLifeSetup?: boolean;
  /**
   * 雙方玩家是否都要自己挑生命卡（連線對戰用）。
   */
  manualLifeSetupBoth?: boolean;
  /**
   * 對戰模式（單機或 P2P 連線）
   */
  mode?: 'solo' | 'p2p';
}

/**
 * 建立一局遊戲。同一 seed 必然產生完全相同的開局與洗牌結果。
 */
export function createGame(seed: number, opts: CreateGameOptions = {}): GameState {
  const playerChar: CharacterId = opts.playerCharacter ?? 'rage';
  const npcChar: CharacterId = opts.npcCharacter ?? 'rage';

  const playerDeckMap = opts.mainDeck ?? CHARACTER_MAIN_DECKS[playerChar];
  const npcDeckMap = opts.npcMainDeck ?? (opts.mainDeck && !opts.npcCharacter ? opts.mainDeck : CHARACTER_MAIN_DECKS[npcChar]);
  const questIds = opts.questDeck ?? COMMON_QUEST_DECK;

  const state: GameState = {
    seed,
    rngState: seed >>> 0 || 0x9e3779b9,
    mode: opts.mode ?? (opts.manualLifeSetupBoth ? 'p2p' : 'solo'),
    turn: 0,
    activeSeat: 'player',
    phase: 'setup',
    sides: {
      player: emptySide('player', playerChar),
      npc: emptySide('npc', npcChar),
    },
    combat: null,
    winner: null,
    log: [],
    nextIid: 1,
    pending: null,
    pendingQueue: [],
    pendingRebuild: null,
    eventZone: null,
    eventExpiredThisTurn: false,
  };

  log(state, null, `對局開始（seed ${seed}）。`, 'system');

  // 雙方各自建立主牌組與任務牌組
  for (const seat of ['player', 'npc'] as Seat[]) {
    const side = state.sides[seat];
    const deckMap = seat === 'player' ? playerDeckMap : npcDeckMap;

    side.deck = expandDeck(deckMap).map((id) => makeInstance(state, id));
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

  if (!opts.manualLifeSetupBoth) {
    // 單機模式或測試：NPC 的生命區自動決定
    autoSetupLife(state, 'npc');
  }

  // 玩家自己挑 3 張（除非呼叫端要求自動，例如測試或 AI 對戰）
  if (opts.manualLifeSetup === false) {
    autoSetupLife(state, 'player');
    if (opts.manualLifeSetupBoth) {
      autoSetupLife(state, 'npc');
    }
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
 * 開局收尾：開始第一個回合（先攻玩家的回合）。
 * 任務卡將在各玩家自身的回合開始時翻開，避免先攻方在第 1 回合直接阻止後攻方任務。
 * 由 createGame（自動模式）或 resolveChoice（玩家選完生命卡）呼叫。
 */
function finishSetup(state: GameState): void {
  beginTurn(state, state.activeSeat);
}

// ─────────────────────────────────────────────
// 玩家選擇（檢索、開局生命區、迫令怒底）
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

  switch (pending.kind) {
    case 'search':
      finishSearchChoice(state, pending);
      break;
    case 'salvage':
      finishSalvageChoice(state, pending);
      break;
    case 'handToAnger':
      finishHandToAngerChoice(state, pending);
      break;
    case 'discardFromHand':
      finishDiscardChoice(state, pending);
      break;
    case 'chantFromDiscard':
      chantFromDiscard(state, pending.seat, pending.selected[0]);
      advancePending(state);
      break;
    case 'freeEquip':
      equipFromHand(state, pending.seat, pending.selected[0], pending.source ?? '免費裝備');
      advancePending(state);
      break;
    case 'oppDiscardToAnger':
      finishOppDiscardToAngerChoice(state, pending);
      break;
    default:
      finishLifeSetupChoice(state, pending);
      return;
  }

  // 「如果這麼做，則…」：選完之後接著結算
  applyEffects(state, pending.seat, pending.then, pending.source ?? '');
}

/**
 * 選擇替代選項（例如「不發動」「改為捨棄牌組頂 4 張」）。
 * 不會結算 then（因為沒有「這麼做」）。
 */
export function resolveChoiceAlt(state: GameState): void {
  const pending = state.pending;
  if (!pending?.alt || state.winner) return;

  log(state, pending.seat, `${seatLabel(pending.seat)}選擇「${pending.alt.label}」。`, 'info');
  advancePending(state);
  applyEffects(state, pending.seat, pending.alt.effects, pending.source ?? '');
}

/** 回收結算：選中的卡從棄牌區加入手牌 */
function finishSalvageChoice(state: GameState, pending: PendingChoice): void {
  const side = state.sides[pending.seat];
  const picked = pending.candidates.filter((c) => pending.selected.includes(c.iid));

  for (const c of picked) {
    const idx = side.discard.findIndex((x) => x.iid === c.iid);
    if (idx >= 0) {
      side.discard.splice(idx, 1);
      side.hand.push(c);
      log(state, pending.seat, `${seatLabel(pending.seat)}從棄牌區取回「${nameOf(c)}」。`, 'info');
    }
  }
  advancePending(state);
}

/** 手牌移到怒底結算：選中的手牌移入自己的怒氣區底 */
function finishHandToAngerChoice(state: GameState, pending: PendingChoice): void {
  const side = state.sides[pending.seat];
  for (const targetIid of pending.selected) {
    const idx = side.hand.findIndex((c) => c.iid === targetIid);
    if (idx >= 0) {
      const c = side.hand.splice(idx, 1)[0];
      side.anger.unshift(c);
      log(state, pending.seat, `【迫令怒底】${seatLabel(pending.seat)}將手牌「${nameOf(c)}」置入怒氣區底。`, 'combat');
    }
  }
  advancePending(state);
}

/** 自選捨棄結算：選中的手牌進棄牌區 */
function finishDiscardChoice(state: GameState, pending: PendingChoice): void {
  const side = state.sides[pending.seat];
  for (const targetIid of pending.selected) {
    const idx = side.hand.findIndex((c) => c.iid === targetIid);
    if (idx >= 0) {
      const c = side.hand.splice(idx, 1)[0];
      side.discard.push(c);
      log(state, pending.seat, `${seatLabel(pending.seat)}捨棄手牌「${nameOf(c)}」。`, 'info');
    }
  }
  advancePending(state);
}

/** 對手棄牌區的卡放到對手怒氣區底 */
function finishOppDiscardToAngerChoice(state: GameState, pending: PendingChoice): void {
  const oppSeat = OTHER_SEAT[pending.seat];
  const opp = state.sides[oppSeat];
  for (const targetIid of pending.selected) {
    const idx = opp.discard.findIndex((c) => c.iid === targetIid);
    if (idx >= 0) {
      const c = opp.discard.splice(idx, 1)[0];
      opp.anger.unshift(c);
      log(state, oppSeat, `【${pending.source ?? ''}】${seatLabel(oppSeat)}棄牌區的「${nameOf(c)}」被放到怒氣區底。`, 'combat');
    }
  }
  advancePending(state);
}

/** 檢索結算：選中的進手牌，其餘依設定進棄牌區或放回牌組頂 */
function finishSearchChoice(state: GameState, pending: PendingChoice): void {
  const side = state.sides[pending.seat];

  const picked = pending.candidates.filter((c) => pending.selected.includes(c.iid));
  const rest = pending.candidates.filter((c) => !pending.selected.includes(c.iid));

  side.hand.push(...picked);
  if (pending.rest === 'deckTop') side.deck.unshift(...rest);
  else side.discard.push(...rest);

  advancePending(state);
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

  // 若另一座位的生命區尚未設定（例如連線模式），輪到另一方設定
  const otherSeat: Seat = pending.seat === 'player' ? 'npc' : 'player';
  if (state.sides[otherSeat].life.length === 0) {
    state.pending = {
      kind: 'lifeSetup',
      seat: otherSeat,
      prompt: `從手牌選擇 ${RULES.lifeCount} 張覆蓋到生命區`,
      candidates: [...state.sides[otherSeat].hand],
      pick: RULES.lifeCount,
      selected: [],
    };
    log(state, otherSeat, `輪到${seatLabel(otherSeat)}從手牌選擇 ${RULES.lifeCount} 張卡作為生命區。`, 'system');
    return;
  }

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

  const activeSide = state.sides[seat];
  // 正常情況戰鬥開始時就移進戰鬥了；保險起見，招式區殘留的卡送去該去的地方而不是直接消失
  for (const c of activeSide.techniqueZone) routeCardAfterPlay(state, seat, c);
  activeSide.techniqueZone = [];
  activeSide.chantsUsedThisTurn = 0;
  activeSide.freeNextCards = [];
  activeSide.immuneTrickSecretNextTurn = false;
  state.eventExpiredThisTurn = false;

  // 重置階段：我方橫置的生命卡與裝備復原
  expireBuffs(state, seat, 'turnStart');
  readyAllLife(state, seat);
  readyAllEquipment(state, seat);

  // 氣功冷卻區推進
  tickCooldowns(state, seat);

  log(state, null, `── 第 ${state.turn} 回合：${seatLabel(seat)}的回合 ──`, 'system');

  // 任務牌在自己的回合開始時翻開（若當前沒有任務且任務牌組有牌）
  if (!activeSide.currentQuest && activeSide.questDeck.length > 0) {
    revealNextQuest(state, seat);
  }

  // 抽牌階段
  state.phase = 'draw';
  const n = RULES.drawPerTurn + modifier(state, seat, 'drawCount');
  const drawn = draw(state, seat, n);
  log(state, seat, `${seatLabel(seat)}在抽牌階段抽了 ${drawn} 張牌。`, 'info');

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
      `${seatLabel(seat)}發動爆發：將牌組頂 ${milled} 張送入棄牌區，抽了 ${drawn} 張牌。`,
      'info',
    );
    if (state.winner) return { ok: true };
  } else {
    log(state, seat, `${seatLabel(seat)}在爆發階段選擇跳過。`, 'info');
  }

  state.phase = 'main';
  void side;
  return { ok: true };
}

// ─────────────────────────────────────────────
// 主要階段
// ─────────────────────────────────────────────

/** 主要階段的共同檢查：遊戲進行中、主要階段、輪到這一方 */
function mainPhaseGate(state: GameState, seat: Seat): PlayResult | null {
  if (state.winner) return { ok: false, reason: '遊戲已經結束' };
  if (state.phase !== 'main') return { ok: false, reason: '現在不是主要階段' };
  if (state.activeSeat !== seat) return { ok: false, reason: '不是你的回合' };
  return null;
}

/** 對手的「打老婆吊嘎」這類效果：我方打出事件時要多付的代價是否生效 */
function eventTaxedBy(state: GameState, seat: Seat): CardDef | null {
  const oppSeat = OTHER_SEAT[seat];
  for (const eq of state.sides[oppSeat].equipment) {
    const def = card(eq.defId);
    if (def.opponentEventTax && checkCondition(state, oppSeat, def.opponentEventTax)) return def;
  }
  return null;
}

/**
 * 這張手牌現在能不能在主要階段打出（裝備／行動／事件／任務）。
 * UI 用來反灰與提示，playCard 也用同一套檢查，兩邊不會不一致。
 */
export function cardPlayability(state: GameState, seat: Seat, iid: number): PlayResult {
  const gate = mainPhaseGate(state, seat);
  if (gate) return gate;

  const side = state.sides[seat];
  const inst = side.hand.find((c) => c.iid === iid);
  if (!inst) return { ok: false, reason: '手牌中沒有這張卡' };

  const def = card(inst.defId);

  if (def.kind === 'technique') {
    return { ok: false, reason: '招式卡只能在戰鬥階段出招，或於主要階段進行詠唱' };
  }

  if (!canPlayWithCooldown(state, seat, inst.defId)) {
    return { ok: false, reason: '冷卻區已有同名卡，達到儲存上限' };
  }

  if (def.kind === 'event') {
    if (side.eventsUsedThisTurn >= RULES.eventsPerTurn) {
      return { ok: false, reason: `每回合最多使用 ${RULES.eventsPerTurn} 張事件卡` };
    }
    const tax = eventTaxedBy(state, seat);
    if (tax && side.hand.length < 2) {
      return { ok: false, reason: `對手的「${tax.name}」：打出事件需額外選 1 張手牌放到怒氣區底` };
    }
  }

  if (def.kind === 'equipment') {
    const blocked = equipBlockReason(state, seat, def);
    if (blocked) return { ok: false, reason: blocked };
  }

  if (def.playCondition && !checkCondition(state, seat, def.playCondition)) {
    return { ok: false, reason: '打出條件尚未滿足' };
  }

  const cost = computeCost(state, seat, def);
  if (side.life.filter((l) => !l.tapped).length < cost.life) {
    return { ok: false, reason: `需要橫置 ${cost.life} 張生命卡，目前不足` };
  }
  if (side.anger.length < cost.anger) {
    return { ok: false, reason: `需要捨棄怒氣區 ${cost.anger} 張卡，目前不足` };
  }

  return { ok: true };
}

export function playCard(state: GameState, seat: Seat, iid: number): PlayResult {
  const check = cardPlayability(state, seat, iid);
  if (!check.ok) return check;

  const side = state.sides[seat];
  const inst = side.hand.find((c) => c.iid === iid)!;
  const def = card(inst.defId);

  // ── 所有檢查通過，開始結算 ──
  const cost = computeCost(state, seat, def);
  const freeIdx = side.freeNextCards.indexOf(def.id);
  if (freeIdx >= 0) {
    side.freeNextCards.splice(freeIdx, 1);
    log(state, seat, `【拋下狠話】生效：「${def.name}」免費用。`, 'info');
  } else {
    consumeOnceCostBuffs(state, seat, def);
  }
  if (cost.life > 0) {
    payLifeCost(state, seat, cost.life);
    log(state, seat, `${seatLabel(seat)}橫置了 ${cost.life} 張生命卡支付費用。`, 'info');
  }
  if (cost.anger > 0) {
    payAngerCost(state, seat, cost.anger);
    log(state, seat, `${seatLabel(seat)}捨棄怒氣區 ${cost.anger} 張卡作為費用代價。`, 'info');
  }

  side.hand.splice(
    side.hand.findIndex((c) => c.iid === iid),
    1,
  );
  side.stats.playKind[def.kind] += 1;

  switch (def.kind) {
    case 'equipment':
      equipCard(state, seat, inst);
      break;

    case 'action':
      log(state, seat, `${seatLabel(seat)}使用了行動卡「${def.name}」。`, 'info');
      applyEffects(state, seat, def.effects, def.name, { sourceIid: inst.iid });
      routeCardAfterPlay(state, seat, inst);
      break;

    case 'event': {
      side.eventsUsedThisTurn += 1;
      log(state, seat, `${seatLabel(seat)}使用了事件卡「${def.name}」。`, 'info');

      const tax = eventTaxedBy(state, seat);
      if (tax) applyEffect(state, OTHER_SEAT[seat], { type: 'forceOpponentHandToAnger' }, tax.name);

      applyEffects(state, seat, def.effects, def.name, { sourceIid: inst.iid });
      placeEvent(state, seat, inst);

      // 金項鍊：我方打出事件時重置
      for (const eq of side.equipment) {
        if (card(eq.defId).untapOnOwnEvent && side.tappedEquipment.includes(eq.iid)) {
          side.tappedEquipment = side.tappedEquipment.filter((x) => x !== eq.iid);
          log(state, seat, `「${nameOf(eq)}」因打出事件而重置。`, 'info');
        }
      }
      break;
    }

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

/** 這張手牌現在能不能詠唱 */
export function chantPlayability(state: GameState, seat: Seat, iid: number): PlayResult {
  const gate = mainPhaseGate(state, seat);
  if (gate) return gate;

  const side = state.sides[seat];
  if (chantsLeft(state, seat, RULES.chantsPerTurn) <= 0) {
    return { ok: false, reason: '本回合的詠唱次數已用完' };
  }

  const inst = side.hand.find((c) => c.iid === iid);
  if (!inst) return { ok: false, reason: '手牌中沒有這張卡' };

  const def = card(inst.defId);
  if (!def.chant) return { ok: false, reason: '這張卡沒有詠唱特性' };

  if (!canPlayWithCooldown(state, seat, inst.defId)) {
    return { ok: false, reason: '冷卻區已有同名卡，達到儲存上限' };
  }

  const cost = chantCost(state, seat, def);
  if (chantResources(state, seat) < cost) {
    return { ok: false, reason: `需要支付 ${cost} 點詠唱費用，目前不足` };
  }
  return { ok: true };
}

/** 詠唱招式：主要階段支付詠唱費用，結算詠唱效果後直接放到招式區，戰鬥時作為額外出招 */
export function chantTechnique(state: GameState, seat: Seat, iid: number): PlayResult {
  const check = chantPlayability(state, seat, iid);
  if (!check.ok) return check;

  const side = state.sides[seat];
  const inst = side.hand.find((c) => c.iid === iid)!;
  const def = card(inst.defId);

  payChantCost(state, seat, chantCost(state, seat, def));
  side.hand.splice(
    side.hand.findIndex((c) => c.iid === iid),
    1,
  );
  side.chantsUsedThisTurn += 1;
  performChant(state, seat, inst, '手牌');

  evaluateAllQuests(state);
  return { ok: true };
}

/** 這張裝備現在能不能發動（主要階段橫置發動的能力） */
export function activationPlayability(state: GameState, seat: Seat, iid: number): PlayResult {
  const gate = mainPhaseGate(state, seat);
  if (gate) return gate;

  const side = state.sides[seat];
  const inst = side.equipment.find((c) => c.iid === iid);
  if (!inst) return { ok: false, reason: '裝備區沒有這張卡' };

  const act = card(inst.defId).activate;
  if (!act) return { ok: false, reason: '這張裝備沒有可發動的能力' };
  if (side.tappedEquipment.includes(iid)) return { ok: false, reason: '這張裝備已經橫置' };

  const lifeCost = act.lifeCost ?? 0;
  if (side.life.filter((l) => !l.tapped).length < lifeCost) {
    return { ok: false, reason: `需要橫置 ${lifeCost} 張生命卡，目前不足` };
  }
  return { ok: true };
}

/** 發動裝備能力：支付費用、橫置這張裝備，然後結算效果 */
export function activateEquipment(state: GameState, seat: Seat, iid: number): PlayResult {
  const check = activationPlayability(state, seat, iid);
  if (!check.ok) return check;

  const inst = state.sides[seat].equipment.find((c) => c.iid === iid)!;
  const def = card(inst.defId);
  const act = def.activate!;

  if (act.lifeCost) {
    payLifeCost(state, seat, act.lifeCost);
    log(state, seat, `${seatLabel(seat)}橫置了 ${act.lifeCost} 張生命卡發動「${def.name}」。`, 'info');
  }
  log(state, seat, `${seatLabel(seat)}發動裝備「${def.name}」。`, 'info');
  tapEquipment(state, seat, iid);
  applyEffects(state, seat, act.effects, def.name, { sourceIid: iid });

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
  resolveTurnEnd(state, seat);
  if (state.winner) return;
  expireBuffs(state, seat, 'turnEnd');

  beginTurn(state, OTHER_SEAT[seat]);
}

/**
 * 回合結束時的共同處理：
 *   - 「對手回合結束時」離場的裝備（藥膏貼布）放到持有者的怒氣區底
 *   - 事件區的事件放 1 個持續時間指示物（到期就捨棄）
 */
function resolveTurnEnd(state: GameState, seat: Seat): void {
  const other = OTHER_SEAT[seat];
  for (const eq of [...state.sides[other].equipment]) {
    if (card(eq.defId).leavesAtOpponentTurnEnd) {
      removeEquipment(state, other, eq.iid, 'angerBottom');
      log(state, other, `對手回合結束，${seatLabel(other)}的「${nameOf(eq)}」放到怒氣區底。`, 'info');
    }
  }
  tickEventZone(state);
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

  resolveTurnEnd(state, state.activeSeat);
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
