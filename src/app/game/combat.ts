/**
 * 《氣脈》— 戰鬥階段
 *
 * 規則流程（依原規則書）：
 *   出招步驟   攻擊方依序打出特技 → 密技 → 奧義 → 密奧義，各最多 1 張，可以少出
 *              （主要階段詠唱、已在招式區的卡是額外出招，不佔階級也不影響順序）
 *   防禦判定   防禦方翻開自己牌組頂 1 張作為防禦卡（裝備可增加張數）
 *   傷害計算   X = 出招傷害總和 − 防禦值，防禦方牌組頂 X 張進怒氣區
 *   歸還       打出的招式與防禦卡進各自持有者的棄牌區
 */

import { card } from './cards';
import { applyEffects, checkCondition, toChantedPlay } from './effects';
import {
  canPlayWithCooldown,
  computeCost,
  consumeOnceCostBuffs,
  log,
  millToAngerCards,
  modifier,
  modifierFor,
  nameOf,
  payAngerCost,
  payLifeCost,
  rebuild,
  routeCardAfterPlay,
  seatLabel,
  toDiscard,
} from './internal';
import { detectCombos, evaluateQuest } from './quests';
import type { CardInstance, CombatPlay, CombatState, GameState, Seat } from './types';
import { OTHER_SEAT, TECHNIQUE_LABEL, TECHNIQUE_ORDER } from './types';

export interface PlayResult {
  ok: boolean;
  reason?: string;
}

// ─────────────────────────────────────────────
// 開場
// ─────────────────────────────────────────────

export function beginCombat(state: GameState, attacker: Seat): void {
  const side = state.sides[attacker];

  // 主要階段詠唱的卡已經在招式區：傷害在這時才計算，主要階段拿到的增益都吃得到
  const plays = side.techniqueZone.map((c) => toChantedPlay(state, attacker, c));
  side.techniqueZone = [];

  state.combat = {
    attacker,
    defender: OTHER_SEAT[attacker],
    plays,
    defenseCards: [],
    defenseGuard: 0,
    damage: 0,
    step: 'declare',
    comboFormed: false,
  };
  log(state, attacker, `${seatLabel(attacker)}進入戰鬥階段。`, 'combat');
}

// ─────────────────────────────────────────────
// 出招步驟
// ─────────────────────────────────────────────

/** 檢查某張招式卡現在能不能打出（UI 用來反灰按鈕，AI 用來列候選） */
export function techniquePlayability(state: GameState, seat: Seat, iid: number): PlayResult {
  const combat = state.combat;
  if (!combat) return { ok: false, reason: '不在戰鬥階段' };
  if (combat.step !== 'declare') return { ok: false, reason: '已過出招步驟' };
  if (seat !== combat.attacker) return { ok: false, reason: '只有攻擊方能出招' };

  const side = state.sides[seat];
  const inst = side.hand.find((c) => c.iid === iid);
  if (!inst) return { ok: false, reason: '手牌中沒有這張卡' };

  const def = card(inst.defId);
  if (def.kind !== 'technique' || !def.tier) return { ok: false, reason: '這不是招式卡' };

  if (!canPlayWithCooldown(state, seat, inst.defId)) {
    return { ok: false, reason: '冷卻區已有同名卡，達到儲存上限' };
  }

  // 詠唱的額外出招不佔階級，出招順序只看出招步驟打出的招式
  const idx = TECHNIQUE_ORDER.indexOf(def.tier);
  const last = combat.plays.filter((p) => !p.chanted).pop();
  const lastIdx = last ? TECHNIQUE_ORDER.indexOf(last.tier) : -1;
  if (idx <= lastIdx) {
    return { ok: false, reason: '必須依 特技→密技→奧義→密奧義 的順序出招' };
  }

  if (def.liberation && !checkCondition(state, seat, def.liberation)) {
    return { ok: false, reason: '解放條件尚未滿足' };
  }

  const cost = computeCost(state, seat, def);
  if (cost.life > 0 && state.sides[seat].life.filter((l) => !l.tapped).length < cost.life) {
    return { ok: false, reason: `需要橫置 ${cost.life} 張生命卡` };
  }
  if (state.sides[seat].anger.length < cost.anger) {
    return { ok: false, reason: `需要捨棄怒氣區 ${cost.anger} 張卡` };
  }

  return { ok: true };
}

