/**
 * 《氣脈》— 整局模擬測試
 *
 * 這一組測試的價值在於「跑到完」：單元測試只驗證單一行為，
 * 而完整對局會把重構、任務完成／失敗、裝備增益、連招、勝負判定全部串起來跑，
 * 因此最容易抓到執行期崩潰與無限迴圈。
 */

import { describe, expect, it } from 'vitest';

import { combatPhase, mainPhase, shouldBurst } from './ai';
import { CARD_DEFS, RAGE_MAIN_DECK, MAGE_MAIN_DECK, card, validateMainDeck } from './cards';
import { clearCombat, finishCombat } from './combat';
import { createGame, endTurnFully, enterCombat, resolveBurst, resolveChoice, resolveRebuild } from './engine';
import type { CardInstance, CharacterId, GameState, Seat } from './types';
import { RULES } from './types';

/** 讓當前回合的行動方自動打完他的整個回合 */
function autoTurn(state: GameState): void {
  // 重構待決：模擬時自動挑第一張生命卡（真人玩家會自己選）
  if (state.pendingRebuild) {
    const seat = state.pendingRebuild.seat;
    const life = state.sides[seat].life;
    if (life.length > 0) resolveRebuild(state, life[0].card.iid);
    return;
  }

  // 選擇待決：模擬時自動挑候選卡
  if (state.pending) {
    for (const c of state.pending.candidates) {
      resolveChoice(state, c.iid);
      if (!state.pending) break;
    }
    return;
  }

  const seat = state.activeSeat;

  if (state.phase === 'burst') {
    resolveBurst(state, shouldBurst(state, seat));
  }

  // 出牌引發了待決選擇時先回去處理（跟真人一樣，選完才能繼續），下一輪會接著這個階段做
  const waiting = (): boolean => !!state.pending || !!state.pendingRebuild;

  if (state.phase === 'main' && !state.winner) {
    mainPhase(state, seat);
    if (waiting()) return;
    if (!state.winner) enterCombat(state);
  }

  if (state.phase === 'combat' && !state.winner) {
    combatPhase(state, seat);
    if (waiting()) return;
    finishCombat(state);
    clearCombat(state);
  }

  if (!state.winner) endTurnFully(state);
}

/** 跑到分出勝負，回傳花了幾回合 */
function playOut(seed: number, maxTurns = 500): { winner: string | null; turns: number } {
  const g = createGame(seed, { manualLifeSetup: false });
  let guard = 0;

  while (!g.winner && guard++ < maxTurns) {
    autoTurn(g);
  }

  return { winner: g.winner, turns: guard };
}

describe('整局模擬', () => {
  it('100 局 AI 對 AI 都能在合理回合數內分出勝負', () => {
    const results: { seed: number; winner: string | null; turns: number }[] = [];

    for (let seed = 1; seed <= 100; seed++) {
      const { winner, turns } = playOut(seed);
      results.push({ seed, winner, turns });
    }

    const unfinished = results.filter((r) => r.winner === null);
    expect(unfinished, `未結束的對局：${JSON.stringify(unfinished)}`).toEqual([]);

    // 沒有任何一局應該拖到 >400 回合
    const tooLong = results.filter((r) => r.turns >= 400);
    expect(tooLong, `過長的對局：${JSON.stringify(tooLong)}`).toEqual([]);
  });

  it('先攻與後攻都會贏，勝負不是單方面傾斜', () => {
    let playerWins = 0;
    let npcWins = 0;

    for (let seed = 1; seed <= 100; seed++) {
      const { winner } = playOut(seed);
      if (winner === 'player') playerWins++;
      else if (winner === 'npc') npcWins++;
    }

    expect(playerWins).toBeGreaterThan(0);
    expect(npcWins).toBeGreaterThan(0);
  });

  it('模擬過程中不會產生壞掉的卡牌參照', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = createGame(seed, { manualLifeSetup: false });
      let guard = 0;

      while (!g.winner && guard++ < 500) {
        autoTurn(g);

        // 每個區域裡的每一張卡都必須查得到定義
        for (const seat of ['player', 'npc'] as const) {
          const side = g.sides[seat];
          const all = [
            ...side.deck,
            ...side.hand,
            ...side.life.map((l) => l.card),
            ...side.anger,
            ...side.discard,
            ...side.equipment,
            ...side.levelZone,
            ...side.questDeck,
            ...(side.currentQuest ? [side.currentQuest] : []),
          ];
          for (const inst of all) {
            expect(() => card(inst.defId)).not.toThrow();
          }
        }
      }
    }
  });

  it('同一 seed 的整局模擬結果可重現', () => {
    const a = playOut(4242);
    const b = playOut(4242);
    expect(a).toEqual(b);
  });

  it('遊戲結束後狀態被正確標記', () => {
    const g = createGame(7, { manualLifeSetup: false });
    let guard = 0;
    while (!g.winner && guard++ < 500) autoTurn(g);

    expect(g.winner).not.toBeNull();
    expect(g.phase).toBe('ended');
  });
});

