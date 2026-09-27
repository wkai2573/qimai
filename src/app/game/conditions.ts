/**
 * 《氣脈》— 條件判定與卡片篩選
 *
 * 放在依賴鏈的最底層（只依賴 cards 與 types），因為 internal 計算增益時
 * 也要判斷「事件區有我方事件」這類條件；放在 effects 會形成循環依賴。
 * 依賴方向：conditions ← internal ← effects ← quests ← combat ← engine。
 */

import { card } from './cards';
import type { CardDef, CardFilter, Condition, GameState, Seat } from './types';

// ─────────────────────────────────────────────
// 篩選
// ─────────────────────────────────────────────

export function matchFilter(def: CardDef, filter?: CardFilter): boolean {
  if (!filter) return true;
  if (filter.id && def.id !== filter.id) return false;
  if (filter.kind && def.kind !== filter.kind) return false;
  if (filter.tier && def.tier !== filter.tier) return false;
  if (filter.tiers && (!def.tier || !filter.tiers.includes(def.tier))) return false;
  if (filter.slot && def.slot !== filter.slot) return false;
  if (filter.nameContains && !def.name.includes(filter.nameContains)) return false;
  if (filter.nameAny && !filter.nameAny.some((n) => def.name.includes(n))) return false;
  return true;
}

// ─────────────────────────────────────────────
// 條件判定
// ─────────────────────────────────────────────

/**
 * 判定條件是否成立。
 * 注意：連招的判定使用「本回合打出的 tier 序列」，由於一回合只有一個戰鬥階段，
 * 這個序列等同於「本戰鬥階段的出招順序」。
 */
export function checkCondition(state: GameState, seat: Seat, cond: Condition): boolean {
  const side = state.sides[seat];

  switch (cond.type) {
    case 'always':
      return true;

    case 'combo': {
      const seq = side.stats.tierSequence;
      const need = cond.sequence;
      if (need.length === 0 || seq.length < need.length) return false;
      const tail = seq.slice(seq.length - need.length);
      return tail.every((t, i) => t === need[i]);
    }

    case 'usedTierThisTurn':
      return side.stats.playTier[cond.tier] > 0;

    case 'handAtLeast':
      return side.hand.length >= cond.n;

    case 'angerAtLeast':
      return side.anger.length >= cond.n;

    case 'deckAtLeast':
      return side.deck.length >= cond.n;

    case 'lifeAtLeast':
      return side.life.length >= cond.n;

    case 'equippedSlot':
      return side.equipment.some((c) => card(c.defId).slot === cond.slot);

    case 'levelAtLeast':
      return side.level >= cond.n;

    case 'cooldownCountAtLeast':
      return side.cooldownZone.length >= cond.n;

    case 'hasChantedThisTurn':
      return side.stats.chants > 0 || side.techniqueZone.length > 0;

    case 'ownEventInZone': {
      const ev = state.eventZone;
      if (!ev || ev.owner !== seat) return false;
      return !cond.defId || ev.card.defId === cond.defId;
    }

    case 'eventExpiredThisTurn':
      return state.eventExpiredThisTurn;

    case 'eventHasCounters':
      return !!state.eventZone && state.eventZone.counters > 0;

    case 'equipmentAtLeast':
      return side.equipment.length >= cond.n;

    case 'equippedCard':
      return side.equipment.some((c) => c.defId === cond.defId);

    case 'playedNamesThisTurn':
      return cond.names.every((n) => side.stats.techPlayed.some((id) => card(id).name.includes(n)));

    case 'allPlayedTechniquesChanted': {
      if (side.stats.chants === 0) return false;
      return side.stats.techPlayed.every((id) => !!card(id).chant);
    }

    case 'anyOf':
      return cond.conditions.some((c) => checkCondition(state, seat, c));

    case 'allOf':
      return cond.conditions.every((c) => checkCondition(state, seat, c));
  }
}
