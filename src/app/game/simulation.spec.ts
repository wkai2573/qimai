/**
 * 《氣脈》— 整局模擬測試
 *
 * 這一組測試的價值在於「跑到完」：單元測試只驗證單一行為，
 * 而完整對局會把重構、任務完成／失敗、裝備增益、連招、勝負判定全部串起來跑，
 * 因此最容易抓到執行期崩潰與無限迴圈。
 */

import { describe, expect, it } from 'vitest';

import { combatPhase, mainPhase, shouldBurst } from './ai';
import { card } from './cards';
import { clearCombat, finishCombat } from './combat';
import { createGame, endTurnFully, enterCombat, resolveBurst, resolveRebuild } from './engine';
import type { GameState } from './types';

/** 讓當前回合的行動方自動打完他的整個回合 */
function autoTurn(state: GameState): void {
  // 重構待決：模擬時自動挑第一張生命卡（真人玩家會自己選）
  if (state.pendingRebuild) {
    const seat = state.pendingRebuild.seat;
    const life = state.sides[seat].life;
    if (life.length > 0) resolveRebuild(state, life[0].card.iid);
    return;
  }

  const seat = state.activeSeat;

  if (state.phase === 'burst') {
    resolveBurst(state, shouldBurst(state, seat));
  }

  if (state.phase === 'main' && !state.winner) {
    mainPhase(state, seat);
    if (!state.winner) enterCombat(state);
  }

  if (state.phase === 'combat' && !state.winner) {
    combatPhase(state, seat);
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
