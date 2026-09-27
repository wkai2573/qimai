/**
 * 《氣脈》— 效果結算、事件區、裝備橫置與詠唱
 *
 * 卡片的所有「效果」都在 applyEffect 裡結算，條件判定在 conditions.ts。
 * 新增卡片時若只用既有 Effect 型別，這裡完全不必改。
 */

import { card } from './cards';
import { checkCondition, matchFilter } from './conditions';
import {
  addBuff,
  chantCost,
  chantsLeft,
  discardFromAnger,
  draw,
  isHumanSeat,
  log,
  millToAngerCards,
  millToDiscard,
  modifier,
  modifierFor,
  nameOf,
  payLifeCost,
  pushPending,
  recover,
  recoverCards,
  routeCardAfterPlay,
  seatLabel,
  untappedEquipment,
  withRng,
} from './internal';
import type {
  CardDef,
  CardFilter,
  CardInstance,
  CombatPlay,
  Effect,
  GameState,
  Seat,
} from './types';
import { EQUIP_LABEL, EQUIP_LIMITS, OTHER_SEAT, RULES } from './types';

export { checkCondition, matchFilter };

/** 效果結算時的額外脈絡 */
export interface EffectContext {
  /** 發動效果的那張實體卡（裝備增益靠它在離場時移除；「此回合其他…」靠它排除自己） */
  sourceIid?: number;
  /** 戰鬥中打出的這一擊：「此卡傷害 +X」直接加在這裡 */
  play?: CombatPlay;
  /** 離開事件區時這張卡上的指示物數 */
  leavingCounters?: number;
}

// ─────────────────────────────────────────────
// 篩選與 AI 評估
// ─────────────────────────────────────────────

function filterCards(insts: readonly CardInstance[], filter?: CardFilter): CardInstance[] {
  return insts.filter((c) => matchFilter(card(c.defId), filter));
}

/** AI 用的粗略卡片價值：要丟牌時丟價值最低的 */
export function aiCardValue(def: CardDef): number {
  if (def.kind === 'technique') {
    const tierBonus = def.tier === 'hidden' ? 6 : def.tier === 'ultimate' ? 4 : def.tier === 'secret' ? 2 : 0;
    return 10 + (def.damage ?? 0) * 2 + tierBonus;
  }
  if (def.kind === 'equipment') return 8;
  if (def.kind === 'event') return 6;
  if (def.kind === 'action') return 5;
  return 1;
}

function lowestValue(insts: readonly CardInstance[], n: number): CardInstance[] {
  return [...insts].sort((a, b) => aiCardValue(card(a.defId)) - aiCardValue(card(b.defId))).slice(0, n);
}

function highestValue(insts: readonly CardInstance[], n: number): CardInstance[] {
  return [...insts].sort((a, b) => aiCardValue(card(b.defId)) - aiCardValue(card(a.defId))).slice(0, n);
}

function removeFrom(list: CardInstance[], iid: number): CardInstance | null {
  const idx = list.findIndex((c) => c.iid === iid);
  return idx >= 0 ? list.splice(idx, 1)[0] : null;
}

// ─────────────────────────────────────────────
// 事件區
// ─────────────────────────────────────────────

/**
 * 事件打出並結算完即時效果後，放進事件區。
 * 事件區只能有 1 張：原本的事件先回到它持有者的棄牌區。
 */
export function placeEvent(state: GameState, seat: Seat, inst: CardInstance): void {
  if (state.eventZone) {
    log(state, state.eventZone.owner, `事件區的「${nameOf(state.eventZone.card)}」被取代，回到持有者的棄牌區。`, 'info');
    leaveEventZone(state);
  }
  state.eventZone = { card: inst, owner: seat, counters: 0 };
  const dur = card(inst.defId).duration;
  log(state, seat, `「${nameOf(inst)}」進入事件區${dur !== undefined ? `（持續時間 ${dur}）` : ''}。`, 'info');
}

/**
 * 在事件區的事件放置 N 個持續時間指示物。
 * 秘法帽會跟著放相同數量；秘法法袍會把秘法力場的指示物改放到自己身上。
 * 指示物達到持續時間就捨棄。
 */
export function addEventCounters(state: GameState, n: number, reason: string): void {
  const ev = state.eventZone;
  if (!ev || n <= 0) return;
  const owner = state.sides[ev.owner];

  for (const eq of owner.equipment) {
    if (card(eq.defId).counterShield?.mirrorOwnEvent) {
      owner.equipCounters[eq.iid] = (owner.equipCounters[eq.iid] ?? 0) + n;
      log(state, ev.owner, `「${nameOf(eq)}」也放置了 ${n} 個指示物（共 ${owner.equipCounters[eq.iid]}）。`, 'info');
    }
  }

  const robe = owner.equipment.find((eq) => card(eq.defId).counterShield?.redirectFromEvent === ev.card.defId);
  if (robe) {
    owner.equipCounters[robe.iid] = (owner.equipCounters[robe.iid] ?? 0) + n;
    log(state, ev.owner, `${reason}：原本要放在「${nameOf(ev.card)}」的 ${n} 個指示物改放到「${nameOf(robe)}」（共 ${owner.equipCounters[robe.iid]}）。`, 'info');
    return;
  }

  ev.counters += n;
  log(state, ev.owner, `${reason}：事件「${nameOf(ev.card)}」放置 ${n} 個持續時間指示物（共 ${ev.counters}）。`, 'info');

  const dur = card(ev.card.defId).duration;
  if (dur !== undefined && ev.counters >= dur) {
    state.eventExpiredThisTurn = true;
    log(state, ev.owner, `事件「${nameOf(ev.card)}」持續時間到（${ev.counters}/${dur}），被捨棄。`, 'info');
    leaveEventZone(state);
  }
}

