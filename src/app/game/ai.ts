/**
 * 《氣脈》— NPC 對手
 *
 * 第一版採啟發式決策，目標是「打得像個正常人」而不是最強。
 * 所有決策都只讀 GameState，且一律透過 engine 的公開 API 出手，
 * 所以它跟人類玩家受完全相同的規則約束（不可能作弊）。
 *
 * 這裡的函式都接受 seat 參數，因此同一套邏輯可以驅動雙方——
 * 這讓「AI 對 AI 模擬整局」成為可能，是驗證引擎穩定性的主要手段。
 */

import { card } from './cards';
import { playTechnique, techniquePlayability } from './combat';
import { chantTechnique, enterCombat, playCard, resolveBurst } from './engine';
import type { CardInstance, GameState, Seat } from './types';
import { RULES, TECHNIQUE_ORDER } from './types';

// ─────────────────────────────────────────────
// 爆發階段
// ─────────────────────────────────────────────

/**
 * 是否使用爆發。
 *
 * 注意：規則書寫「丟棄牌組最上方 5 張卡」，本實作判讀為進入棄牌區（不是怒氣區）。
 * 因此爆發本質上是淨虧 4 張牌的行為，只在手牌乾枯時才值得做。
 */
export function shouldBurst(state: GameState, seat: Seat): boolean {
  const side = state.sides[seat];
  return side.hand.length <= 2 && side.deck.length >= 12;
}

// ─────────────────────────────────────────────
// 主要階段
// ─────────────────────────────────────────────

/** 出牌優先序：裝備（永久增益）→ 行動（資源）→ 事件（時效）→ 任務（排隊） */
const KIND_PRIORITY: Record<string, number> = {
  equipment: 0,
  action: 1,
  event: 2,
  quest: 3,
  technique: 9,
};

function shouldPlay(state: GameState, seat: Seat, inst: CardInstance): boolean {
  const def = card(inst.defId);
  const side = state.sides[seat];

  switch (def.kind) {
    case 'technique':
      return false; // 招式常規只在戰鬥階段出（詠唱由另外的邏輯判斷）

    case 'equipment':
      return side.level >= (def.levelRequirement ?? 1);

    case 'event':
      // 事件卡每回合只能 1 張，留給後面可能更需要的手牌
      return side.life.filter((l) => !l.tapped).length >= 2;

    case 'action':
    case 'quest':
      return true;

    default:
      return false;
  }
}

/** 依優先序打出所有值得打的卡。回傳實際打出的張數 */
export function mainPhase(state: GameState, seat: Seat): number {
  let played = 0;
  let safety = 40; // 防止任何意外造成無限迴圈

  while (safety-- > 0) {
    const hand = [...state.sides[seat].hand];
    if (hand.length === 0) break;

    hand.sort((a, b) => {
      const pa = KIND_PRIORITY[card(a.defId).kind] ?? 9;
      const pb = KIND_PRIORITY[card(b.defId).kind] ?? 9;
      return pa - pb;
    });

    let acted = false;

    // 先嘗試詠唱（若有詠唱卡且未詠唱過）
    if (state.sides[seat].chantsUsedThisTurn < RULES.chantsPerTurn) {
      for (const inst of hand) {
        const def = card(inst.defId);
        if (def.chant) {
          if (chantTechnique(state, seat, inst.iid).ok) {
            played++;
            acted = true;
            break;
          }
        }
      }
      if (acted) continue;
    }

    for (const inst of hand) {
      if (!shouldPlay(state, seat, inst)) continue;
      if (playCard(state, seat, inst.iid).ok) {
        played++;
        acted = true;
        break; // 重新掃描：打出的卡可能改變了局面（例如抽牌）
      }
    }

    if (!acted) break;
    if (state.winner) break;
  }

  return played;
}

// ─────────────────────────────────────────────
// 戰鬥階段
// ─────────────────────────────────────────────

/**
 * 出招決策：依 特技→密技→奧義→密奧義 的順序，每個 tier 打出第一張能打的。
 *
 * 為什麼幾乎總是全力出招：招式的代價是「這張卡離開手牌」，但造成的傷害會讓對手
 * 的牌組沖進怒氣區、加速對手重構（消耗對手生命卡）。在這套規則裡進攻是有利的一方。
 */
export function combatPhase(state: GameState, seat: Seat): number {
  let played = 0;

  for (const tier of TECHNIQUE_ORDER) {
    if (state.winner) break;

    const candidates = state.sides[seat].hand.filter((c) => card(c.defId).tier === tier);
    for (const c of candidates) {
      if (techniquePlayability(state, seat, c.iid).ok) {
        if (playTechnique(state, seat, c.iid).ok) played++;
        break;
      }
    }
  }

  return played;
}

// ─────────────────────────────────────────────
// 完整回合（不含戰鬥結算，交由呼叫方處理）
// ─────────────────────────────────────────────

/**
 * 跑完某座位從當前階段到「戰鬥階段出招完畢」為止的決策。
 * 呼叫方（UI 或模擬器）負責在之後呼叫 finishCombat / clearCombat / endTurnFully。
 */
export function runTurnDecisions(state: GameState, seat: Seat): void {
  if (state.winner || state.activeSeat !== seat) return;

  if (state.phase === 'burst') {
    resolveBurst(state, shouldBurst(state, seat));
  }

  if (state.phase === 'main') {
    mainPhase(state, seat);
  }

  if (state.phase === 'main' && !state.winner) {
    enterCombat(state);
  }

  if (state.phase === 'combat' && !state.winner) {
    combatPhase(state, seat);
  }
}

// ─────────────────────────────────────────────
// NPC 專用包裝（UI 用這個就好）
// ─────────────────────────────────────────────

export const npcShouldBurst = (state: GameState): boolean => shouldBurst(state, 'npc');
export const npcMainPhase = (state: GameState): number => mainPhase(state, 'npc');
export const npcCombatPhase = (state: GameState): number => combatPhase(state, 'npc');
