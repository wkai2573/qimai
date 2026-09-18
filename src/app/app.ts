import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

import { CardDetailComponent } from './card-detail';
import { CardViewComponent } from './card-view';
import { cardArt } from './card-art';
import { isDragGesture, isInsideDropZone } from './drag-utils';
import { DEFAULT_CARD_WIDTH, computeHandSpacing } from './hand-layout';
import { card } from './game/cards';
import { GameStore, SPEED_OPTIONS, type FxPopup, type NpcSpeed, type PileKind } from './game-store';
import { PHASE_LABEL, RULES, type CardInstance, type Phase, type Seat } from './game/types';
import { RULE_SECTIONS } from './rules';

/** 是否已看過規則；第一次遊玩會自動打開規則說明 */
const RULES_SEEN_KEY = 'qimai.rules-seen';

function hasSeenRules(): boolean {
  try {
    return localStorage.getItem(RULES_SEEN_KEY) === '1';
  } catch {
    // 無法存取儲存空間時不要自動彈窗，免得每次重新整理都跳出來
    return true;
  }
}

function markRulesSeen(): void {
  try {
    localStorage.setItem(RULES_SEEN_KEY, '1');
  } catch {
    /* 寫不進去不影響遊戲 */
  }
}

/** 可放置的區域：招式卡放戰鬥區，其他卡放行動區 */
type DropZone = 'combat' | 'action' | null;

interface DragState {
  iid: number;
  pointerId: number;
  /** 起始位置，用來判斷是否超過拖曳門檻 */
  startX: number;
  startY: number;
  /** 指標相對卡牌左上角的位移，讓幽靈卡不會瞬間跳到游標中心 */
  grabX: number;
  grabY: number;
  /** 目前指標位置 */
  x: number;
  y: number;
  /** 是否已進入拖曳狀態 */
  active: boolean;
  /** 這張卡現在可不可以出（決定幽靈卡要不要顯示「費用不足」） */
  playable: boolean;
}

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardViewComponent, CardDetailComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    // 拖曳期間必須在 document 上追蹤，因為指標會離開原本的卡牌
    '(document:pointermove)': 'onPointerMove($event)',
    '(document:pointerup)': 'onPointerUp($event)',
    '(document:pointercancel)': 'onPointerUp($event)',
  },
})
export class App {
  private readonly sanitizer = inject(DomSanitizer);

  readonly store = inject(GameStore);

  // ── 設定面板 ──
  readonly showSettings = signal(false);
  readonly speedOptions = SPEED_OPTIONS;
  readonly npcSpeed = this.store.npcSpeed;
  readonly speedLabel = this.store.speedLabel;
  /** 直接讀引擎常數，避免 UI 文字與規則不同步 */
  readonly burstMill = RULES.burstMill;

  setSpeed(speed: NpcSpeed): void {
    this.store.setNpcSpeed(speed);
    this.showSettings.set(false);
  }

  // ── 規則說明 ──

  readonly ruleSections = RULE_SECTIONS;
  readonly showRules = signal(!hasSeenRules());

  openRules(): void {
    this.showRules.set(true);
    markRulesSeen();
  }

  closeRules(): void {
    this.showRules.set(false);
  }

  /** 目前階段該做什麼的即時提示，顯示在控制列 */
  readonly phaseHint = computed(() => {
    switch (this.store.phase()) {
      case 'burst':
        return `可丟棄牌組頂 ${RULES.burstMill} 張來抽 1 張，或直接跳過。`;
      case 'main':
        return '點手牌看資訊，拖到中央戰鬥區或按「使用這張卡」出牌。費用＝橫置生命卡。';
      case 'combat':
        return '依 特技 → 密技 → 奧義 → 密奧義 的順序出招，或直接結束戰鬥。';
      default:
        return '';
    }
  });

  readonly phase = this.store.phase;
  readonly phaseLabel = computed(() => PHASE_LABEL[this.store.phase()]);

  /**
   * 一個回合的階段順序（不含開局的 setup 與結束的 ended）。
   * reset 與 draw 是自動執行、瞬間完成的，玩家看到時通常已經進行到 burst 之後，
   * 但進度條仍會把它們標成「已完成」，完整呈現這個回合走過哪些步驟。
   */
  readonly turnPhases: readonly Phase[] = ['reset', 'draw', 'burst', 'main', 'combat'];

  /** 目前階段在流程中的索引；-1 表示不在回合流程中（開局或已結束） */
  readonly phaseIndex = computed(() => this.turnPhases.indexOf(this.store.phase()));

  phaseName(p: Phase): string {
    return PHASE_LABEL[p];
  }

