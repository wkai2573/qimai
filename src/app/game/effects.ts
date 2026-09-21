/**
 * 《氣脈》— 效果與條件判定
 *
 * 卡片的所有「效果」都在 applyEffect 裡結算，所有「條件」都在 checkCondition 裡判定。
 * 新增卡片時若只用既有 Effect 型別，這裡完全不必改。
 */

import { card } from './cards';
import {
  addBuff,
  draw,
  hasEquipped,
  log,
  millToAnger,
  nameOf,
  recover,
  seatLabel,
  withRng,
} from './internal';
import type {
  CardDef,
  CardFilter,
  CardInstance,
  Condition,
  Effect,
  GameState,
  Seat,
} from './types';
import { OTHER_SEAT } from './types';

// ─────────────────────────────────────────────
// 篩選
// ─────────────────────────────────────────────

export function matchFilter(def: CardDef, filter?: CardFilter): boolean {
  if (!filter) return true;
  if (filter.kind && def.kind !== filter.kind) return false;
  if (filter.tier && def.tier !== filter.tier) return false;
  if (filter.slot && def.slot !== filter.slot) return false;
  if (filter.nameContains && !def.name.includes(filter.nameContains)) return false;
  return true;
}

function filterCards(insts: readonly CardInstance[], filter?: CardFilter): CardInstance[] {
  return insts.filter((c) => matchFilter(card(c.defId), filter));
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
      return hasEquipped(state, seat, cond.slot);

    case 'levelAtLeast':
      return side.level >= cond.n;

    case 'cooldownCountAtLeast':
      return side.cooldownZone.length >= cond.n;

    case 'hasChantedThisTurn':
      return side.chantedCards.length > 0;
  }
}

// ─────────────────────────────────────────────
// 效果結算
// ─────────────────────────────────────────────

/**
 * 結算一個效果。sourceName 用於在增益上標記來源卡名，方便 UI 顯示。
 * 會遞迴處理 conditional 效果。
 */
export function applyEffect(state: GameState, seat: Seat, effect: Effect, sourceName: string): void {
  const side = state.sides[seat];

  switch (effect.type) {
    case 'draw':
      draw(state, seat, effect.n);
      break;

    case 'mill':
      millToAnger(state, seat, effect.n);
      break;

    case 'recover':
      recover(state, seat, effect.n);
      break;

    case 'salvage': {
      const pool = filterCards(side.discard, effect.filter);
      const picked = pool.slice(0, effect.n);
      for (const c of picked) {
        const idx = side.discard.findIndex((x) => x.iid === c.iid);
        if (idx >= 0) {
          side.discard.splice(idx, 1);
          side.hand.push(c);
          log(state, seat, `${sourceName}：從棄牌區取回「${nameOf(c)}」。`, 'info');
        }
      }
      break;
    }

    case 'search': {
      const looked = side.deck.splice(0, effect.look);
      if (looked.length === 0) break;

      const pick = Math.min(effect.pick, looked.length);

      // 玩家自己挑：暫停遊戲，等 UI 把選擇結果送回來
      if (seat === 'player') {
        state.pending = {
          kind: 'search',
          seat,
          prompt: `${sourceName}：從牌組頂 ${looked.length} 張中選 ${pick} 張加入手牌`,
          candidates: looked,
          pick,
          selected: [],
          rest: 'discard',
        };
        log(state, seat, `${sourceName}：檢索中——請選擇要加入手牌的卡。`, 'info');
        break;
      }

      // NPC 沒有這個待遇，直接由程式挑（優先取符合篩選條件的卡）
      const preferred = filterCards(looked, effect.filter);
      const ordered = [...preferred, ...looked.filter((c) => !preferred.includes(c))];
      const picked = ordered.slice(0, pick);
      const rest = ordered.slice(pick);

      side.hand.push(...picked);
      side.discard.push(...rest);

      if (picked.length > 0) {
        log(state, seat, `${sourceName}：檢索取得「${picked.map(nameOf).join('、')}」。`, 'info');
      }
      break;
    }

    case 'discardHand': {
      for (let i = 0; i < effect.n && side.hand.length > 0; i++) {
        const idx = withRng(state, (rng) => rng.int(side.hand.length));
        const removed = side.hand.splice(idx, 1);
        side.discard.push(...removed);
        if (removed.length > 0) {
          log(state, seat, `${sourceName}：棄掉「${nameOf(removed[0])}」。`, 'info');
        }
      }
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
        },
        () => state.nextIid++,
      );
      log(state, seat, `${sourceName}：${describeModifier(effect.target)} ${signed(effect.amount)}。`, 'info');
      break;

    case 'extraGuard':
      addBuff(
        side,
        {
          source: sourceName,
          target: 'extraGuard',
          amount: effect.n,
          expiry: effect.expiry,
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
      const oppSeat: Seat = OTHER_SEAT[seat];
      const opp = state.sides[oppSeat];
      if (effect.conditionHandAtLeast && opp.hand.length < effect.conditionHandAtLeast) {
        log(state, seat, `${sourceName}：對手手牌未達 ${effect.conditionHandAtLeast} 張，未觸發。`, 'info');
        break;
      }
      if (opp.hand.length > 0) {
        const idx = withRng(state, (rng) => rng.int(opp.hand.length));
        const c = opp.hand.splice(idx, 1)[0];
        opp.anger.unshift(c);
        log(state, oppSeat, `【迫令怒底】${seatLabel(oppSeat)}的手牌「${nameOf(c)}」被移入怒氣區底。`, 'combat');
      }
      break;
    }

    case 'opponentDiscardTechnique': {
      const oppSeat: Seat = OTHER_SEAT[seat];
      const opp = state.sides[oppSeat];
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
        applyEffect(state, seat, effect.effect, sourceName);
      }
      break;
  }
}

/** 一次結算多個效果 */
export function applyEffects(state: GameState, seat: Seat, effects: readonly Effect[] | undefined, sourceName: string): void {
  if (!effects) return;
  for (const e of effects) {
    if (state.winner) return;
    applyEffect(state, seat, e, sourceName);
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
    default:
      return target;
  }
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
