import { describe, expect, it } from 'vitest';

import { createGame, resolveChoice } from '../game/engine';
import { generateRoomCode, normalizeRoomCode, P2PService } from './p2p-service';
import type { GameState } from '../game/types';
import type { P2PMessage } from './p2p-types';

describe('P2P 網路服務與通訊協定', () => {
  it('房間代碼格式化與正規化正確', () => {
    expect(normalizeRoomCode('1234')).toBe('QM-1234');
    expect(normalizeRoomCode('qm-5678')).toBe('QM-5678');
    expect(normalizeRoomCode(' QM-9999 ')).toBe('QM-9999');

    const generated = generateRoomCode();
    expect(generated).toMatch(/^QM-\d{4}$/);
  });

  it('P2PService 初始化狀態正常', () => {
    const service = new P2PService();
    expect(service.status()).toBe('idle');
    expect(service.role()).toBeNull();
    expect(service.roomCode()).toBe('');
    expect(service.errorMessage()).toBe('');
  });

  it('GameState 完整支援 JSON 序列化與反序列化，無資訊丟失', () => {
    const original = createGame(12345, {
      playerCharacter: 'rage',
      npcCharacter: 'mage',
      manualLifeSetup: false,
    });

    const json = JSON.stringify(original);
    const restored: GameState = JSON.parse(json);

    expect(restored.seed).toBe(original.seed);
    expect(restored.turn).toBe(original.turn);
    expect(restored.activeSeat).toBe(original.activeSeat);
    expect(restored.phase).toBe(original.phase);
    expect(restored.sides.player.life.length).toBe(3);
    expect(restored.sides.npc.life.length).toBe(3);
    expect(restored.sides.player.hand.length).toBe(original.sides.player.hand.length);
    expect(restored.sides.npc.hand.length).toBe(original.sides.npc.hand.length);
    expect(restored.log.length).toBe(original.log.length);
  });

  it('雙人手動挑選生命卡流程：房主選完後接續由客人選取，全部就緒才開始對局', () => {
    const state = createGame(8888, {
      playerCharacter: 'rage',
      npcCharacter: 'qigong',
      manualLifeSetupBoth: true,
    });

    // 剛開局：雙方生命區為 0，第一階段由 player 挑選
    expect(state.sides.player.life.length).toBe(0);
    expect(state.sides.npc.life.length).toBe(0);
    expect(state.pending).not.toBeNull();
    expect(state.pending?.seat).toBe('player');
    expect(state.pending?.pick).toBe(3);

    // 房主挑選 3 張生命卡
    const p1Hand = [...state.sides.player.hand];
    resolveChoice(state, p1Hand[0].iid);
    resolveChoice(state, p1Hand[1].iid);
    resolveChoice(state, p1Hand[2].iid);

    // 房主完成：player 生命區為 3，接著 pending 自動切換至 npc
    expect(state.sides.player.life.length).toBe(3);
    expect(state.sides.npc.life.length).toBe(0);
    expect(state.pending).not.toBeNull();
    expect(state.pending?.seat).toBe('npc');

    // 客人挑選 3 張生命卡
    const p2Hand = [...state.sides.npc.hand];
    resolveChoice(state, p2Hand[0].iid);
    resolveChoice(state, p2Hand[1].iid);
    resolveChoice(state, p2Hand[2].iid);

    // 客人完成：雙方生命區皆為 3，pending 結束，進入第 1 回合
    expect(state.sides.npc.life.length).toBe(3);
    expect(state.pending).toBeNull();
    expect(state.turn).toBe(1);
    expect(state.sides[state.activeSeat].currentQuest).not.toBeNull();
    expect(state.sides[state.activeSeat === 'player' ? 'npc' : 'player'].currentQuest).toBeNull();
  });

  it('P2P 訊息物件可正確建立並傳輸', () => {
    const msg: P2PMessage = {
      type: 'ACTION',
      seat: 'npc',
      action: { type: 'PLAY', iid: 101 },
    };
    expect(msg.type).toBe('ACTION');
    if (msg.type === 'ACTION') {
      expect(msg.action.type).toBe('PLAY');
      expect((msg.action as { iid: number }).iid).toBe(101);
    }
  });
});