  readonly turn = this.store.turn;
  readonly winner = this.store.winner;
  readonly combat = this.store.combat;
  readonly log = this.store.log;
  readonly player = this.store.player;
  readonly npc = this.store.npc;
  readonly npcThinking = this.store.npcThinking;
  readonly popups = this.store.popups;
  readonly activeSeat = this.store.activeSeat;

  /**
   * 手牌。
   *
   * 刻意回傳**副本**：引擎是就地修改手牌陣列（push / splice），參考永遠不變，
   * 若直接回傳原陣列，computed 會因為 Object.is 相等而不通知下游，
   * 排版 effect 就不會重跑——抽到新牌時手牌會來不及收窄而溢出畫面。
   */
  readonly hand = computed(() => [...this.store.player().hand]);

  /** 手牌列容器，用來量測可用寬度 */
  readonly handRow = viewChild<ElementRef<HTMLElement>>('handRow');

  /** 戰鬥區（招式卡） */
  readonly combatZone = viewChild<ElementRef<HTMLElement>>('combatZone');

  /** 行動區（裝備／行動／事件／任務卡） */
  readonly actionZone = viewChild<ElementRef<HTMLElement>>('actionZone');

  /**
   * 每張手牌之間的間距（px）。
   * 正值 = 正常間隔；負值 = 空間不足時互相重疊。
   * 由 updateHandLayout() 依容器實際寬度即時計算，不是寫死的。
   */
  readonly handSpacing = signal(6);

  // ── 拖曳出招 ──

  /** 目前的拖曳狀態，null 表示沒有在拖 */
  readonly drag = signal<DragState | null>(null);

  /** 指標目前停在哪個放置區（null = 不在任何區上） */
  readonly dropZone = signal<DropZone>(null);

  /** 被拖曳中的那張卡（幽靈卡顯示用） */
  readonly dragInst = computed<CardInstance | null>(() => {
    const d = this.drag();
    return d ? this.findCard(d.iid) : null;
  });

  /**
   * 拖曳結束後瀏覽器仍會補一個 click，若不攔掉就會順便開啟詳細面板。
   * 這是一次性的旗標，只在緊接的那次 click 生效。
   */
  private ignoreNextClick = false;

  constructor() {
    // 容器尺寸改變（視窗縮放、日誌欄收合…）時重算
    effect((onCleanup) => {
      const el = this.handRow()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;

      const observer = new ResizeObserver(() => this.scheduleLayout());
      observer.observe(el);
      this.scheduleLayout();
      onCleanup(() => observer.disconnect());
    });

    // 手牌張數改變時重算
    effect(() => {
      this.hand();
      this.scheduleLayout();
    });
  }

  /** 等 DOM 更新後再量測，避免讀到過期的寬度 */
  private scheduleLayout(): void {
    requestAnimationFrame(() => this.updateHandLayout());
  }

  /**
   * 手牌排版：寬度夠就正常排開，放不下才開始重疊。
   * 重疊上限為卡寬的 60%，避免卡牌被壓到看不見。
   */
  private updateHandLayout(): void {
    const el = this.handRow()?.nativeElement;
    if (!el) return;

    // 只有卡牌外層有 anim-deal，空手牌提示不會被誤判
    const cards = Array.from(el.children).filter((c) => c.classList.contains('anim-deal')) as HTMLElement[];

    if (cards.length <= 1) {
      this.handSpacing.set(0);
      return;
    }

    const cardWidth = cards[0].offsetWidth || DEFAULT_CARD_WIDTH;
    this.handSpacing.set(computeHandSpacing(cards.length, cardWidth, el.clientWidth));
  }

  /** 日誌最新的排最前面，玩家不必捲動就看得到剛剛發生什麼 */
  readonly logNewestFirst = computed(() => [...this.store.log()].reverse().slice(0, 60));

  readonly resultText = computed(() => {
    const w = this.store.winner();
    if (!w) return '';
    return w === 'player' ? '你贏了！' : '你輸了。';
  });

  /** 場上小圖示（生命區、裝備區）用 */
  private readonly artCache = new Map<string, SafeHtml>();

  artOf(defId: string): SafeHtml {
    let cached = this.artCache.get(defId);
    if (!cached) {
      cached = this.sanitizer.bypassSecurityTrustHtml(cardArt(defId));
      this.artCache.set(defId, cached);
    }
    return cached;
  }

  nameOf(defId: string): string {
    return card(defId).name;
  }

  // ─────────────────────────────────────────────
  // 卡片查詢
  // ─────────────────────────────────────────────