/** 事件離開事件區：回到持有者的棄牌區（冷卻事件進冷卻區），並結算離場效果 */
function leaveEventZone(state: GameState): void {
  const ev = state.eventZone;
  if (!ev) return;
  state.eventZone = null;

  const def = card(ev.card.defId);
  routeCardAfterPlay(state, ev.owner, ev.card);
  applyEffects(state, ev.owner, def.onLeave, def.name, { leavingCounters: ev.counters });
}

/** 雙方回合結束時：事件區的事件放 1 個持續時間指示物 */
export function tickEventZone(state: GameState): void {
  if (state.eventZone) addEventCounters(state, 1, '回合結束');
}

/** 我方卡片上的持續時間指示物總數（我方事件 + 我方裝備） */
function ownCounters(state: GameState, seat: Seat): number {
  const ev = state.eventZone;
  const fromEvent = ev && ev.owner === seat ? ev.counters : 0;
  const fromEquip = Object.values(state.sides[seat].equipCounters).reduce((sum, n) => sum + n, 0);
  return fromEvent + fromEquip;
}

// ─────────────────────────────────────────────
// 裝備
// ─────────────────────────────────────────────

/** 這張裝備現在不能打出的原因；可以打出時回傳 null */
export function equipBlockReason(state: GameState, seat: Seat, def: CardDef): string | null {
  const side = state.sides[seat];
  const slot = def.slot;
  const req = def.levelRequirement ?? 1;
  if (!slot) return '裝備卡缺少部位資訊';
  if (side.level < req) return `需要等級 ${req} 才能使用（目前 ${side.level}）`;

  const used = side.equipment.filter((c) => card(c.defId).slot === slot).length;
  if (used >= EQUIP_LIMITS[slot]) return `${EQUIP_LABEL[slot]}欄位已滿（上限 ${EQUIP_LIMITS[slot]} 張）`;
  return null;
}

/** 把卡放進裝備區並結算它的效果（增益會記住來源，離場時一併移除） */
export function equipCard(state: GameState, seat: Seat, inst: CardInstance): void {
  const def = card(inst.defId);
  state.sides[seat].equipment.push(inst);
  log(state, seat, `${seatLabel(seat)}裝備了「${def.name}」（${EQUIP_LABEL[def.slot ?? 'weapon']}）。`, 'info');
  applyEffects(state, seat, def.effects, def.name, { sourceIid: inst.iid });
}

/** 從手牌免費打出一張裝備 */
export function equipFromHand(state: GameState, seat: Seat, iid: number, sourceName: string): boolean {
  const side = state.sides[seat];
  const inst = side.hand.find((c) => c.iid === iid);
  if (!inst || equipBlockReason(state, seat, card(inst.defId))) return false;

  removeFrom(side.hand, iid);
  side.stats.playKind.equipment += 1;
  log(state, seat, `${sourceName}：${seatLabel(seat)}不支付費用打出「${nameOf(inst)}」。`, 'info');
  equipCard(state, seat, inst);
  return true;
}

/**
 * 橫置一張裝備，並結算橫置觸發：這張卡自己的（金項鍊）與「我方裝備橫置時」的（夾腳拖鞋）。
 */
export function tapEquipment(state: GameState, seat: Seat, iid: number): boolean {
  const side = state.sides[seat];
  const inst = side.equipment.find((c) => c.iid === iid);
  if (!inst || side.tappedEquipment.includes(iid)) return false;

  side.tappedEquipment.push(iid);
  const def = card(inst.defId);
  log(state, seat, `${seatLabel(seat)}橫置了裝備「${def.name}」。`, 'info');

  applyEffects(state, seat, def.onSelfTap, def.name, { sourceIid: iid });
  for (const eq of [...side.equipment]) {
    const d = card(eq.defId);
    if (d.onEquipmentTap) applyEffects(state, seat, d.onEquipmentTap, d.name, { sourceIid: eq.iid });
  }
  return true;
}

/** 自動挑要橫置的裝備：有橫置好處的優先，其次是沒有發動能力的 */
function pickEquipmentToTap(state: GameState, seat: Seat, n: number): CardInstance[] {
  const score = (c: CardInstance): number => {
    const d = card(c.defId);
    if (d.onSelfTap) return 0;
    if (!d.activate) return 1;
    return 2;
  };
  return [...untappedEquipment(state, seat)].sort((a, b) => score(a) - score(b)).slice(0, n);
}

// ─────────────────────────────────────────────
// 詠唱
// ─────────────────────────────────────────────

