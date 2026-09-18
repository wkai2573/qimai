/**
 * 《氣脈》— 任務系統
 *
 * 任務卡是雙面的：
 *   complete 條件由我方達成 → 【任務完成】此卡進等級區，等級 +1，翻開下一個任務
 *   block 條件由對手促成 → 【任務失敗】此卡回到我方手牌，翻開下一個任務
 *
 * 兩者都以「任務擁有者的視角」描述（例如「一個回合內受到 5 點以上傷害」），
 * 引擎只檢查擁有者自己的回合統計，不判斷是誰造成的——因為 block 條件在設計上
 * 本來就只使用「對手能促成」的類型。
 */

import { CARD_DEFS, card } from './cards';
import { endGame, log, nameOf } from './internal';
import type { GameState, QuestCondition, Seat, TechniqueTier } from './types';

/** 把連招序列轉成可比較的 key */
export function comboKey(sequence: readonly TechniqueTier[]): string {
  return sequence.join('>');
}

/**
 * 從卡表推導出所有連招序列。
 * 這樣只要在卡片上寫 combo 條件，任務系統就自動認得這個連招，不必另外維護清單。
 */
export function allComboSequences(): TechniqueTier[][] {
  const seen = new Set<string>();
  const out: TechniqueTier[][] = [];

  const add = (sequence: TechniqueTier[]) => {
    const key = comboKey(sequence);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(sequence);
    }
  };

  for (const def of CARD_DEFS) {
    // 招式卡上的連招加成欄位
    if (def.comboBonus) add(def.comboBonus.sequence);

    // 條件式效果裡宣告的連招
    for (const e of def.effects ?? []) {
      if (e.type === 'conditional' && e.when.type === 'combo') add(e.when.sequence);
    }
  }

  return out;
}

/** 判定本回合的 tier 序列尾端是否成立任一連招，回傳成立的 key 清單 */
export function detectCombos(tierSequence: readonly TechniqueTier[]): string[] {
  const found: string[] = [];

  for (const seq of allComboSequences()) {
    if (seq.length === 0 || tierSequence.length < seq.length) continue;
    const tail = tierSequence.slice(tierSequence.length - seq.length);
    if (tail.every((t, i) => t === seq[i])) {
      found.push(comboKey(seq));
    }
  }

  return found;
}

// ─────────────────────────────────────────────
// 條件判定
// ─────────────────────────────────────────────

export function checkQuestCondition(state: GameState, seat: Seat, cond: QuestCondition): boolean {
  const side = state.sides[seat];
  const st = side.stats;

  switch (cond.type) {
    case 'playKindInTurn':
      return st.playKind[cond.kind] >= cond.n;

    case 'playTierInTurn':
      return st.playTier[cond.tier] >= cond.n;

    case 'handAtLeast':
      return side.hand.length >= cond.n;

    case 'takeDamageInTurn':
      return st.damageTaken >= cond.n;

    case 'dealDamageInTurn':
      return st.damageDealt >= cond.n;

    case 'comboInTurn':
      return st.combos.includes(comboKey(cond.sequence));

    case 'recoverInTurn':
      return st.recovered >= cond.n;

    case 'rebuildInTurn':
      return st.rebuilt >= cond.n;

    case 'levelAtLeast':
      return side.level >= cond.n;
  }
}

// ─────────────────────────────────────────────
// 任務結算
// ─────────────────────────────────────────────

/**
 * 檢查並結算當前任務。
 * 若同一時機完成與失敗條件同時成立，判定「完成優先」（對任務擁有者有利）。
 */
export function evaluateQuest(state: GameState, seat: Seat): void {
  if (state.winner) return;

  const side = state.sides[seat];
  const inst = side.currentQuest;
  if (!inst) return;

  const q = card(inst.defId).quest;
  if (!q) return;

  if (checkQuestCondition(state, seat, q.complete)) {
    completeQuest(state, seat);
    return;
  }

  if (checkQuestCondition(state, seat, q.block)) {
    failQuest(state, seat);
  }
}

function completeQuest(state: GameState, seat: Seat): void {
  const side = state.sides[seat];
  const inst = side.currentQuest;
  if (!inst) return;

  side.currentQuest = null;
  side.levelZone.push(inst);
  side.level += 1;

  log(
    state,
    seat,
    `【任務完成】${nameOf(inst)} — ${side.seat === 'player' ? '你' : '對手'}的等級提升至 ${side.level}。`,
    'quest',
  );

  // 完成全部任務只是等級封頂，不再是勝利條件——勝負只取決於生命區
  revealNextQuest(state, seat);
}

function failQuest(state: GameState, seat: Seat): void {
  const side = state.sides[seat];
  const inst = side.currentQuest;
  if (!inst) return;

  side.currentQuest = null;
  // 失敗的任務回到手牌，之後仍可在主要階段重新打出、排回任務牌組底部
  side.hand.push(inst);

  log(
    state,
    seat,
    `【任務失敗】${nameOf(inst)} 被對手促成阻止條件，此卡回到${side.seat === 'player' ? '你的' : '對手的'}手牌。`,
    'quest',
  );

  revealNextQuest(state, seat);
}

/** 翻開任務牌組最上面一張作為新的當前任務 */
export function revealNextQuest(state: GameState, seat: Seat): void {
  const side = state.sides[seat];
  const next = side.questDeck.shift();

  if (!next) {
    log(state, seat, `${side.seat === 'player' ? '你的' : '對手的'}任務牌組已空。`, 'quest');
    return;
  }

  side.currentQuest = next;
  log(state, seat, `新的任務揭示：${nameOf(next)}。`, 'quest');
}