export function playTechnique(state: GameState, seat: Seat, iid: number): PlayResult {
  const check = techniquePlayability(state, seat, iid);
  if (!check.ok) return check;

  const combat = state.combat as CombatState;
  const side = state.sides[seat];
  const defender = state.sides[combat.defender];
  const inst = side.hand.find((c) => c.iid === iid) as CardInstance;
  const def = card(inst.defId);

  // 支付費用（應援團在場時招式免費，包括額外費用）
  const cost = computeCost(state, seat, def);
  consumeOnceCostBuffs(state, seat, def);
  if (cost.life > 0) {
    payLifeCost(state, seat, cost.life);
    log(state, seat, `${seatLabel(seat)}橫置了 ${cost.life} 張生命卡支付招式費用。`, 'info');
  }
  if (cost.anger > 0) {
    payAngerCost(state, seat, cost.anger);
    log(state, seat, `${seatLabel(seat)}捨棄怒氣區 ${cost.anger} 張卡作為費用代價。`, 'info');
  }

  // 移出手牌
  side.hand.splice(
    side.hand.findIndex((c) => c.iid === iid),
    1,
  );

  // 記錄出招序列（連招判定與任務條件都靠這個）
  const tier = def.tier as (typeof TECHNIQUE_ORDER)[number];
  side.stats.tierSequence.push(tier);
  side.stats.playTier[tier] += 1;
  side.stats.playKind.technique += 1;
  side.stats.techPlayed.push(def.id);

  // 計算這一擊的傷害：基礎 + 招式傷害增益（含只加成這張卡的） + 密奧義專屬增益 + 連招加成
  let damage = def.damage ?? 0;
  damage += modifierFor(state, seat, 'techniqueDamage', def, inst.iid);
  if (tier === 'hidden') damage += modifierFor(state, seat, 'hiddenDamage', def, inst.iid);

  if (def.comboBonus) {
    const seq = side.stats.tierSequence;
    const need = def.comboBonus.sequence;
    if (seq.length >= need.length) {
      const tail = seq.slice(seq.length - need.length);
      if (tail.every((t, i) => t === need[i])) {
        damage += def.comboBonus.damage;
        log(state, seat, `【連招成立】${seatLabel(seat)}的「${def.name}」追加 +${def.comboBonus.damage} 連招傷害！`, 'combat');
      }
    }
  }

  const play: CombatPlay = { tier, card: inst, damage: Math.max(0, damage) };
  combat.plays.push(play);

  log(
    state,
    seat,
    `${seatLabel(seat)}打出【${TECHNIQUE_LABEL[tier]}】「${def.name}」（造成 ${play.damage} 點打擊）。`,
    'combat',
  );

  // 連招記錄（供任務條件 comboInTurn 使用）
  const combos = detectCombos(side.stats.tierSequence);
  if (combos.length > 0) {
    combat.comboFormed = true;
    for (const key of combos) {
      if (!side.stats.combos.includes(key)) side.stats.combos.push(key);
    }
  }

  // 其餘效果（回復、抽牌、「此卡傷害 +X」等）
  applyEffects(state, seat, def.effects, def.name, { sourceIid: inst.iid, play });

  // 替罪羊判定：對手處於免疫特技密技狀態時，特技與密技造成 0 傷害
  if (defender.immuneTrickSecretNextTurn && (tier === 'trick' || tier === 'secret')) {
    play.damage = 0;
    log(state, combat.defender, `【替罪羊生效】${seatLabel(combat.defender)}免疫了特技與密技傷害！`, 'combat');
  }
  play.damage = Math.max(0, play.damage);

  // 出招可能就滿足任務條件（例如「一個回合內打出 2 張招式卡」）
  evaluateQuest(state, seat);

  return { ok: true };
}

