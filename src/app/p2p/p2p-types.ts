import type { CharacterId, GameState, Seat } from '../game/types';
import type { FxPopup } from '../game-store';

/** 客戶端發送給房主的操作指令 */
export type GameAction =
  | { type: 'PLAY'; iid: number }
  | { type: 'CHANT'; iid: number }
  | { type: 'ATTACK'; iid: number }
  | { type: 'BURST'; use: boolean }
  | { type: 'ENTER_COMBAT' }
  | { type: 'END_COMBAT' }
  | { type: 'END_TURN' }
  | { type: 'CHOOSE_CARD'; iid: number }
  | { type: 'CHOOSE_LIFE'; iid: number };

/** P2P 網路傳輸訊息 */
export type P2PMessage =
  | { type: 'GUEST_HELLO'; hero: CharacterId }
  | {
      type: 'GAME_START';
      seed: number;
      hostHero: CharacterId;
      guestHero: CharacterId;
      state: GameState;
    }
  | { type: 'ACTION'; seat: Seat; action: GameAction }
  | { type: 'SYNC_STATE'; state: GameState; popups: FxPopup[]; combatSeq: number }
  | { type: 'RESTART'; seed: number; state: GameState };

/** 連線角色 */
export type NetworkRole = 'host' | 'guest' | null;

/** 連線狀態 */
export type ConnectionStatus =
  | 'idle'
  | 'hosting'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';