  /**
   * 從遊戲狀態各區域找出指定 iid 的卡。
   * 用 iid 查而不是直接存物件，這樣卡片被移動或消滅時會自動失效。
   */
  private findCard(iid: number): CardInstance | null {
    const s = this.store.state();

    for (const seat of ['player', 'npc'] as const) {
      const side = s.sides[seat];
      const pool: CardInstance[] = [
        ...side.hand,
        ...side.life.map((l) => l.card),
        ...side.equipment,
        ...side.levelZone,
        ...side.questDeck,
        ...side.deck,
        ...side.anger,
        ...side.discard,
        ...(side.currentQuest ? [side.currentQuest] : []),
      ];
      const hit = pool.find((c) => c.iid === iid);
      if (hit) return hit;
    }

    return null;
  }

  // ─────────────────────────────────────────────
  // 卡片操作
  // ─────────────────────────────────────────────

  /**
   * 點手牌：直接使用（主要階段）或出招（戰鬥階段）。
   *
   * 卡片資訊改由滑鼠移入的浮層提供，所以點擊不需要再「先選取、再看資訊、再按按鈕」。
   * 拖曳出牌仍然可用，兩種操作並存。
   */
  executeCard(iid: number): void {
    // 剛拖曳完的那次 click 不是真的點擊
    if (this.ignoreNextClick) {
      this.ignoreNextClick = false;
      return;
    }
    this.execute(iid);
  }

  // ─────────────────────────────────────────────
  // 拖曳出招
  // ─────────────────────────────────────────────

  /** 手牌被按下：開始追蹤拖曳（是否真的拖動要等超過門檻） */
  onCardPointerDown(ev: PointerEvent, iid: number): void {
    this.ignoreNextClick = false;

    if (!this.store.playerCanAct()) return;

    const button = (ev.target as HTMLElement).closest('button');
    const rect = button?.getBoundingClientRect();
    if (!rect) return;

    this.drag.set({
      iid,
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      grabX: ev.clientX - rect.left,
      grabY: ev.clientY - rect.top,
      x: ev.clientX,
      y: ev.clientY,
      active: false,
      // 即使出不起也允許拖曳，這樣才能顯示「費用不足」而不是毫無反應
      playable: this.store.canPlay(iid),
    });
  }

  onPointerMove(ev: PointerEvent): void {
    const d = this.drag();
    if (!d || ev.pointerId !== d.pointerId) return;

    const active = d.active || isDragGesture(d.startX, d.startY, ev.clientX, ev.clientY);

    this.drag.set({ ...d, x: ev.clientX, y: ev.clientY, active });

    if (!active) return;

    // 只有「這張卡該去的那一區」才會亮起來；拖錯地方不會有任何回饋
    const target = this.zoneFor(d.iid);
    this.dropZone.set(target && this.isOverZone(target, ev.clientX, ev.clientY) ? target : null);
  }

  onPointerUp(ev: PointerEvent): void {
    const d = this.drag();
    if (!d || ev.pointerId !== d.pointerId) return;

    const zone = d.active ? this.dropZone() : null;

    // 拖曳過的話，等等那個補發的 click 要忽略
    if (d.active) this.ignoreNextClick = true;

    this.drag.set(null);
    this.dropZone.set(null);

    // 放對區域「而且」出得起，才真的執行
    if (zone && d.playable) {
      this.execute(d.iid);
    }
  }

  /**
   * 這張卡應該放到哪一區。
   * 招式卡走戰鬥區、其他卡走行動區；階段不對時回傳 null，拖了也不會有反應。
   */
  private zoneFor(iid: number): Exclude<DropZone, null> | null {
    const inst = this.findCard(iid);
    if (!inst) return null;

    const isTechnique = card(inst.defId).kind === 'technique';
    const phase = this.store.phase();

    if (phase === 'combat') return isTechnique ? 'combat' : null;
    if (phase === 'main') return isTechnique ? null : 'action';

    return null;
  }

  /** 指標是否落在指定的放置區內（判定範圍略微外擴，讓拖放好操作） */
  private isOverZone(zone: Exclude<DropZone, null>, x: number, y: number): boolean {
    const el = (zone === 'combat' ? this.combatZone() : this.actionZone())?.nativeElement;
    if (!el) return false;

    return isInsideDropZone(x, y, el.getBoundingClientRect());
  }

  /** 依目前階段決定這張卡要「出招」還是「使用」 */
  private execute(iid: number): void {
    if (this.store.phase() === 'combat') {
      this.store.attack(iid);
    } else {
      this.store.play(iid);
    }
  }


  // ─────────────────────────────────────────────
  // 堆疊區檢視（牌組／怒氣／棄牌／生命）
  // ─────────────────────────────────────────────

  readonly pileView = this.store.pileView;

