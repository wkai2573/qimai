/**
 * 《氣脈》— 戰鬥階段
 *
 * 規則流程（依原規則書）：
 *   出招步驟   攻擊方依序打出特技 → 密技 → 奧義 → 密奧義，各最多 1 張，可以少出
 *   防禦判定   防禦方翻開自己牌組頂 1 張作為防禦卡（裝備可增加張數）
 *   傷害計算   X = 出招傷害總和 − 防禦值，防禦方牌組頂 X 張進怒氣區
 *   歸還       打出的招式與防禦卡進各自持有者的棄牌區
 */

import { card } from './cards';
import { applyEffects, checkCondition } from './effects';
import {
  log,
  millToAnger,
  modifier,
  nameOf,
  payLifeCost,
  rebuild,
  seatLabel,
  toDiscard,
} from './internal';
import { detectCombos, evaluateQuest } from './quests';
import type { CardInstance, CombatState, GameState, Seat } from './types';
import { OTHER_SEAT, TECHNIQUE_LABEL, TECHNIQUE_ORDER } from './types';

export interface PlayResult {
  ok: boolean;
  reason?: string;
}

// ─────────────────────────────────────────────
// 開場
// ─────────────────────────────────────────────

export function beginCombat(state: GameState, attacker: Seat): void {
  state.combat = {
    attacker,
    defender: OTHER_SEAT[attacker],
    plays: [],
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

  const idx = TECHNIQUE_ORDER.indexOf(def.tier);
  const last = combat.plays[combat.plays.length - 1];
  const lastIdx = last ? TECHNIQUE_ORDER.indexOf(last.tier) : -1;
  if (idx <= lastIdx) {
    return { ok: false, reason: '必須依 特技→密技→奧義→密奧義 的順序出招' };
  }

  if (def.liberation && !checkCondition(state, seat, def.liberation)) {
    return { ok: false, reason: '解放條件尚未滿足' };
  }

  const cost = Math.max(0, def.cost + modifier(state, seat, 'cost'));
  if (cost > 0 && state.sides[seat].life.filter((l) => !l.tapped).length < cost) {
    return { ok: false, reason: `需要橫置 ${cost} 張生命卡` };
  }

  return { ok: true };
}

export function playTechnique(state: GameState, seat: Seat, iid: number): PlayResult {
  const check = techniquePlayability(state, seat, iid);
  if (!check.ok) return check;

  const combat = state.combat as CombatState;
  const side = state.sides[seat];
  const inst = side.hand.find((c) => c.iid === iid) as CardInstance;
  const def = card(inst.defId);

  // 支付費用
  const cost = Math.max(0, def.cost + modifier(state, seat, 'cost'));
  if (cost > 0) payLifeCost(state, seat, cost);

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

  // 計算這一擊的傷害：基礎 + 招式傷害增益 + 密奧義專屬增益 + 連招加成
  let damage = def.damage ?? 0;
  damage += modifier(state, seat, 'techniqueDamage');
  if (tier === 'hidden') damage += modifier(state, seat, 'hiddenDamage');

  if (def.comboBonus) {
    const seq = side.stats.tierSequence;
    const need = def.comboBonus.sequence;
    if (seq.length >= need.length) {
      const tail = seq.slice(seq.length - need.length);
      if (tail.every((t, i) => t === need[i])) {
        damage += def.comboBonus.damage;
        log(state, seat, `連招成立！${def.name} 額外 +${def.comboBonus.damage} 傷害。`, 'combat');
      }
    }
  }

  damage = Math.max(0, damage);
  combat.plays.push({ tier, card: inst, damage });

  log(
    state,
    seat,
    `${seatLabel(seat)}打出【${TECHNIQUE_LABEL[tier]}】${def.name}（傷害 ${damage}）。`,
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

  // 其餘效果（回復、抽牌等）
  applyEffects(state, seat, def.effects, def.name);

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

  // 攻擊方沒有出任何招 → 不進防禦判定，直接結束戰鬥
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
    if (side.deck.length === 0 && !rebuild(state, combat.defender)) break;
    const top = side.deck.shift();
    if (!top) break;
    flipped.push(top);
  }

  combat.defenseCards = flipped;

  const guardFromCards = flipped.reduce((sum, c) => sum + card(c.defId).guard, 0);
  const guardBonus = modifier(state, combat.defender, 'guardValue');
  combat.defenseGuard = guardFromCards + guardBonus;

  const shown = flipped.map((c) => `${nameOf(c)}(防${card(c.defId).guard})`).join('、');
  log(
    state,
    combat.defender,
    `${seatLabel(combat.defender)}翻開防禦卡：${shown || '（無）'}${
      guardBonus ? `，防禦增益 +${guardBonus}` : ''
    } → 總防禦值 ${combat.defenseGuard}。`,
    'combat',
  );
}

// ─────────────────────────────────────────────
// 傷害計算步驟
// ─────────────────────────────────────────────

export function resolveDamage(state: GameState): void {
  const combat = state.combat;
  if (!combat) return;

  combat.step = 'damage';

  const total = combat.plays.reduce((sum, p) => sum + p.damage, 0);
  combat.damage = Math.max(0, total - combat.defenseGuard);

  if (combat.damage === 0) {
    log(
      state,
      combat.defender,
      `傷害 ${total} 被防禦值 ${combat.defenseGuard} 完全擋下，未造成傷害。`,
      'combat',
    );
    return;
  }

  const moved = millToAnger(state, combat.defender, combat.damage);
  state.sides[combat.attacker].stats.damageDealt += moved;

  log(
    state,
    combat.defender,
    `傷害 ${total} − 防禦 ${combat.defenseGuard} = ${combat.damage}，${seatLabel(
      combat.defender,
    )}牌組頂 ${moved} 張進入怒氣區。`,
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

  toDiscard(
    state,
    combat.attacker,
    combat.plays.map((p) => p.card),
  );
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
