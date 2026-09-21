import { Injectable, computed, signal } from '@angular/core';

import { npcCombatPhase, npcMainPhase, npcShouldBurst } from './game/ai';
import { card } from './game/cards';
import { clearCombat, finishCombat, playTechnique, techniquePlayability } from './game/combat';
import {
  chantTechnique,
  createGame,
  endTurnFully,
  enterCombat,
  playCard,
  resolveBurst,
  resolveChoice,
  resolveRebuild,
} from './game/engine';
import { canPlayWithCooldown, modifier } from './game/internal';
import type { CardInstance, CharacterId, GameState, LogEntry, Seat } from './game/types';
import { RULES } from './game/types';

/** 可以點開查看內容的堆疊區 */
export type PileKind = 'deck' | 'anger' | 'discard' | 'life' | 'level' | 'questDeck' | 'cooldown' | 'chant';

export interface PileView {
  seat: Seat;
  kind: PileKind;
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
  private readonly _state = signal<GameState>(createGame(GameStore.randomSeed()));

  readonly state = this._state.asReadonly();

  /** NPC 正在思考（UI 用來鎖住玩家操作） */
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

  /** 正在查看的堆疊區，null 表示沒開 */
  readonly pileView = signal<PileView | null>(null);

  /** 重構待決：非 null 時遊戲暫停，等玩家挑一張生命卡加入手牌 */
  readonly pendingRebuild = computed(() => this._state().pendingRebuild);

  /** 其他待決選擇（開局生命區、檢索） */
  readonly pendingChoice = computed(() => this._state().pending);

  // ── 衍生的檢視狀態 ──
  readonly phase = computed(() => this._state().phase);
  readonly turn = computed(() => this._state().turn);
  readonly activeSeat = computed(() => this._state().activeSeat);
  readonly winner = computed(() => this._state().winner);
  readonly combat = computed(() => this._state().combat);
  readonly log = computed(() => this._state().log);
  readonly player = computed(() => this._state().sides.player);
  readonly npc = computed(() => this._state().sides.npc);