  /** 目前開啟的堆疊區內容 */
  readonly pileCards = computed<CardInstance[]>(() => {
    const view = this.pileView();
    if (!view) return [];

    const side = this.store.state().sides[view.seat];
    switch (view.kind) {
      case 'deck':
        return side.deck;
      case 'anger':
        return side.anger;
      case 'discard':
        return side.discard;
      case 'life':
        return side.life.map((l) => l.card);
      case 'level':
        return side.levelZone;
      case 'questDeck':
        return side.questDeck;
      default:
        return [];
    }
  });

  readonly pileTitle = computed(() => {
    const view = this.pileView();
    if (!view) return '';

    const who = view.seat === 'player' ? '你的' : '對手的';
    const names: Record<PileKind, string> = {
      deck: '牌組',
      anger: '怒氣區',
      discard: '棄牌區',
      life: '生命區',
      level: '已達成任務',
      questDeck: '任務牌組',
    };
    return `${who}${names[view.kind]}（${this.pileCards().length} 張）`;
  });

  /** 牌組內容是隱藏資訊，不提供檢視 */
  readonly pileHidden = computed(() => this.pileView()?.kind === 'deck');

  openPile(seat: Seat, kind: PileKind): void {
    this.store.openPile(seat, kind);
  }

  closePile(): void {
    this.store.closePile();
  }

  // ─────────────────────────────────────────────
  // 重構（扣血）時的生命卡選擇
  // ─────────────────────────────────────────────

  readonly pendingRebuild = this.store.pendingRebuild;

  /** 重構對話框要顯示的候選生命卡 */
  readonly rebuildOptions = computed<CardInstance[]>(() => {
    const pending = this.pendingRebuild();
    if (!pending) return [];
    return this.store.state().sides[pending.seat].life.map((l) => l.card);
  });

  chooseLifeCard(iid: number): void {
    this.store.chooseLifeCard(iid);
  }

  // ─────────────────────────────────────────────
  // 通用選擇（開局生命區、檢索）
  // ─────────────────────────────────────────────

  readonly pendingChoice = this.store.pendingChoice;

  /** 可以選的卡 */
  readonly choiceCandidates = computed<CardInstance[]>(() => this.pendingChoice()?.candidates ?? []);

  /** 已經點選的卡（用 Set 方便模板判斷） */
  readonly choiceSelected = computed(() => new Set(this.pendingChoice()?.selected ?? []));

  /** 點一張卡：加入選取，選滿就自動結算 */
  chooseCard(iid: number): void {
    this.store.chooseCard(iid);
  }

  // ─────────────────────────────────────────────
  // 卡片詳細浮層（滑鼠移入時顯示）
  // ─────────────────────────────────────────────

  readonly tooltipCard = signal<{ inst: CardInstance; x: number; y: number } | null>(null);

  /**
   * 自製小卡（生命區、裝備區、任務卡）的 hover。
   * 這些不是 CardView 元件，所以要自己把位置換算成浮層需要的格式。
   */
  onChipHover(ev: MouseEvent, iid: number): void {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.onCardHover({ iid, rect });
  }

  /**
   * 滑鼠移到卡片上時計算浮層位置：優先在卡片右側，空間不足就翻到左側，
   * 並夾在視窗範圍內，避免浮層被切掉。
   */
  onCardHover(info: { iid: number; rect: DOMRect } | null): void {
    if (!info) {
      this.tooltipCard.set(null);
      return;
    }

    const inst = this.findCard(info.iid);
    if (!inst) {
      this.tooltipCard.set(null);
      return;
    }

    const W = 260;
    const H = 380;
    const GAP = 12;
    const EDGE = 8;

    let x = info.rect.right + GAP;
    if (x + W > window.innerWidth - EDGE) x = info.rect.left - W - GAP;
    if (x < EDGE) x = EDGE;

    let y = info.rect.top;
    if (y + H > window.innerHeight - EDGE) y = window.innerHeight - H - EDGE;
    if (y < EDGE) y = EDGE;

    this.tooltipCard.set({ inst, x, y });
  }

  logToneClass(tone: string): string {
    switch (tone) {
      case 'combat':
        return 'text-rose-300';
      case 'quest':
        return 'text-amber-300';
      case 'rebuild':
        return 'text-fuchsia-300';
      case 'system':
        return 'text-sky-300';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  }

  /** 飄字顏色 */
  popupClass(kind: FxPopup['kind']): string {
    switch (kind) {
      case 'damage':
        return 'text-rose-400 text-4xl font-black';
      case 'quest':
        return 'text-amber-300 text-2xl font-bold';
      case 'fail':
        return 'text-slate-400 text-xl font-bold';
      case 'combo':
        return 'text-yellow-300 text-2xl font-black';
      default:
        return 'text-fuchsia-300 text-xl font-bold';
    }
  }
}