/** 可用來支付詠唱費用的資源數：未橫置生命卡（+ 賢者法袍：未橫置裝備） */
export function chantResources(state: GameState, seat: Seat): number {
  const side = state.sides[seat];
  const life = side.life.filter((l) => !l.tapped).length;
  const robe = side.equipment.some((c) => card(c.defId).chantPayWithEquipment);
  return life + (robe ? untappedEquipment(state, seat).length : 0);
}

/** 支付詠唱費用：有賢者法袍時先橫置裝備（沒有發動能力的優先），不足再橫置生命卡 */
export function payChantCost(state: GameState, seat: Seat, cost: number): boolean {
  if (cost <= 0) return true;
  if (chantResources(state, seat) < cost) return false;

  const side = state.sides[seat];
  let remaining = cost;
  if (side.equipment.some((c) => card(c.defId).chantPayWithEquipment)) {
    for (const eq of pickEquipmentToTap(state, seat, remaining)) {
      if (tapEquipment(state, seat, eq.iid)) remaining--;
    }
  }
  if (remaining > 0) payLifeCost(state, seat, remaining);
  log(state, seat, `${seatLabel(seat)}支付了 ${cost} 點詠唱費用。`, 'info');
  return true;
}

/** 「此卡傷害 +X」的 X（含條件成立時的額外加成），供獲得詠唱效果的卡計算 */
export function chantBonusOf(state: GameState, seat: Seat, def: CardDef): number {
  if (!def.chant) return 0;
  let bonus = def.chant.bonus ?? def.chant.damage ?? 0;
  const cb = def.chant.conditionalBonus;
  if (cb && checkCondition(state, seat, cb.when)) bonus += cb.damage;
  return bonus;
}

/** 詠唱卡在戰鬥開場引爆的傷害 */
export function chantDetonationDamage(state: GameState, seat: Seat, inst: CardInstance): number {
  const def = card(inst.defId);
  let damage = (def.chant?.damage ?? 0) + modifier(state, seat, 'chantDamage');
  // 「名稱含火的招式 +2」這類只加成特定卡的增益，也作用在詠唱引爆上
  damage += modifierFor(state, seat, 'techniqueDamage', def, inst.iid) - modifier(state, seat, 'techniqueDamage');
  const cb = def.chant?.conditionalBonus;
  if (cb && checkCondition(state, seat, cb.when)) damage += cb.damage;
  return Math.max(0, damage);
}

/** 詠唱完成時的共同處理：詠唱次數 +1，秘法力場放指示物 */
export function onChanted(state: GameState, seat: Seat, def: CardDef): void {
  state.sides[seat].stats.chants += 1;
  const ev = state.eventZone;
  if (ev && ev.owner === seat && card(ev.card.defId).countersOnChant && def.guard > 0) {
    addEventCounters(state, def.guard, `詠唱「${def.name}」`);
  }
}

/**
 * 把一張已付完費用的卡詠唱打出：放進詠唱區，結算卡片效果與詠唱效果。
 * 呼叫方負責支付費用與扣詠唱次數。
 */
export function performChant(state: GameState, seat: Seat, inst: CardInstance, from: '手牌' | '棄牌區'): void {
  const side = state.sides[seat];
  const def = card(inst.defId);

  side.chantedCards.push(inst);
  side.stats.playKind[def.kind] += 1;
  if (def.tier) side.stats.playTier[def.tier] += 1;
  side.stats.techPlayed.push(def.id);

  log(state, seat, `${seatLabel(seat)}從${from}詠唱了「${def.name}」（${def.chant?.text ?? ''}）。`, 'combat');

  applyEffects(state, seat, def.effects, def.name, { sourceIid: inst.iid });
  applyEffects(state, seat, def.chant?.effects, def.name, { sourceIid: inst.iid });
  onChanted(state, seat, def);
}

/** 棄牌區中現在可以詠唱的卡 */
function chantableInDiscard(state: GameState, seat: Seat): CardInstance[] {
  const resources = chantResources(state, seat);
  return state.sides[seat].discard.filter((c) => {
    const def = card(c.defId);
    return !!def.chant && chantCost(state, seat, def) <= resources;
  });
}

/** 從棄牌區詠唱指定的卡（快速冷卻）：一樣要付詠唱費用，也佔用本回合詠唱次數 */
export function chantFromDiscard(state: GameState, seat: Seat, iid: number): boolean {
  const side = state.sides[seat];
  const inst = side.discard.find((c) => c.iid === iid);
  if (!inst) return false;
  const def = card(inst.defId);
  if (!def.chant) return false;

  if (chantsLeft(state, seat, RULES.chantsPerTurn) <= 0) {
    log(state, seat, `${seatLabel(seat)}本回合的詠唱次數已用完，無法詠唱「${def.name}」。`, 'info');
    return false;
  }
  if (!payChantCost(state, seat, chantCost(state, seat, def))) {
    log(state, seat, `${seatLabel(seat)}無法支付「${def.name}」的詠唱費用。`, 'info');
    return false;
  }
  removeFrom(side.discard, iid);
  side.chantsUsedThisTurn += 1;
  performChant(state, seat, inst, '棄牌區');
  return true;
}