// ─────────────────────────────────────────────
// 防禦判定步驟
// ─────────────────────────────────────────────

export function resolveDefense(state: GameState): void {
  const combat = state.combat;
  if (!combat) return;

  combat.step = 'defense';

  // 攻擊方的招式區沒有任何招式（沒出招也沒詠唱）→ 不進防禦判定，直接結束戰鬥
  if (combat.plays.length === 0) {
    log(state, combat.attacker, `${seatLabel(combat.attacker)}沒有出招，戰鬥結束。`, 'combat');
    combat.step = 'done';
    return;
  }

  const side = state.sides[combat.defender];
  const extra = modifier(state, combat.defender, 'extraGuard');
  const count = 1 + Math.max(0, extra);

  const flipped: CardInstance[] = [];
  for (let i = 0; i < count; i++) {
    if (state.winner) break;
    // 牌組見底先重構；要等玩家選生命卡時這次就不再翻（傷害會在重構完成後補算）
    if (side.deck.length === 0 && rebuild(state, combat.defender) !== 'done') break;
    const top = side.deck.shift();
    if (!top) break;
    flipped.push(top);
  }

  combat.defenseCards = flipped;

  const guardFromCards = flipped.reduce((sum, c) => sum + card(c.defId).guard, 0);
  const guardBonus = modifier(state, combat.defender, 'guardValue') + eventCounterGuard(state, combat.defender);
  const chantReduction = combat.plays
    .filter((p) => p.chanted)
    .reduce((sum, p) => sum + (card(p.card.defId).chant?.guardReduction ?? 0), 0);
  const guardReduction = chantReduction + guardBreak(state, combat);
  combat.defenseGuard = Math.max(0, guardFromCards + guardBonus - guardReduction);

  const shown = flipped.map((c) => `「${nameOf(c)}」(防禦 ${card(c.defId).guard})`).join('、');
  log(
    state,
    combat.defender,
    `${seatLabel(combat.defender)}翻開防禦卡：${shown || '（無）'}${
      guardBonus ? `，防禦增益 +${guardBonus}` : ''
    }${guardReduction ? `，防禦削弱 -${guardReduction}` : ''} → 總防禦值 ${combat.defenseGuard}。`,
    'combat',
  );
}

/** 【秘法力場】防禦方的事件在事件區時，防禦值 + 事件上的指示物數 */
function eventCounterGuard(state: GameState, defender: Seat): number {
  const ev = state.eventZone;
  if (!ev || ev.owner !== defender || !card(ev.card.defId).guardFromCounters) return 0;
  if (ev.counters > 0) {
    log(state, defender, `【${nameOf(ev.card)}】防禦值 +${ev.counters}。`, 'combat');
  }
  return ev.counters;
}

/** 【防滑手套】攻擊方條件成立時，對手防禦值 − 我方最後一張招式的防禦值 */
function guardBreak(state: GameState, combat: CombatState): number {
  const attacker = state.sides[combat.attacker];
  const last = combat.plays[combat.plays.length - 1]?.card;
  if (!last) return 0;

  let total = 0;
  for (const eq of attacker.equipment) {
    const cond = card(eq.defId).guardBreakByLastTechnique;
    if (!cond || !checkCondition(state, combat.attacker, cond)) continue;
    const x = card(last.defId).guard;
    total += x;
    log(state, combat.attacker, `【${nameOf(eq)}】對手的防禦判定 −${x}（「${nameOf(last)}」的防禦值）。`, 'combat');
  }
  return total;
}

