import { Injectable, computed, inject, signal } from '@angular/core';

import { npcCombatPhase, npcMainPhase, npcShouldBurst } from './game/ai';
import { CHARACTER_MAIN_DECKS, card, validateMainDeck } from './game/cards';
import { clearCombat, finishCombat, playTechnique, techniquePlayability } from './game/combat';
import {
  activateEquipment,
  activationPlayability,
  cardPlayability,
  chantPlayability,
  chantTechnique,
  createGame,
  endTurnFully,
  enterCombat,
  playCard,
  resolveBurst,
  resolveChoice,
  resolveChoiceAlt,
  resolveRebuild,
} from './game/engine';
import type { CardInstance, CharacterId, GameState, LogEntry, Seat } from './game/types';
import { P2PService } from './p2p/p2p-service';
import type { GameAction, P2PMessage } from './p2p/p2p-types';

/** 可以點開查看內容的堆疊區 */
export type PileKind = 'deck' | 'anger' | 'discard' | 'life' | 'level' | 'questDeck' | 'cooldown' | 'chant';

export interface PileView {
  seat: Seat;
  kind: PileKind;
}

const DECK_STORAGE_PREFIX = 'qimai.customDeck.';

export function loadStoredDeck(charId: CharacterId): Record<string, number> {
  try {
    const raw = localStorage.getItem(`${DECK_STORAGE_PREFIX}${charId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const val = validateMainDeck(parsed, charId);
        if (val.ok) return parsed;
      }
    }
  } catch {
    /* 無痕模式或某些測試環境沒有 localStorage */
  }
  return { ...CHARACTER_MAIN_DECKS[charId] };
}

export function saveStoredDeck(charId: CharacterId, deck: Record<string, number>): void {
  try {
    localStorage.setItem(`${DECK_STORAGE_PREFIX}${charId}`, JSON.stringify(deck));
  } catch {
    /* ignore */
  }
}

export function resetStoredDeck(charId: CharacterId): void {
  try {
    localStorage.removeItem(`${DECK_STORAGE_PREFIX}${charId}`);
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────
// 對局節奏
// ─────────────────────────────────────────────

/** NPC 每個動作之間的基礎間隔（會被速度設定乘算） */
const BASE_STEP_DELAY = 620;

/** 戰鬥結算後停留的基礎時間，讓玩家看清楚傷害與防禦 */
const BASE_SETTLE_DELAY = 950;

/** 飄字停留時間 */
const POPUP_LIFETIME = 1500;

/** 可調的對局節奏。AI 動作太快會讓人看不清楚到底發生了什麼 */
export type NpcSpeed = 'fast' | 'normal' | 'slow' | 'verySlow';

export const SPEED_OPTIONS: readonly { value: NpcSpeed; label: string; multiplier: number }[] = [
  { value: 'fast', label: '快', multiplier: 0.6 },
  { value: 'normal', label: '一般', multiplier: 1 },
  { value: 'slow', label: '慢', multiplier: 1.9 },
  { value: 'verySlow', label: '很慢', multiplier: 3.2 },
];

/** 取得某個節奏設定對應的倍率 */
export function speedMultiplier(speed: NpcSpeed): number {
  return (SPEED_OPTIONS.find((o) => o.value === speed) ?? SPEED_OPTIONS[1]).multiplier;
}

const SPEED_STORAGE_KEY = 'qimai.npc-speed';

/** 預設「慢」：第一次玩的人需要時間看懂對手在做什麼 */
const DEFAULT_SPEED: NpcSpeed = 'slow';

function loadSpeed(): NpcSpeed {
  try {
    const raw = localStorage.getItem(SPEED_STORAGE_KEY);
    if (raw && SPEED_OPTIONS.some((o) => o.value === raw)) return raw as NpcSpeed;
  } catch {
    /* 無痕模式或某些測試環境沒有 localStorage */
  }
  return DEFAULT_SPEED;
}

function saveSpeed(speed: NpcSpeed): void {
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, speed);
  } catch {
    /* 寫不進去不影響遊戲 */
  }
}

/** 效果發動時飄出的視覺提示 */
export interface FxPopup {
  id: number;
  seat: Seat;
  text: string;
  kind: 'damage' | 'quest' | 'fail' | 'combo' | 'rebuild';
}

@Injectable({ providedIn: 'root' })
export class GameStore {
  readonly p2p = inject(P2PService);

  private readonly _state = signal<GameState>(createGame(GameStore.randomSeed()));

  readonly state = this._state.asReadonly();

  /** 對戰模式：單機或連線 */
  readonly gameMode = signal<'solo' | 'p2p'>('solo');

  /** 當前客戶端的座位（單機為 player；連線房主為 player，客人為 npc） */
  readonly mySeat = signal<Seat>('player');

  /** 對手的座位 */
  readonly opponentSeat = computed<Seat>(() => (this.mySeat() === 'player' ? 'npc' : 'player'));

  /** 是否為 P2P 房主 */
  readonly isHost = computed(() => this.gameMode() === 'p2p' && this.mySeat() === 'player');

  /** 是否為 P2P 客人 */
  readonly isGuest = computed(() => this.gameMode() === 'p2p' && this.mySeat() === 'npc');

  /** NPC 正在思考（UI 用來鎖住玩家操作，僅限單機 AI 回合） */
  readonly npcThinking = signal(false);

  /** 目前畫面上的效果飄字 */
  readonly popups = signal<FxPopup[]>([]);

  /** 戰鬥結算序號：每次結算遞增，用來強制重播傷害動畫 */
  readonly combatSeq = signal(0);

  /** 對局節奏，影響 NPC 動作間隔與戰鬥結算的停頓 */
  readonly npcSpeed = signal<NpcSpeed>(loadSpeed());

  /** 玩家與 NPC 選擇的角色 */
  readonly playerChar = signal<CharacterId>('rage');
  readonly npcChar = signal<CharacterId>('mage');

  /** P2P 房主收到的客人自訂牌組；null 表示沒收到或驗證不過，開局改用角色預設牌組 */
  private guestDeck: Record<string, number> | null = null;

  /** 正在查看的堆疊區，null 表示沒開 */
  readonly pileView = signal<PileView | null>(null);

  /** 重構待決：非 null 時遊戲暫停，等玩家挑一張生命卡加入手牌 */
  readonly pendingRebuild = computed(() => this._state().pendingRebuild);

  /** 其他待決選擇（開局生命區、檢索） */
  readonly pendingChoice = computed(() => this._state().pending);

  // ── 衍生的檢視狀態（視角自適應） ──
  readonly phase = computed(() => this._state().phase);
  readonly turn = computed(() => this._state().turn);
  readonly activeSeat = computed(() => this._state().activeSeat);
  readonly winner = computed(() => this._state().winner);
  readonly combat = computed(() => this._state().combat);
  readonly log = computed(() => this._state().log);

  /** 依自己座位取出的我方盤面 */
  readonly mySide = computed(() => this._state().sides[this.mySeat()]);
  /** 依自己座位取出的對手盤面 */
  readonly opponentSide = computed(() => this._state().sides[this.opponentSeat()]);

  /** 我方的角色流派 */
  readonly myChar = computed(() => (this.mySeat() === 'player' ? this.playerChar() : this.npcChar()));
  /** 對手的角色流派 */
  readonly opponentChar = computed(() => (this.mySeat() === 'player' ? this.npcChar() : this.playerChar()));

  /** 相容舊程式碼的 getter */
  readonly player = computed(() => this._state().sides.player);
  readonly npc = computed(() => this._state().sides.npc);

  /** 目前是否輪到自己操作 */
  readonly isMyTurn = computed(() => !this._state().winner && this._state().activeSeat === this.mySeat());

  /** 玩家現在是否可以主動出牌／出招／換階段 */
  readonly playerCanAct = computed(() => {
    const s = this._state();
    const seat = this.mySeat();
    return (
      !s.winner &&
      s.activeSeat === seat &&
      (this.gameMode() === 'p2p' || !this.npcThinking()) &&
      s.pendingRebuild === null &&
      s.pending === null
    );
  });

  /** 目前節奏的說明文字，設定面板顯示用 */
  readonly speedLabel = computed(() => {
    const opt = SPEED_OPTIONS.find((o) => o.value === this.npcSpeed());
    return opt?.label ?? '一般';
  });

  // ── 內部計數器 ──
  private popupId = 0;
  private logCursor = 0;

  constructor() {
    this.logCursor = this._state().log.length;
    this.p2p.onMessage((msg) => this.handleP2PMessage(msg));
    this.afterChange();
  }

  // ── 牌組管理 ──

  getCustomDeck(charId: CharacterId): Record<string, number> {
    return loadStoredDeck(charId);
  }

  saveCustomDeck(charId: CharacterId, deck: Record<string, number>): void {
    saveStoredDeck(charId, deck);
  }

  resetCustomDeck(charId: CharacterId): void {
    resetStoredDeck(charId);
  }

  newGame(seed?: number, playerChar?: CharacterId, npcChar?: CharacterId, customDeck?: Readonly<Record<string, number>>): void {
    this.gameMode.set('solo');
    this.mySeat.set('player');
    if (playerChar) this.playerChar.set(playerChar);
    if (npcChar) this.npcChar.set(npcChar);
    this.npcThinking.set(false);
    this.popups.set([]);
    const pDeck = customDeck ?? this.getCustomDeck(this.playerChar());
    const next = createGame(seed ?? GameStore.randomSeed(), {
      playerCharacter: this.playerChar(),
      npcCharacter: this.npcChar(),
      mainDeck: pDeck,
    });
    this.logCursor = next.log.length;
    this._state.set(next);
    this.afterChange();
  }

  /** P2P 房主啟動連線對局 */
  startP2PGame(hostChar: CharacterId, guestChar: CharacterId, seed?: number, hostDeck?: Readonly<Record<string, number>>): void {
    this.gameMode.set('p2p');
    this.mySeat.set('player');
    this.playerChar.set(hostChar);
    this.npcChar.set(guestChar);
    this.npcThinking.set(false);
    this.popups.set([]);

    const actualSeed = seed ?? GameStore.randomSeed();
    const hDeck = hostDeck ?? this.getCustomDeck(hostChar);
    const next = createGame(actualSeed, {
      playerCharacter: hostChar,
      npcCharacter: guestChar,
      manualLifeSetupBoth: true,
      mode: 'p2p',
      mainDeck: hDeck,
      npcMainDeck: this.guestDeck ?? undefined,
    });
    this.logCursor = next.log.length;
    this._state.set(next);

    this.p2p.send({
      type: 'GAME_START',
      seed: actualSeed,
      hostHero: hostChar,
      guestHero: guestChar,
      state: next,
    });
  }

  /** P2P 客人收到開局訊息初始化 */
  initAsP2PGuest(seed: number, hostHero: CharacterId, guestHero: CharacterId, state: GameState): void {
    this.gameMode.set('p2p');
    this.mySeat.set('npc');
    this.playerChar.set(hostHero);
    this.npcChar.set(guestHero);
    this.npcThinking.set(false);
    this.popups.set([]);
    this.applyRemoteState(state);
  }

  /** 接收來自對方的盤面狀態更新 */
  applyRemoteState(state: GameState, popups?: FxPopup[], combatSeq?: number): void {
    this.logCursor = state.log.length;
    this._state.set({
      ...state,
      sides: {
        player: { ...state.sides.player },
        npc: { ...state.sides.npc },
      },
    });
    if (popups) {
      this.popups.set(popups);
    }
    if (combatSeq !== undefined) {
      this.combatSeq.set(combatSeq);
    }
  }

  /** 重播：用同一組 seed 重開，牌序會完全一樣 */
  restartSameSeed(): void {
    if (this.gameMode() === 'p2p') {
      if (this.isHost()) {
        this.startP2PGame(this.playerChar(), this.npcChar(), this._state().seed);
      }
      return;
    }
    this.newGame(this._state().seed);
  }

  /** 調整對局節奏（會記住設定） */
  setNpcSpeed(speed: NpcSpeed): void {
    this.npcSpeed.set(speed);
    saveSpeed(speed);
  }

  // ── 堆疊區檢視 ──

  openPile(seat: Seat, kind: PileKind): void {
    this.pileView.set({ seat, kind });
  }

  closePile(): void {
    this.pileView.set(null);
  }

  /** 玩家在檢索／開局對話框裡點了一張卡 */
  chooseCard(iid: number): void {
    if (this.isGuest()) {
      this.p2p.send({ type: 'ACTION', seat: 'npc', action: { type: 'CHOOSE_CARD', iid } });
      return;
    }
    this.executeChooseCard(iid);
  }

  executeChooseCard(iid: number): void {
    const s = this._state();
    if (!s.pending) return;

    resolveChoice(s, iid);
    this.publish(s);
    this.afterChange();
  }

  /** 玩家在選擇對話框裡選了替代選項（例如「不發動」） */
  chooseAlt(): void {
    if (this.isGuest()) {
      this.p2p.send({ type: 'ACTION', seat: 'npc', action: { type: 'CHOOSE_ALT' } });
      return;
    }
    this.executeChooseAlt();
  }

  executeChooseAlt(): void {
    const s = this._state();
    if (!s.pending?.alt) return;

    resolveChoiceAlt(s);
    this.publish(s);
    this.afterChange();
  }

  /** 發動我方裝備的能力（主要階段橫置發動） */
  activate(iid: number): void {
    if (!this.playerCanAct()) return;
    if (this.isGuest()) {
      this.p2p.send({ type: 'ACTION', seat: 'npc', action: { type: 'ACTIVATE', iid } });
      return;
    }
    this.executeActivate(this.mySeat(), iid);
  }

  executeActivate(seat: Seat, iid: number): void {
    this.mutate((s) => activateEquipment(s, seat, iid));
  }

  /** 我方這張裝備現在能不能發動 */
  canActivate(iid: number): boolean {
    return this.playerCanAct() && activationPlayability(this._state(), this.mySeat(), iid).ok;
  }

  /** 玩家在重構對話框裡挑好要加入手牌的生命卡 */
  chooseLifeCard(iid: number): void {
    if (this.isGuest()) {
      this.p2p.send({ type: 'ACTION', seat: 'npc', action: { type: 'CHOOSE_LIFE', iid } });
      return;
    }
    this.executeChooseLife(iid);
  }

  executeChooseLife(iid: number): void {
    const s = this._state();
    if (!s.pendingRebuild) return;

    resolveRebuild(s, iid);
    this.publish(s);
    this.afterChange();
  }

  burst(use: boolean): void {
    if (!this.playerCanAct()) return;
    if (this.isGuest()) {
      this.p2p.send({ type: 'ACTION', seat: 'npc', action: { type: 'BURST', use } });
      return;
    }
    this.executeBurst(use);
  }

  executeBurst(use: boolean): void {
    this.mutate((s) => resolveBurst(s, use));
  }

  play(iid: number): void {
    if (!this.playerCanAct()) return;
    if (this.isGuest()) {
      this.p2p.send({ type: 'ACTION', seat: 'npc', action: { type: 'PLAY', iid } });
      return;
    }
    this.executePlay(this.mySeat(), iid);
  }

  executePlay(seat: Seat, iid: number): void {
    const s = this._state();
    const inst = s.sides[seat].hand.find((c) => c.iid === iid);

    // 主要階段點擊帶有詠唱特性的招式卡，直接進行詠唱
    if (s.phase === 'main' && inst && card(inst.defId).kind === 'technique' && card(inst.defId).chant) {
      this.executeChant(seat, iid);
      return;
    }

    if (s.phase === 'combat') {
      this.mutate((st) => playTechnique(st, seat, iid));
    } else {
      this.mutate((st) => playCard(st, seat, iid));
    }
  }

  chant(iid: number): void {
    if (!this.playerCanAct()) return;
    if (this.isGuest()) {
      this.p2p.send({ type: 'ACTION', seat: 'npc', action: { type: 'CHANT', iid } });
      return;
    }
    this.executeChant(this.mySeat(), iid);
  }

  executeChant(seat: Seat, iid: number): void {
    const s = this._state();
    const res = chantTechnique(s, seat, iid);
    if (res.ok) {
      this.publish(s);
      this.afterChange();
    }
  }

  enterCombatPhase(): void {
    if (!this.playerCanAct()) return;
    if (this.isGuest()) {
      this.p2p.send({ type: 'ACTION', seat: 'npc', action: { type: 'ENTER_COMBAT' } });
      return;
    }
    this.executeEnterCombat();
  }

  executeEnterCombat(): void {
    this.mutate((s) => enterCombat(s));
  }

  attack(iid: number): void {
    if (!this.playerCanAct()) return;
    if (this.isGuest()) {
      this.p2p.send({ type: 'ACTION', seat: 'npc', action: { type: 'ATTACK', iid } });
      return;
    }
    this.executeAttack(this.mySeat(), iid);
  }

  executeAttack(seat: Seat, iid: number): void {
    this.mutate((s) => playTechnique(s, seat, iid));
  }

  /** 結束戰鬥階段：先結算並顯示結果，依節奏停頓後換手 */
  endCombatPhase(): void {
    if (!this.playerCanAct()) return;
    if (this.isGuest()) {
      this.p2p.send({ type: 'ACTION', seat: 'npc', action: { type: 'END_COMBAT' } });
      return;
    }
    this.executeEndCombat();
  }

  executeEndCombat(): void {
    const s = this._state();
    if (s.phase !== 'combat') return;

    finishCombat(s);
    this.settleCombatFx(s);
    this.publish(s);

    if (s.winner) return;

    const actingSeat = s.activeSeat;
    setTimeout(
      () => {
        const cur = this._state();
        if (cur.winner || cur.activeSeat !== actingSeat) return;
        clearCombat(cur);
        endTurnFully(cur);
        this.publish(cur);
        this.afterChange();
      },
      this.scaled(BASE_SETTLE_DELAY),
    );
  }

  /** 直接結束整個回合（主要階段也能用） */
  endTurn(): void {
    if (!this.playerCanAct()) return;
    if (this.isGuest()) {
      this.p2p.send({ type: 'ACTION', seat: 'npc', action: { type: 'END_TURN' } });
      return;
    }
    this.executeEndTurn();
  }

  executeEndTurn(): void {
    this.mutate((s) => endTurnFully(s));
  }

  // ─────────────────────────────────────────────
  // 查詢（給模板用）
  // ─────────────────────────────────────────────

  /** 取任務卡定義，模板顯示「完成／阻止」條件用 */
  questDef(defId: string) {
    return card(defId).quest;
  }

  /** 這張手牌現在能不能出（針對我方手牌） */
  canPlay(iid: number): boolean {
    if (!this.playerCanAct()) return false;
    const s = this._state();
    const seat = this.mySeat();
    const inst = s.sides[seat].hand.find((c) => c.iid === iid);
    if (!inst) return false;

    const def = card(inst.defId);

    if (s.phase === 'combat') {
      return def.kind === 'technique' && techniquePlayability(s, seat, iid).ok;
    }
    if (s.phase !== 'main') return false;

    // 主要階段：招式卡走詠唱，其他卡走一般打出（檢查與 engine 共用，不會不一致）
    return def.kind === 'technique' ? chantPlayability(s, seat, iid).ok : cardPlayability(s, seat, iid).ok;
  }

  // ─────────────────────────────────────────────
  // 效果飄字
  // ─────────────────────────────────────────────

  private addPopup(seat: Seat, text: string, kind: FxPopup['kind']): void {
    const id = ++this.popupId;
    this.popups.update((list) => [...list, { id, seat, text, kind }]);
    setTimeout(() => {
      this.popups.update((list) => list.filter((p) => p.id !== id));
    }, POPUP_LIFETIME);
  }

  /** 戰鬥結算後，把傷害數字與連招提示丟出來 */
  private settleCombatFx(s: GameState): void {
    const cb = s.combat;
    if (!cb) return;

    this.combatSeq.update((n) => n + 1);

    if (cb.plays.length === 0) return;

    if (cb.comboFormed) {
      this.addPopup(cb.attacker, '連招成立！', 'combo');
    }

    if (cb.damage > 0) {
      this.addPopup(cb.defender, `−${cb.damage}`, 'damage');
    } else {
      this.addPopup(cb.defender, '完全防禦', 'rebuild');
    }
  }

  /** 從新增的日誌條目推導出視覺提示 */
  private emitFromLog(entries: LogEntry[]): void {
    for (const e of entries) {
      const seat = e.seat ?? 'player';

      if (e.text.includes('【任務完成】')) this.addPopup(seat, '任務完成！等級提升', 'quest');
      else if (e.text.includes('【任務失敗】')) this.addPopup(seat, '任務失敗', 'fail');
      else if (e.text.includes('【重構】')) this.addPopup(seat, '重構', 'rebuild');
    }
  }

  // ─────────────────────────────────────────────
  // 內部與 P2P 通訊處理
  // ─────────────────────────────────────────────

  private handleP2PMessage(msg: P2PMessage): void {
    if (msg.type === 'GUEST_HELLO') {
      this.npcChar.set(msg.hero);
      // 牌組來自網路，房主端再驗證一次，避免非法牌組讓引擎出錯
      this.guestDeck = msg.deck && validateMainDeck(msg.deck, msg.hero).ok ? msg.deck : null;
    } else if (msg.type === 'GAME_START') {
      this.initAsP2PGuest(msg.seed, msg.hostHero, msg.guestHero, msg.state);
    } else if (msg.type === 'ACTION') {
      if (this.isHost()) {
        this.handleGuestAction(msg.action);
      }
    } else if (msg.type === 'SYNC_STATE') {
      if (this.isGuest()) {
        this.applyRemoteState(msg.state, msg.popups, msg.combatSeq);
      }
    } else if (msg.type === 'RESTART') {
      if (this.isGuest()) {
        this.applyRemoteState(msg.state);
      }
    }
  }

  private handleGuestAction(action: GameAction): void {
    switch (action.type) {
      case 'PLAY':
        this.executePlay('npc', action.iid);
        break;
      case 'CHANT':
        this.executeChant('npc', action.iid);
        break;
      case 'ATTACK':
        this.executeAttack('npc', action.iid);
        break;
      case 'BURST':
        this.executeBurst(action.use);
        break;
      case 'ENTER_COMBAT':
        this.executeEnterCombat();
        break;
      case 'END_COMBAT':
        this.executeEndCombat();
        break;
      case 'END_TURN':
        this.executeEndTurn();
        break;
      case 'CHOOSE_CARD':
        this.executeChooseCard(action.iid);
        break;
      case 'CHOOSE_ALT':
        this.executeChooseAlt();
        break;
      case 'ACTIVATE':
        this.executeActivate('npc', action.iid);
        break;
      case 'CHOOSE_LIFE':
        this.executeChooseLife(action.iid);
        break;
    }
  }

  private static randomSeed(): number {
    return Math.floor(Math.random() * 0xffffffff) >>> 0;
  }

  /** 依目前節奏設定換算實際延遲 */
  private scaled(base: number): number {
    return Math.round(base * speedMultiplier(this.npcSpeed()));
  }

  private mutate(fn: (s: GameState) => void): void {
    const s = this._state();
    fn(s);
    this.publish(s);
    this.afterChange();
  }

  /** 用新參照發布，觸發 Signals 更新；同時比對新增日誌以產生飄字，若身為房主則廣播狀態 */
  private publish(s: GameState): void {
    const fresh = s.log.slice(this.logCursor);
    this.logCursor = s.log.length;

    const combat = s.combat
      ? {
          ...s.combat,
          plays: [...s.combat.plays],
          chantPlays: [...s.combat.chantPlays],
          defenseCards: [...s.combat.defenseCards],
        }
      : null;

    this._state.set({
      ...s,
      combat,
      // 事件區的指示物是就地修改的，不換參照的話依賴它的 computed 收不到通知
      eventZone: s.eventZone ? { ...s.eventZone } : null,
      sides: {
        player: { ...s.sides.player },
        npc: { ...s.sides.npc },
      },
    });

    if (fresh.length > 0) this.emitFromLog(fresh);

    if (this.isHost()) {
      this.p2p.send({
        type: 'SYNC_STATE',
        state: this._state(),
        popups: this.popups(),
        combatSeq: this.combatSeq(),
      });
    }
  }

  private afterChange(): void {
    const s = this._state();
    if (s.winner) return;
    if (this.gameMode() === 'solo' && s.activeSeat === 'npc') {
      this.runNpcSequence();
    }
  }

  /**
   * NPC 回合分步執行（僅在單機模式生效）：每個階段之間留一段延遲，
   * 讓玩家能從日誌與場面看到對手逐步做事，而不是瞬間跳完。
   * 延遲長度由 npcSpeed 設定控制。
   */
  private runNpcSequence(): void {
    this.npcThinking.set(true);

    const step = (): void => {
      const s = this._state();
      if (s.winner || s.activeSeat !== 'npc') {
        this.npcThinking.set(false);
        return;
      }

      if (s.phase === 'burst') {
        resolveBurst(s, npcShouldBurst(s));
        this.publish(s);
        setTimeout(step, this.scaled(BASE_STEP_DELAY));
        return;
      }

      if (s.phase === 'main') {
        npcMainPhase(s);
        if (!s.winner) enterCombat(s);
        this.publish(s);
        setTimeout(step, this.scaled(BASE_STEP_DELAY));
        return;
      }

      if (s.phase === 'combat') {
        npcCombatPhase(s);
        finishCombat(s);
        this.settleCombatFx(s);
        this.publish(s);
        setTimeout(
          () => {
            const cur = this._state();
            if (cur.winner || cur.activeSeat !== 'npc') {
              this.npcThinking.set(false);
              return;
            }
            clearCombat(cur);
            endTurnFully(cur);
            this.publish(cur);
            this.npcThinking.set(false);
            this.afterChange();
          },
          this.scaled(BASE_SETTLE_DELAY),
        );
        return;
      }

      this.npcThinking.set(false);
    };

    setTimeout(step, this.scaled(BASE_STEP_DELAY));
  }
}

export type { CardInstance, GameState, Seat };