/** 獲得指定招式的詠唱效果：結算它們的詠唱效果，回傳傷害加成總和 */
function gainChantsOf(state: GameState, seat: Seat, defs: readonly CardDef[], sourceName: string, ctx: EffectContext): number {
  let bonus = 0;
  for (const d of defs) {
    if (!d.chant) continue;
    bonus += chantBonusOf(state, seat, d);
    applyEffects(state, seat, d.chant.effects, sourceName, ctx);
  }
  return bonus;
}

// ─────────────────────────────────────────────
// 常用的「選擇」：真人跳出選擇，AI 直接決定
// ─────────────────────────────────────────────

/** 自選 N 張手牌放到自己的怒氣區底 */
function chooseHandToAnger(state: GameState, seat: Seat, n: number, sourceName: string): void {
  const side = state.sides[seat];
  if (side.hand.length === 0 || n <= 0) return;

  if (isHumanSeat(state, seat)) {
    const pick = Math.min(n, side.hand.length);
    pushPending(state, {
      kind: 'handToAnger',
      seat,
      prompt: `【${sourceName}】請選擇 ${pick} 張手牌置於你的怒氣區底`,
      candidates: [...side.hand],
      pick,
      selected: [],
      source: sourceName,
    });
    log(state, seat, `【${sourceName}】${seatLabel(seat)}要選擇 ${pick} 張手牌置於怒氣區底。`, 'system');
    return;
  }

  for (const c of lowestValue(side.hand, n)) {
    removeFrom(side.hand, c.iid);
    side.anger.unshift(c);
    log(state, seat, `【${sourceName}】${seatLabel(seat)}將手牌「${nameOf(c)}」置入怒氣區底。`, 'combat');
  }
}

/** 自選捨棄 N 張手牌 */
function chooseDiscard(state: GameState, seat: Seat, n: number, sourceName: string): void {
  const side = state.sides[seat];
  if (side.hand.length === 0 || n <= 0) return;

  if (isHumanSeat(state, seat)) {
    const pick = Math.min(n, side.hand.length);
    pushPending(state, {
      kind: 'discardFromHand',
      seat,
      prompt: `【${sourceName}】請選擇 ${pick} 張手牌捨棄`,
      candidates: [...side.hand],
      pick,
      selected: [],
      source: sourceName,
    });
    return;
  }

  for (const c of lowestValue(side.hand, n)) {
    removeFrom(side.hand, c.iid);
    side.discard.push(c);
    log(state, seat, `${seatLabel(seat)}因「${sourceName}」捨棄手牌「${nameOf(c)}」。`, 'info');
  }
}

// ─────────────────────────────────────────────
// 效果結算
// ─────────────────────────────────────────────

/**
 * 結算一個效果。sourceName 用於在增益上標記來源卡名，方便 UI 顯示。
 * 會遞迴處理 conditional 效果。
 */