/** 【元素之章】依本回合打出招式的名稱種類數，傷害計算時追加傷害 */
function elementBonus(state: GameState, seat: Seat): number {
  const side = state.sides[seat];
  let total = 0;
  for (const eq of side.equipment) {
    const eb = card(eq.defId).elementBonus;
    if (!eb) continue;
    const kinds = eb.names.filter((n) => side.stats.techPlayed.some((id) => card(id).name.includes(n))).length;
    const bonus = eb.bonusByKinds[kinds] ?? 0;
    if (bonus > 0) {
      total += bonus;
      log(state, seat, `【${nameOf(eq)}】本回合打出 ${kinds} 種元素招式，傷害 +${bonus}。`, 'combat');
    }
  }
  return total;
}

// ─────────────────────────────────────────────
// 傷害計算步驟
// ─────────────────────────────────────────────

export function resolveDamage(state: GameState): void {
  const combat = state.combat;
  if (!combat) return;

  combat.step = 'damage';

  const techTotal = combat.plays.reduce((sum, p) => sum + p.damage, 0);
  const grossTotal = techTotal + elementBonus(state, combat.attacker);
  const netAfterGuard = Math.max(0, grossTotal - combat.defenseGuard);
  const damageReduction = modifier(state, combat.defender, 'damageReduction');
  combat.damage = Math.max(0, netAfterGuard - damageReduction);

  if (combat.damage === 0) {
    log(
      state,
      combat.defender,
      `${seatLabel(combat.defender)}防禦成功：總攻擊 ${grossTotal} 被防禦值 ${combat.defenseGuard}${
        damageReduction ? ` 與減傷 ${damageReduction}` : ''
      } 完全抵擋，未受到傷害。`,
      'combat',
    );
    return;
  }

  const res = millToAngerCards(state, combat.defender, combat.damage);
  const moved = res.count;
  // 重構後才補完的傷害也算是這次攻擊造成的
  state.sides[combat.attacker].stats.damageDealt += moved + res.deferred;

  const movedNames = res.cards.map((c) => `「${nameOf(c)}」`).join('、');
  log(
    state,
    combat.defender,
    `結算傷害：攻擊 ${grossTotal}（招式 ${techTotal}）− 防禦 ${combat.defenseGuard}${
      damageReduction ? ` − 減傷 ${damageReduction}` : ''
    } = ${combat.damage} 點。${seatLabel(combat.defender)}受到 ${moved} 點傷害${
      movedNames ? `，將 ${movedNames} 送入怒氣區` : ''
    }${res.deferred > 0 ? `，重構後再承受剩下的 ${res.deferred} 點` : ''}。`,
    'combat',
  );
}

// ─────────────────────────────────────────────
// 歸還步驟
// ─────────────────────────────────────────────

export function returnCombatCards(state: GameState): void {
  const combat = state.combat;
  if (!combat) return;

  combat.step = 'return';

  // 攻擊方招式區的卡（含詠唱的額外出招）依屬性（怒底 / 冷卻 / 棄牌）送回
  for (const p of combat.plays) {
    routeCardAfterPlay(state, combat.attacker, p.card);
  }

  // 防禦卡一律進入防禦方的棄牌區
  toDiscard(state, combat.defender, combat.defenseCards);
  combat.defenseCards = [];
}

// ─────────────────────────────────────────────
// 一次跑完整個戰鬥階段
// ─────────────────────────────────────────────

/**
 * 出招決定完之後，跑完防禦判定 → 傷害計算 → 歸還。
 * 這是 AI 與 UI 最常呼叫的入口。
 */
export function finishCombat(state: GameState): void {
  const combat = state.combat;
  if (!combat || combat.step === 'done') return;

  resolveDefense(state);
  if (combat.plays.length > 0) resolveDamage(state);
  returnCombatCards(state);

  combat.step = 'done';

  // 傷害可能促成任務完成或失敗（雙方都要檢查）
  if (!state.winner) {
    evaluateQuest(state, combat.defender);
    evaluateQuest(state, combat.attacker);
  }
}

/** 結束戰鬥階段並清除暫存 */
export function clearCombat(state: GameState): void {
  state.combat = null;
}