// ─────────────────────────────────────────────
// 新卡（事件區、裝備發動、詠唱擴充）整局模擬
// ─────────────────────────────────────────────

/** 用「不在預設牌組裡的新卡」湊出一副合法的 50 張牌組 */
function newCardDeck(char: CharacterId, defaults: Readonly<Record<string, number>>): Record<string, number> {
  const prefix = char === 'rage' ? 'rg_' : 'mg_';
  const ids = CARD_DEFS.filter((d) => d.id.startsWith(prefix) && !(d.id in defaults)).map((d) => d.id);
  const deck: Record<string, number> = {};
  let total = 0;
  let hidden = 0;

  // 輪流每張加 1，直到 50 張（遵守同名上限與密奧義上限）
  while (total < RULES.mainDeckSize) {
    let added = false;
    for (const id of ids) {
      if (total >= RULES.mainDeckSize) break;
      const isHidden = card(id).tier === 'hidden';
      if ((deck[id] ?? 0) >= RULES.maxCopiesPerName) continue;
      if (isHidden && hidden >= RULES.maxHiddenTechniques) continue;
      deck[id] = (deck[id] ?? 0) + 1;
      total++;
      if (isHidden) hidden++;
      added = true;
    }
    if (!added) break;
  }
  return deck;
}

/** 某一方目前握有的所有卡（含事件區、戰鬥區、檢索中的卡） */
function ownedCards(g: GameState, seat: Seat): CardInstance[] {
  const side = g.sides[seat];
  const out: CardInstance[] = [
    ...side.deck,
    ...side.hand,
    ...side.life.map((l) => l.card),
    ...side.anger,
    ...side.discard,
    ...side.equipment,
    ...side.levelZone,
    ...side.questDeck,
    ...(side.currentQuest ? [side.currentQuest] : []),
    ...side.cooldownZone.map((cd) => cd.card),
    ...side.techniqueZone,
  ];
  if (g.eventZone?.owner === seat) out.push(g.eventZone.card);
  for (const p of [g.pending, ...g.pendingQueue]) {
    if (p?.kind === 'search' && p.seat === seat) out.push(...p.candidates);
  }
  if (g.combat) {
    if (g.combat.attacker === seat) out.push(...g.combat.plays.map((p) => p.card));
    if (g.combat.defender === seat) out.push(...g.combat.defenseCards);
  }
  return out;
}

describe('新卡整局模擬', () => {
  const rageDeck = newCardDeck('rage', RAGE_MAIN_DECK);
  const mageDeck = newCardDeck('mage', MAGE_MAIN_DECK);

  it('用新卡湊出的牌組是合法牌組', () => {
    expect(validateMainDeck(rageDeck, 'rage').errors).toEqual([]);
    expect(validateMainDeck(mageDeck, 'mage').errors).toEqual([]);
  });

  for (const mode of ['solo', 'p2p'] as const) {
    it(`${mode === 'p2p' ? '雙方都要自己選（連線）' : '單機'}：40 局都能分出勝負，卡片不會憑空增減或重複`, () => {
      const unfinished: number[] = [];

      for (let seed = 1; seed <= 40; seed++) {
        const swap = seed % 2 === 0;
        const g = createGame(seed, {
          manualLifeSetup: false,
          manualLifeSetupBoth: mode === 'p2p',
          playerCharacter: swap ? 'mage' : 'rage',
          npcCharacter: swap ? 'rage' : 'mage',
          mainDeck: swap ? mageDeck : rageDeck,
          npcMainDeck: swap ? rageDeck : mageDeck,
        });
        const expected = { player: ownedCards(g, 'player').length, npc: ownedCards(g, 'npc').length };

        let guard = 0;
        while (!g.winner && guard++ < 500) {
          autoTurn(g);

          const all = [...ownedCards(g, 'player'), ...ownedCards(g, 'npc')];
          expect(new Set(all.map((c) => c.iid)).size, `seed ${seed}：有卡片重複出現`).toBe(all.length);
          expect(ownedCards(g, 'player').length, `seed ${seed}：玩家的卡片張數不守恆`).toBe(expected.player);
          expect(ownedCards(g, 'npc').length, `seed ${seed}：對手的卡片張數不守恆`).toBe(expected.npc);
        }
        if (!g.winner) unfinished.push(seed);
      }

      expect(unfinished, `未結束的對局：${unfinished.join(', ')}`).toEqual([]);
    });
  }
});