  /** 玩家現在是否可以操作 */
  readonly playerCanAct = computed(() => {
    const s = this._state();
    return (
      !s.winner &&
      s.activeSeat === 'player' &&
      !this.npcThinking() &&
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
    this.afterChange();
  }

  // ─────────────────────────────────────────────
  // 對局控制
  // ─────────────────────────────────────────────

  newGame(seed?: number, playerChar?: CharacterId, npcChar?: CharacterId): void {
    if (playerChar) this.playerChar.set(playerChar);
    if (npcChar) this.npcChar.set(npcChar);
    this.npcThinking.set(false);
    this.popups.set([]);
    const next = createGame(seed ?? GameStore.randomSeed(), {
      playerCharacter: this.playerChar(),
      npcCharacter: this.npcChar(),
    });
    this.logCursor = next.log.length;
    this._state.set(next);
    this.afterChange();
  }

  /** 重播：用同一組 seed 重開，牌序會完全一樣 */
  restartSameSeed(): void {
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
    const s = this._state();
    if (!s.pending) return;

    resolveChoice(s, iid);
    this.publish(s);
    this.afterChange();
  }

  /** 玩家在重構對話框裡挑好要加入手牌的生命卡 */
  chooseLifeCard(iid: number): void {
    const s = this._state();
    if (!s.pendingRebuild) return;

    resolveRebuild(s, iid);
    this.publish(s);
    this.afterChange();
  }

  burst(use: boolean): void {
    if (!this.playerCanAct()) return;
    this.mutate((s) => resolveBurst(s, use));
  }

  play(iid: number): void {
    if (!this.playerCanAct()) return;
    const s = this._state();
    const inst = s.sides.player.hand.find((c) => c.iid === iid);

    // 主要階段點擊帶有詠唱特性的招式卡，直接進行詠唱
    if (s.phase === 'main' && inst && card(inst.defId).kind === 'technique' && card(inst.defId).chant) {
      this.chant(iid);
      return;
    }

    if (s.phase === 'combat') {
      this.mutate((st) => playTechnique(st, 'player', iid));
    } else {
      this.mutate((st) => playCard(st, 'player', iid));
    }
  }

  chant(iid: number): void {
    if (!this.playerCanAct()) return;
    const s = this._state();
    const res = chantTechnique(s, 'player', iid);
    if (res.ok) {
      this.publish(s);
      this.afterChange();
    }
  }

  enterCombatPhase(): void {
    if (!this.playerCanAct()) return;
    this.mutate((s) => enterCombat(s));
  }

  attack(iid: number): void {
    if (!this.playerCanAct()) return;
    this.mutate((s) => playTechnique(s, 'player', iid));
  }

  /** 結束戰鬥階段：先結算並顯示結果，依節奏停頓後換手 */
  endCombatPhase(): void {
    if (!this.playerCanAct()) return;

    const s = this._state();
    if (s.phase !== 'combat') return;

    finishCombat(s);
    this.settleCombatFx(s);
    this.publish(s);

    if (s.winner) return;

    setTimeout(
      () => {
        const cur = this._state();
        if (cur.winner || cur.activeSeat !== 'player') return;
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
    this.mutate((s) => endTurnFully(s));
  }

  // ─────────────────────────────────────────────
  // 查詢（給模板用）
  // ─────────────────────────────────────────────

  /** 取任務卡定義，模板顯示「完成／阻止」條件用 */
  questDef(defId: string) {
    return card(defId).quest;
  }

  /** 這張手牌現在能不能出 */
  canPlay(iid: number): boolean {
    if (!this.playerCanAct()) return false;
    const s = this._state();
    const inst = s.sides.player.hand.find((c) => c.iid === iid);
    if (!inst) return false;

    const def = card(inst.defId);

    if (s.phase === 'combat') {
      return def.kind === 'technique' && techniquePlayability(s, 'player', iid).ok;
    }
    if (s.phase !== 'main') return false;

    return this.mainPhasePlayable(s, inst);
  }

  /** 主要階段的可出牌判斷（與 engine.playCard 的檢查保持一致） */
  private mainPhasePlayable(s: GameState, inst: CardInstance): boolean {
    const def = card(inst.defId);
    const side = s.sides.player;

    if (!canPlayWithCooldown(s, 'player', inst.defId)) return false;

    if (def.kind === 'technique') {
      if (!def.chant || side.chantsUsedThisTurn >= RULES.chantsPerTurn) return false;
      const chantCost = Math.max(0, def.chant.cost + modifier(s, 'player', 'cost'));
      return side.life.filter((l) => !l.tapped).length >= chantCost;
    }

    if (def.kind === 'event' && side.eventsUsedThisTurn >= 1) return false;

    if (def.kind === 'equipment') {
      const slot = def.slot;
      if (!slot) return false;
      if (side.level < (def.levelRequirement ?? 1)) return false;
      const used = side.equipment.filter((c) => card(c.defId).slot === slot).length;
      const limits: Record<string, number> = { weapon: 1, helmet: 1, glove: 1, boots: 1, accessory: 2 };
      if (used >= (limits[slot] ?? 1)) return false;
    }

    let cost = Math.max(0, def.cost + modifier(s, 'player', 'cost'));
    if (side.freeNextCards.includes(def.id)) cost = 0;
    if (side.life.filter((l) => !l.tapped).length < cost) return false;

    const angerCost = def.angerCost ?? 0;
    if (side.anger.length < angerCost) return false;

    return true;
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
  // 內部
  // ─────────────────────────────────────────────

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

  /** 用新參照發布，觸發 Signals 更新；同時比對新增日誌以產生飄字 */
  private publish(s: GameState): void {
    const fresh = s.log.slice(this.logCursor);
    this.logCursor = s.log.length;

    // sides 也做淺拷貝。內部的陣列仍是同一份（引擎就地修改），
    // 但物件參考會變，這樣依賴 sides.player / sides.npc 的 computed
    // 才會因為 Object.is 不相等而正確通知下游。
    this._state.set({
      ...s,
      sides: {
        player: { ...s.sides.player },
        npc: { ...s.sides.npc },
      },
    });

    if (fresh.length > 0) this.emitFromLog(fresh);
  }

  private afterChange(): void {
    const s = this._state();
    if (s.winner) return;
    if (s.activeSeat === 'npc') this.runNpcSequence();
  }

  /**
   * NPC 回合分步執行：每個階段之間留一段延遲，
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