export function applyEffect(state: GameState, seat: Seat, effect: Effect, sourceName: string, ctx: EffectContext = {}): void {
  const side = state.sides[seat];
  const oppSeat: Seat = OTHER_SEAT[seat];
  const opp = state.sides[oppSeat];

  switch (effect.type) {
    case 'draw': {
      const d = draw(state, seat, effect.n);
      log(state, seat, `${seatLabel(seat)}因「${sourceName}」效果抽了 ${d} 張牌。`, 'info');
      break;
    }

    case 'mill': {
      const { count: m, cards: milled } = millToAngerCards(state, seat, effect.n);
      const cardList = milled.length > 0 ? `（${milled.map(nameOf).join('、')}）` : '';
      log(state, seat, `${seatLabel(seat)}因「${sourceName}」效果自損，牌組頂 ${m} 張卡進入怒氣區${cardList}。`, 'info');
      break;
    }

    case 'millDiscard': {
      const m = millToDiscard(state, seat, effect.n);
      log(state, seat, `${seatLabel(seat)}因「${sourceName}」捨棄牌組頂 ${m} 張卡。`, 'info');
      break;
    }

    case 'recover': {
      const { count: r, cards: recovered } = recoverCards(state, seat, effect.n);
      const cardList = recovered.length > 0 ? `（${recovered.map(nameOf).join('、')}）` : '';
      log(state, seat, `${seatLabel(seat)}因「${sourceName}」效果調息回復，將怒氣區 ${r} 張卡${cardList}放回牌組頂。`, 'info');
      break;
    }

    case 'salvage': {
      const pool = filterCards(side.discard, effect.filter);
      if (pool.length === 0 || effect.n <= 0) {
        log(state, seat, `${seatLabel(seat)}發動「${sourceName}」，但棄牌區沒有符合條件的卡牌。`, 'info');
        break;
      }

      const pick = Math.min(effect.n, pool.length);
      if (isHumanSeat(state, seat)) {
        pushPending(state, {
          kind: 'salvage',
          seat,
          prompt: `${sourceName}：從棄牌區選擇 ${pick} 張加入手牌`,
          candidates: pool,
          pick,
          selected: [],
          source: sourceName,
        });
        log(state, seat, `${seatLabel(seat)}發動「${sourceName}」，請選擇要取回的卡。`, 'info');
      } else {
        for (const c of highestValue(pool, pick)) {
          if (removeFrom(side.discard, c.iid)) {
            side.hand.push(c);
            log(state, seat, `${seatLabel(seat)}因「${sourceName}」從棄牌區取回「${nameOf(c)}」。`, 'info');
          }
        }
      }
      break;
    }

    case 'salvageByCounters': {
      const n = ctx.leavingCounters ?? 0;
      log(state, seat, `「${sourceName}」離開事件區：上面有 ${n} 個指示物。`, 'info');
      if (n > 0) applyEffect(state, seat, { type: 'salvage', n, filter: effect.filter }, sourceName, ctx);
      break;
    }

    case 'search': {
      const looked = side.deck.splice(0, effect.look);
      if (looked.length === 0) break;

      const pick = Math.min(effect.pick, looked.length);

      // 玩家自己挑：暫停遊戲，等 UI 把選擇結果送回來
      if (seat === 'player') {
        pushPending(state, {
          kind: 'search',
          seat,
          prompt: `${sourceName}：從牌組頂 ${looked.length} 張中選 ${pick} 張加入手牌`,
          candidates: looked,
          pick,
          selected: [],
          source: sourceName,
        });
        log(state, seat, `${seatLabel(seat)}發動「${sourceName}」檢索，請選擇要加入手牌的卡。`, 'info');
      } else {
        // NPC 自動挑
        const candidates = filterCards(looked, effect.filter);
        const pool = candidates.length > 0 ? candidates : looked;
        const picked = pool.slice(0, pick);
        const pickedIds = new Set(picked.map((c) => c.iid));
        const rest = looked.filter((c) => !pickedIds.has(c.iid));

        side.hand.push(...picked);
        side.discard.push(...rest);
        log(state, seat, `${seatLabel(seat)}發動「${sourceName}」檢索，取得「${picked.map(nameOf).join('、')}」。`, 'info');
      }
      break;
    }

    case 'discardHand': {
      const removedCards: CardInstance[] = [];
      for (let i = 0; i < effect.n && side.hand.length > 0; i++) {
        const idx = withRng(state, (rng) => rng.int(side.hand.length));
        const removed = side.hand.splice(idx, 1)[0];
        side.discard.push(removed);
        removedCards.push(removed);
      }
      if (removedCards.length > 0) {
        log(
          state,
          seat,
          `${seatLabel(seat)}因「${sourceName}」捨棄 ${removedCards.length} 張手牌（${removedCards.map(nameOf).join('、')}）。`,
          'info',
        );
      }
      break;
    }

    case 'discardChosen':
      chooseDiscard(state, seat, effect.n, sourceName);
      break;

    case 'discardAllHand': {
      const n = side.hand.length;
      side.discard.push(...side.hand.splice(0));
      log(state, seat, `${seatLabel(seat)}因「${sourceName}」捨棄全部 ${n} 張手牌。`, 'info');
      break;
    }

    case 'discardToSalvage': {
      if (side.hand.length === 0) break;
      const salvage: Effect = { type: 'salvage', n: 1, filter: effect.filter };

      if (isHumanSeat(state, seat)) {
        pushPending(state, {
          kind: 'discardFromHand',
          seat,
          prompt: `【${sourceName}】可以捨棄 1 張手牌，從棄牌區取回 1 張符合條件的卡`,
          candidates: [...side.hand],
          pick: 1,
          selected: [],
          alt: { label: '不發動' },
          then: [salvage],
          source: sourceName,
        });
        break;
      }

      // AI：棄牌區有值得拿的卡才發動
      if (filterCards(side.discard, effect.filter).length > 0) {
        chooseDiscard(state, seat, 1, sourceName);
        applyEffect(state, seat, salvage, sourceName, ctx);
      }
      break;
    }

    case 'angerToHandThenDiscard': {
      const taken: CardInstance[] = [];
      for (let i = 0; i < effect.n; i++) {
        const c = side.anger.pop();
        if (!c) break;
        side.hand.push(c);
        taken.push(c);
      }
      log(state, seat, `${seatLabel(seat)}因「${sourceName}」從怒氣區取 ${taken.length} 張卡加入手牌。`, 'info');
      chooseDiscard(state, seat, effect.n, sourceName);
      break;
    }

    case 'discardAnger': {
      const n = effect.n === 'all' ? side.anger.length : effect.n;
      const moved = discardFromAnger(state, seat, n);
      log(state, seat, `${seatLabel(seat)}因「${sourceName}」捨棄怒氣區 ${moved} 張卡。`, 'info');
      break;
    }

    case 'discardToAnger': {
      const moved = side.discard.splice(Math.max(0, side.discard.length - effect.n));
      side.anger.push(...moved);
      side.anger = withRng(state, (rng) => rng.shuffle(side.anger));
      log(state, seat, `${seatLabel(seat)}因「${sourceName}」將棄牌區 ${moved.length} 張卡放到怒氣區，並將怒氣區洗牌。`, 'info');
      break;
    }

    case 'reshuffleDiscard': {
      const matched = filterCards(side.discard, effect.filter);
      const ids = new Set(matched.map((c) => c.iid));
      side.discard = side.discard.filter((c) => !ids.has(c.iid));
      side.deck.push(...matched);
      side.deck = withRng(state, (rng) => rng.shuffle(side.deck));
      const x = matched.length;
      log(state, seat, `${seatLabel(seat)}因「${sourceName}」將棄牌區 ${x} 張卡放回牌組洗牌。`, 'info');

      if (effect.then === 'recoverX' && x > 0) {
        applyEffect(state, seat, { type: 'recover', n: x }, sourceName, ctx);
      } else if (effect.then === 'boostSelf' && ctx.play) {
        ctx.play.damage += x;
        log(state, seat, `「${sourceName}」此擊傷害 +${x}。`, 'combat');
      }
      break;
    }

    case 'drawPerDiscard': {
      const count = filterCards(side.discard, effect.filter).length;
      const x = effect.max !== undefined ? Math.min(count, effect.max) : count;
      if (x > 0) applyEffect(state, seat, { type: 'draw', n: x }, sourceName, ctx);
      else log(state, seat, `「${sourceName}」：棄牌區沒有符合條件的卡，未抽牌。`, 'info');
      break;
    }

    case 'discardAngerPerDiscard': {
      const x = filterCards(side.discard, effect.filter).length;
      applyEffect(state, seat, { type: 'discardAnger', n: x }, sourceName, ctx);
      break;
    }

    case 'modify':
      addBuff(
        side,
        {
          source: sourceName,
          target: effect.target,
          amount: effect.amount,
          expiry: effect.expiry,
          filter: effect.filter,
          excludeIid: effect.excludeSelf ? ctx.sourceIid : undefined,
          condition: effect.condition,
          once: effect.once,
          sourceIid: ctx.sourceIid,
        },
        () => state.nextIid++,
      );
      log(state, seat, `${seatLabel(seat)}獲得「${sourceName}」增益：${describeModifier(effect.target)} ${signed(effect.amount)}。`, 'info');
      break;

    case 'extraGuard':
      addBuff(
        side,
        {
          source: sourceName,
          target: 'extraGuard',
          amount: effect.n,
          expiry: effect.expiry,
          sourceIid: ctx.sourceIid,
        },
        () => state.nextIid++,
      );
      log(state, seat, `${sourceName}：防禦判定額外翻開 ${effect.n} 張。`, 'info');
      break;

    case 'gainLevel':
      side.level += effect.n;
      log(state, seat, `${sourceName}：等級 +${effect.n}（目前 ${side.level}）。`, 'quest');
      break;

    case 'rageSearchTech': {
      const pool: CardInstance[] = [];
      for (let i = 0; i < effect.look && side.anger.length > 0; i++) {
        pool.push(side.anger.pop()!);
      }
      const techs = pool.filter((c) => card(c.defId).kind === 'technique');
      const rest = pool.filter((c) => card(c.defId).kind !== 'technique');
      side.hand.push(...techs);
      side.discard.push(...rest);
      log(
        state,
        seat,
        `${sourceName}：從怒氣區取得 ${techs.length} 張招式卡（${techs.map(nameOf).join('、')}），其餘 ${rest.length} 張送入棄牌區。`,
        'info',
      );
      break;
    }

    case 'recoverHandCount': {
      const cnt = side.hand.length;
      recover(state, seat, cnt);
      log(state, seat, `${sourceName}：依手牌數回復 ${cnt} 張卡至牌組頂。`, 'info');
      break;
    }

    case 'forceOpponentHandToAnger': {
      if (effect.conditionHandAtLeast && opp.hand.length < effect.conditionHandAtLeast) {
        log(state, seat, `${sourceName}：對手手牌未達 ${effect.conditionHandAtLeast} 張，未觸發。`, 'info');
        break;
      }
      chooseHandToAnger(state, oppSeat, 1, sourceName);
      break;
    }

    case 'opponentDiscardTechnique': {
      const techIndices = opp.hand
        .map((c: CardInstance, i: number) => (card(c.defId).kind === 'technique' ? i : -1))
        .filter((i: number) => i >= 0);

      if (techIndices.length > 0) {
        const pickIdx = techIndices[withRng(state, (rng) => rng.int(techIndices.length))];
        const discarded = opp.hand.splice(pickIdx, 1)[0];
        opp.discard.push(discarded);
        log(state, oppSeat, `【迫令捨棄】${seatLabel(oppSeat)}被迫捨棄招式卡「${nameOf(discarded)}」。`, 'combat');
      } else {
        log(state, oppSeat, `【展示手牌】${seatLabel(oppSeat)}手中無招式卡可捨棄。`, 'info');
      }
      break;
    }

    case 'opponentDiscardTechOrMill': {
      const techs = opp.hand.filter((c) => card(c.defId).kind === 'technique');
      const mill: Effect = { type: 'millDiscard', n: effect.mill };

      if (techs.length === 0) {
        applyEffect(state, oppSeat, mill, sourceName);
        break;
      }
      if (isHumanSeat(state, oppSeat)) {
        pushPending(state, {
          kind: 'discardFromHand',
          seat: oppSeat,
          prompt: `【${sourceName}】選擇 1 張手牌中的招式捨棄，或改為捨棄牌組頂 ${effect.mill} 張`,
          candidates: techs,
          pick: 1,
          selected: [],
          alt: { label: `改為捨棄牌組頂 ${effect.mill} 張`, effects: [mill] },
          source: sourceName,
        });
        break;
      }
      // AI：牌組還厚就丟牌組，否則丟最弱的招式
      if (opp.deck.length > 15) {
        applyEffect(state, oppSeat, mill, sourceName);
      } else {
        const [c] = lowestValue(techs, 1);
        removeFrom(opp.hand, c.iid);
        opp.discard.push(c);
        log(state, oppSeat, `${seatLabel(oppSeat)}因「${sourceName}」捨棄招式「${nameOf(c)}」。`, 'combat');
      }
      break;
    }

    case 'allDrawThenAngerBottom': {
      applyEffect(state, seat, { type: 'draw', n: effect.draw }, sourceName);
      applyEffect(state, oppSeat, { type: 'draw', n: effect.draw }, sourceName);
      chooseHandToAnger(state, seat, 1, sourceName);
      chooseHandToAnger(state, oppSeat, 1, sourceName);
      break;
    }

    case 'opponentDrawToThenAngerBottom': {
      const need = Math.max(0, effect.handSize - opp.hand.length);
      if (need > 0) applyEffect(state, oppSeat, { type: 'draw', n: need }, sourceName);
      chooseHandToAnger(state, oppSeat, effect.n, sourceName);
      break;
    }

    case 'opponentDiscardToAngerBottom': {
      if (opp.discard.length === 0) break;
      const pick = Math.min(effect.n, opp.discard.length);
      if (isHumanSeat(state, seat)) {
        pushPending(state, {
          kind: 'oppDiscardToAnger',
          seat,
          prompt: `【${sourceName}】選擇對手棄牌區 ${pick} 張卡放到對手的怒氣區底`,
          candidates: [...opp.discard],
          pick,
          selected: [],
          source: sourceName,
        });
        break;
      }
      for (const c of highestValue(opp.discard, pick)) {
        removeFrom(opp.discard, c.iid);
        opp.anger.unshift(c);
        log(state, oppSeat, `【${sourceName}】${seatLabel(oppSeat)}棄牌區的「${nameOf(c)}」被放到怒氣區底。`, 'combat');
      }
      break;
    }

    case 'freeCardNext':
      side.freeNextCards.push(effect.targetDefId);
      log(state, seat, `${sourceName}：本回合下一張《${card(effect.targetDefId).name}》免費用。`, 'info');
      break;

    case 'immuneTrickSecret':
      side.immuneTrickSecretNextTurn = true;
      log(state, seat, `${sourceName}：對手下回合中我方不受特技與密技影響。`, 'info');
      break;

    case 'advanceCooldowns': {
      const remaining: typeof side.cooldownZone = [];
      for (const cd of side.cooldownZone) {
        cd.counter += effect.n;
        if (cd.counter >= cd.maxCounter) {
          side.discard.push(cd.card);
          log(state, seat, `「${nameOf(cd.card)}」加速冷卻完成，進入棄牌區。`, 'info');
        } else {
          remaining.push(cd);
        }
      }
      side.cooldownZone = remaining;
      break;
    }

    case 'finishCooldown':
      if (side.cooldownZone.length > 0) {
        const cd = side.cooldownZone.shift()!;
        side.discard.push(cd.card);
        log(state, seat, `「${nameOf(cd.card)}」立即冷卻完成，進入棄牌區。`, 'info');
      }
      break;

    case 'conditional':
      if (checkCondition(state, seat, effect.when)) {
        log(state, seat, `${sourceName}：條件成立！`, 'combat');
        applyEffect(state, seat, effect.effect, sourceName, ctx);
      } else if (effect.otherwise) {
        applyEffect(state, seat, effect.otherwise, sourceName, ctx);
      }
      break;

    // ── 事件區 ──

    case 'addEventCounters':
      if (!state.eventZone) {
        log(state, seat, `「${sourceName}」：事件區沒有事件，無法放置指示物。`, 'info');
        break;
      }
      addEventCounters(state, effect.n, sourceName);
      break;

    case 'removeOwnEventCounters': {
      const ev = state.eventZone;
      if (!ev || ev.owner !== seat) break;
      const removed = Math.min(ev.counters, effect.n);
      ev.counters -= removed;
      log(state, seat, `「${sourceName}」：移除「${nameOf(ev.card)}」上 ${removed} 個持續時間指示物（剩 ${ev.counters}）。`, 'info');
      break;
    }

    // ── 詠唱 ──

    case 'chantFromDiscard': {
      if (chantsLeft(state, seat, RULES.chantsPerTurn) <= 0) {
        log(state, seat, `「${sourceName}」：本回合的詠唱次數已用完。`, 'info');
        break;
      }
      const pool = chantableInDiscard(state, seat);
      if (pool.length === 0) {
        log(state, seat, `「${sourceName}」：棄牌區沒有付得起詠唱費用的卡。`, 'info');
        break;
      }
      if (isHumanSeat(state, seat)) {
        pushPending(state, {
          kind: 'chantFromDiscard',
          seat,
          prompt: `【${sourceName}】選擇棄牌區 1 張卡詠唱打出（需支付詠唱費用）`,
          candidates: pool,
          pick: 1,
          selected: [],
          source: sourceName,
        });
        break;
      }
      const best = [...pool].sort((a, b) => (card(b.defId).chant?.damage ?? 0) - (card(a.defId).chant?.damage ?? 0))[0];
      chantFromDiscard(state, seat, best.iid);
      break;
    }

    case 'gainPlayedChants': {
      if (!ctx.play) break;
      // techPlayed 最後一張就是這張卡自己
      const played = side.stats.techPlayed.slice(0, -1).map((id) => card(id));
      const bonus = gainChantsOf(state, seat, played, sourceName, ctx);
      ctx.play.damage += bonus;
      log(state, seat, `「${sourceName}」獲得本回合招式的詠唱效果，此擊傷害 +${bonus}，並額外詠唱此卡。`, 'combat');
      onChanted(state, seat, card(ctx.play.card.defId));
      break;
    }

    case 'discardAngerByCountersGainChant': {
      if (!ctx.play) break;
      const x = ownCounters(state, seat);
      const discarded: CardInstance[] = [];
      for (let i = 0; i < x; i++) {
        const c = side.anger.pop();
        if (!c) break;
        side.discard.push(c);
        discarded.push(c);
      }
      const gained = discarded.map((c) => card(c.defId)).filter((d) => d.kind === 'technique' && matchFilter(d, effect.filter));
      const bonus = gainChantsOf(state, seat, gained, sourceName, ctx);
      ctx.play.damage += bonus;
      log(
        state,
        seat,
        `「${sourceName}」捨棄怒氣 ${discarded.length} 張，獲得其中 ${gained.length} 張的詠唱效果，此擊傷害 +${bonus}，並額外詠唱此卡。`,
        'combat',
      );
      onChanted(state, seat, card(ctx.play.card.defId));
      break;
    }

    // ── 裝備 ──

    case 'tapEquipment': {
      const targets = pickEquipmentToTap(state, seat, effect.n);
      if (targets.length === 0) log(state, seat, `「${sourceName}」：沒有可以橫置的裝備。`, 'info');
      for (const eq of targets) tapEquipment(state, seat, eq.iid);
      break;
    }

    case 'freeEquip': {
      const eligible = side.hand.filter((c) => {
        const d = card(c.defId);
        return d.kind === 'equipment' && !equipBlockReason(state, seat, d);
      });
      if (eligible.length === 0) {
        log(state, seat, `「${sourceName}」：手牌沒有符合需求的裝備。`, 'info');
        break;
      }
      if (isHumanSeat(state, seat)) {
        pushPending(state, {
          kind: 'freeEquip',
          seat,
          prompt: `【${sourceName}】可以不支付費用打出 1 張裝備`,
          candidates: eligible,
          pick: 1,
          selected: [],
          alt: { label: '不使用' },
          source: sourceName,
        });
        break;
      }
      equipFromHand(state, seat, eligible[0].iid, sourceName);
      break;
    }

    case 'untapLife': {
      let n = 0;
      for (const l of side.life) {
        if (n >= effect.n) break;
        if (l.tapped) {
          l.tapped = false;
          n++;
        }
      }
      if (n > 0) log(state, seat, `「${sourceName}」：重置了 ${n} 張生命卡。`, 'info');
      break;
    }

    case 'boostSelfPerTappedEquipment': {
      if (!ctx.play) break;
      const x = side.tappedEquipment.length;
      ctx.play.damage += x;
      log(state, seat, `「${sourceName}」：橫置狀態的裝備 ${x} 張，此擊傷害 +${x}。`, 'combat');
      break;
    }
  }
}

/** 一次結算多個效果 */
export function applyEffects(
  state: GameState,
  seat: Seat,
  effects: readonly Effect[] | undefined,
  sourceName: string,
  ctx: EffectContext = {},
): void {
  if (!effects) return;
  for (const e of effects) {
    if (state.winner) return;
    applyEffect(state, seat, e, sourceName, ctx);
  }
}

// ─────────────────────────────────────────────
// 顯示輔助
// ─────────────────────────────────────────────

export function describeModifier(target: string): string {
  switch (target) {
    case 'techniqueDamage':
      return '招式傷害';
    case 'hiddenDamage':
      return '密奧義傷害';
    case 'chantDamage':
      return '詠唱傷害';
    case 'damageReduction':
      return '傷害減免';
    case 'immuneTrickSecret':
      return '免疫特技密技';
    case 'guardValue':
      return '防禦值';
    case 'drawCount':
      return '抽牌數';
    case 'recoverAmount':
      return '回復量';
    case 'cost':
      return '費用';
    case 'extraGuard':
      return '額外防禦卡';
    case 'chantCostFixed':
      return '詠唱費用改為';
    case 'extraChant':
      return '額外詠唱次數';
    case 'freeTechnique':
      return '招式免費';
    default:
      return target;
  }
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
