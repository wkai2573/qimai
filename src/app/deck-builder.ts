import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { cardArt } from './card-art';
import {
  CHARACTER_MAIN_DECKS,
  cardAffiliation,
  getCardPoolForCharacter,
  tryCard,
  validateMainDeck,
  type DeckValidation,
} from './game/cards';
import { CHARACTERS } from './game/characters';
import {
  CARD_KIND_LABEL,
  EQUIP_LABEL,
  RULES,
  TECHNIQUE_LABEL,
  type CardDef,
  type CardKind,
  type CharacterId,
  type EquipSlot,
  type TechniqueTier,
} from './game/types';

export interface CardHoverEvent {
  defId: string;
  x: number;
  y: number;
}

@Component({
  selector: 'app-deck-builder',
  standalone: true,
  template: `
    <div class="deck-builder flex h-full max-h-[90vh] flex-col overflow-hidden rounded-xl border border-amber-500/40 bg-slate-900/98 shadow-2xl backdrop-blur-lg">
      <!-- 頂部標題與狀態列 -->
      <header class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/80 px-5 py-3">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/50 bg-amber-950/40 text-lg shadow">
            🎴
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-black text-amber-300">
                【{{ characterDef().title }}】牌組構築
              </h2>
              <span
                class="tag tag--sm"
                [class]="characterDef().colorName === 'rose' ? 'tag--rose' : characterDef().colorName === 'sky' ? 'tag--sky' : 'tag--emerald'"
              >
                {{ characterDef().badge }}
              </span>
            </div>
            <p class="text-[11px] text-slate-400">
              調整你的對戰牌組 · 支援右鍵快速加入/移出與拖曳操作
            </p>
          </div>
        </div>

        <!-- 牌組計數與驗證狀態 -->
        <div class="flex items-center gap-2 sm:gap-4">
          <!-- 總張數 -->
          <div
            class="flex items-baseline gap-1 rounded-lg border px-3 py-1.5 transition-colors"
            [class]="totalCards() === 50 ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-300' : 'border-amber-500/60 bg-amber-950/40 text-amber-300'"
          >
            <span class="text-xs font-bold">總張數：</span>
            <span class="text-base font-black tabular-nums">{{ totalCards() }}</span>
            <span class="text-xs font-semibold text-slate-400">/ 50</span>
          </div>

          <!-- 密奧義張數 -->
          <div
            class="flex items-baseline gap-1 rounded-lg border px-3 py-1.5 transition-colors"
            [class]="hiddenCount() <= 3 ? 'border-purple-500/50 bg-purple-950/30 text-purple-300' : 'border-rose-500 bg-rose-950/50 text-rose-300'"
          >
            <span class="text-xs font-bold">密奧義：</span>
            <span class="text-base font-black tabular-nums">{{ hiddenCount() }}</span>
            <span class="text-xs font-semibold text-slate-400">/ 3</span>
          </div>

          <!-- 功能按鈕 -->
          <button
            type="button"
            class="btn btn--ghost btn--sm !px-2.5 !py-1 text-xs"
            title="重設為該流派預設 50 張牌組"
            (click)="resetDefault()"
          >
            ↺ 預設
          </button>
          <button
            type="button"
            class="btn btn--ghost btn--sm !px-2.5 !py-1 text-xs text-rose-400 hover:text-rose-300"
            title="清空牌組"
            (click)="clearDeck()"
          >
            ✕ 清空
          </button>
          <button
            type="button"
            class="btn btn--amber btn--sm !px-4 !py-1.5 text-xs font-bold"
            [disabled]="!validation().ok"
            [title]="validation().ok ? '保存牌組並返回' : validation().errors.join('\n')"
            (click)="saveAndClose()"
          >
            ✓ 完成構築
          </button>
        </div>
      </header>

      <!-- 錯誤/警告提示列（當未達 50 張或超標時） -->
      @if (!validation().ok) {
        <div class="shrink-0 border-b border-amber-600/40 bg-amber-950/50 px-4 py-1.5 text-xs font-semibold text-amber-200">
          ⚠️ 注意：{{ validation().errors.join('；') }}
        </div>
      }

      <!-- 雙欄主體：左欄【目前牌組區】(40%) / 右欄【搜尋與卡庫區】(60%) -->
      <div class="flex flex-1 overflow-hidden">
        <!-- ══════════ 左欄：牌組區 ══════════ -->
        <section
          class="flex w-2/5 min-w-[280px] max-w-[420px] flex-col border-r border-slate-800 bg-slate-950/60 p-3"
          [class.ring-2]="isDeckDragOver()"
          [class.ring-emerald-500]="isDeckDragOver()"
          (dragover)="onDeckDragOver($event)"
          (dragleave)="isDeckDragOver.set(false)"
          (drop)="onDeckDrop($event)"
        >
          <div class="mb-2 flex shrink-0 items-center justify-between">
            <h3 class="flex items-center gap-1.5 text-xs font-bold text-slate-300">
              <span>📋 牌組明細</span>
              <span class="text-[10px] font-normal text-slate-500">（共 {{ deckEntries().length }} 種卡牌）</span>
            </h3>
            <span class="text-[10px] text-slate-500">右鍵快速移出 · 拖曳移出</span>
          </div>

          <!-- 牌組卡片列表（可滾動） -->
          <div class="scroll-y flex-1 space-y-1.5 pr-1">
            @if (deckEntries().length === 0) {
              <div class="flex h-48 flex-col items-center justify-center text-center text-xs text-slate-600">
                <span class="text-2xl opacity-40">📭</span>
                <span class="mt-2">牌組目前是空的</span>
                <span class="mt-1 text-[10px]">從右側卡庫右鍵或拖曳卡片至此</span>
              </div>
            } @else {
              @for (entry of deckEntries(); track entry.def.id) {
                <div
                  class="deck-card-row group relative flex cursor-pointer select-none items-center justify-between rounded-lg border border-slate-800/80 bg-slate-900/70 px-2.5 py-1.5 transition-all hover:border-amber-400/60 hover:bg-slate-800/80"
                  draggable="true"
                  (dragstart)="onDeckDragStart($event, entry.def.id)"
                  (contextmenu)="onDeckContextMenu($event, entry.def.id)"
                  (mouseenter)="onRowHover($event, entry.def.id)"
                  (mouseleave)="onHoverLeave()"
                >
                  <!-- 左側卡種圖騰與名稱 -->
                  <div class="flex min-w-0 items-center gap-2">
                    <div class="h-6 w-6 shrink-0 text-amber-300" [innerHTML]="safeArt(entry.def.id)"></div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="truncate text-xs font-bold text-slate-200 group-hover:text-amber-300">
                          {{ entry.def.name }}
                        </span>
                        <!-- 類別或階級小徽章 -->
                        <span
                          class="rounded px-1 py-px text-[9px] font-bold"
                          [class]="kindBadgeClass(entry.def)"
                        >
                          {{ cardBadge(entry.def) }}
                        </span>
                      </div>
                      <div class="text-[10px] text-slate-500">
                        @if (entry.def.kind === 'technique') {
                          傷 {{ entry.def.damage }} · 防 {{ entry.def.guard }}
                        } @else {
                          費 {{ entry.def.cost }} · 防 {{ entry.def.guard }}
                        }
                      </div>
                    </div>
                  </div>

                  <!-- 右側張數微調控制器 -->
                  <div class="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      class="flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-xs font-black text-slate-300 transition hover:bg-rose-900/60 hover:text-rose-200"
                      title="減少 1 張（亦可右鍵點擊整張卡）"
                      (click)="removeCard(entry.def.id)"
                    >
                      -
                    </button>

                    <span
                      class="flex h-6 min-w-[22px] items-center justify-center rounded px-1 text-xs font-black tabular-nums"
                      [class]="entry.count === 4 ? 'bg-amber-400 text-slate-950 shadow' : 'bg-slate-800 text-amber-300'"
                      [title]="'目前放入 ' + entry.count + ' 張（上限 4 張）'"
                    >
                      {{ entry.count }}
                    </span>

                    <button
                      type="button"
                      class="flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-xs font-black text-slate-300 transition hover:bg-emerald-900/60 hover:text-emerald-200 disabled:opacity-30"
                      [disabled]="entry.count >= 4 || totalCards() >= 50 || (entry.def.tier === 'hidden' && hiddenCount() >= 3)"
                      title="增加 1 張"
                      (click)="addCard(entry.def.id)"
                    >
                      +
                    </button>
                  </div>
                </div>
              }
            }
          </div>
        </section>

        <!-- ══════════ 右欄：搜尋與卡庫區 ══════════ -->
        <section
          class="flex flex-1 flex-col overflow-hidden bg-slate-950/40 p-4"
          (dragover)="onPoolDragOver($event)"
          (drop)="onPoolDrop($event)"
        >
          <!-- 篩選列 -->
          <div class="mb-3 flex shrink-0 flex-wrap items-center gap-2">
            <!-- 關鍵字搜尋 -->
            <div class="relative flex-1 min-w-[160px]">
              <input
                type="text"
                class="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 pl-8 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                placeholder="🔍 搜尋卡名、效果描述…"
                [value]="searchQuery()"
                (input)="searchQuery.set($any($event.target).value)"
              />
              @if (searchQuery()) {
                <button
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
                  (click)="searchQuery.set('')"
                >
                  ✕
                </button>
              }
            </div>

            <!-- 分類篩選按鈕 -->
            <div class="flex flex-wrap items-center gap-1">
              @for (tab of filterTabs; track tab.id) {
                <button
                  type="button"
                  class="rounded-md px-2.5 py-1 text-xs font-semibold transition"
                  [class]="filterKind() === tab.id
                    ? 'bg-amber-400 text-slate-950 font-bold shadow'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'"
                  (click)="filterKind.set(tab.id)"
                >
                  {{ tab.label }}
                </button>
              }
            </div>
          </div>

          <!-- 卡片網格展示（可滾動） -->
          <div class="scroll-y flex-1 pr-1">
            @if (filteredPool().length === 0) {
              <div class="flex h-48 flex-col items-center justify-center text-center text-xs text-slate-500">
                <span>🔍 沒有符合條件的卡牌</span>
              </div>
            } @else {
              <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                @for (card of filteredPool(); track card.id) {
                  @let countInDeck = deckCounts()[card.id] ?? 0;
                  @let isFull = countInDeck >= 4 || (card.tier === 'hidden' && hiddenCount() >= 3 && countInDeck === 0);
                  @let isCommon = cardAffiliation(card.id) === 'common';

                  <div
                    class="pool-card relative flex flex-col justify-between rounded-lg border p-2 transition-all select-none"
                    [class]="isFull
                      ? 'border-slate-800/60 bg-slate-950/60 opacity-60'
                      : 'border-slate-800 bg-slate-900/90 hover:border-amber-400/70 hover:shadow-lg'"
                    draggable="true"
                    (dragstart)="onPoolDragStart($event, card.id)"
                    (contextmenu)="onPoolContextMenu($event, card.id)"
                    (mouseenter)="onCardHover($event, card.id)"
                    (mouseleave)="onHoverLeave()"
                  >
                    <!-- 頂部：所屬標籤與費用/傷害 -->
                    <div class="flex items-center justify-between text-[10px]">
                      <span
                        class="rounded px-1 py-px font-bold"
                        [class]="isCommon ? 'bg-slate-800 text-slate-300' : 'bg-amber-950 text-amber-300'"
                      >
                        {{ isCommon ? '共用' : '專屬' }}
                      </span>
                      <span
                        class="rounded px-1 py-px font-bold"
                        [class]="kindBadgeClass(card)"
                      >
                        {{ cardBadge(card) }}
                      </span>
                    </div>

                    <!-- 中間：卡圖與卡名 -->
                    <div class="my-1.5 flex flex-col items-center text-center">
                      <div class="h-10 w-10 text-amber-300" [innerHTML]="safeArt(card.id)"></div>
                      <div class="mt-1 truncate text-xs font-bold text-slate-100" [title]="card.name">
                        {{ card.name }}
                      </div>
                      <div class="text-[9px] text-slate-400">
                        @if (card.kind === 'technique') {
                          傷 {{ card.damage }} · 防 {{ card.guard }}
                        } @else {
                          費 {{ card.cost }} · 防 {{ card.guard }}
                        }
                      </div>
                    </div>

                    <!-- 底部：已加入數量徽章與 + 按鈕 -->
                    <div class="flex items-center justify-between border-t border-slate-800/80 pt-1.5">
                      <span class="text-[10px] font-semibold text-slate-400">
                        已入：<b class="text-amber-300">{{ countInDeck }}</b>/4
                      </span>
                      <button
                        type="button"
                        class="flex h-5 w-5 items-center justify-center rounded text-xs font-black transition cursor-pointer"
                        [class]="isFull
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          : 'bg-amber-400 text-slate-950 hover:bg-amber-300 shadow'"
                        [disabled]="isFull || totalCards() >= 50"
                        title="加入 1 張至牌組（或右鍵直接點擊卡牌）"
                        (click)="addCard(card.id)"
                      >
                        +
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- 底部操作提示 -->
          <footer class="mt-2.5 flex shrink-0 items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
            <div>
              💡 <strong class="text-slate-300">操作秘技：</strong>
              右鍵卡片快速加入或移出；亦可隨意拖曳卡片；滑鼠懸浮可檢視完整效果。
            </div>
            <div class="text-slate-500">
              顯示 {{ filteredPool().length }} / {{ cardPool().length }} 張可用卡
            </div>
          </footer>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .deck-card-row:active {
      transform: scale(0.98);
    }
    .pool-card:active {
      transform: scale(0.97);
    }
  `],
})
export class DeckBuilderComponent implements OnInit {
  private readonly sanitizer = inject(DomSanitizer);

  readonly cardAffiliation = cardAffiliation;

  readonly character = input.required<CharacterId>();
  readonly initialDeck = input<Readonly<Record<string, number>> | null>(null);

  readonly deckChange = output<Record<string, number>>();
  readonly close = output<void>();
  readonly cardHover = output<CardHoverEvent | null>();

  // 內部牌組狀態
  readonly deckCounts = signal<Record<string, number>>({});

  // 搜尋與篩選狀態
  readonly searchQuery = signal<string>('');
  readonly filterKind = signal<string>('all');

  // 拖曳狀態
  readonly isDeckDragOver = signal<boolean>(false);

  readonly filterTabs = [
    { id: 'all', label: '全部' },
    { id: 'technique', label: '招式' },
    { id: 'action', label: '行動' },
    { id: 'event', label: '事件' },
    { id: 'equipment', label: '裝備' },
    { id: 'hidden', label: '密奧義' },
    { id: 'common', label: '僅共用牌' },
  ];

  readonly characterDef = computed(() => CHARACTERS[this.character()]);

  // 當前角色卡池（自己角色牌 + 共用牌）
  readonly cardPool = computed<CardDef[]>(() => getCardPoolForCharacter(this.character()));

  // 依搜尋與篩選條件過濾後的卡庫
  readonly filteredPool = computed<CardDef[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const kind = this.filterKind();
    return this.cardPool().filter((card) => {
      // 關鍵字比對
      if (q && !card.name.toLowerCase().includes(q) && !card.text.toLowerCase().includes(q)) {
        return false;
      }
      // 分類篩選
      if (kind === 'all') return true;
      if (kind === 'hidden') return card.tier === 'hidden';
      if (kind === 'common') return cardAffiliation(card.id) === 'common';
      return card.kind === kind;
    });
  });

  // 牌組總卡數
  readonly totalCards = computed(() => {
    return Object.values(this.deckCounts()).reduce((a, b) => a + b, 0);
  });

  // 牌組密奧義卡數
  readonly hiddenCount = computed(() => {
    let count = 0;
    for (const [id, n] of Object.entries(this.deckCounts())) {
      const def = tryCard(id);
      if (def?.tier === 'hidden') count += n;
    }
    return count;
  });

  // 牌組驗證結果
  readonly validation = computed<DeckValidation>(() => {
    return validateMainDeck(this.deckCounts(), this.character());
  });

  // 牌組卡片條目列表（排序：密奧義 -> 奧義 -> 密技 -> 特技 -> 行動 -> 事件 -> 裝備）
  readonly deckEntries = computed(() => {
    const entries: { def: CardDef; count: number }[] = [];
    for (const [id, count] of Object.entries(this.deckCounts())) {
      if (count <= 0) continue;
      const def = tryCard(id);
      if (def) entries.push({ def, count });
    }

    const kindWeight: Record<string, number> = {
      technique: 1,
      action: 2,
      event: 3,
      equipment: 4,
    };
    const tierWeight: Record<string, number> = {
      hidden: 1,
      ultimate: 2,
      secret: 3,
      trick: 4,
    };

    entries.sort((a, b) => {
      const kwA = kindWeight[a.def.kind] ?? 9;
      const kwB = kindWeight[b.def.kind] ?? 9;
      if (kwA !== kwB) return kwA - kwB;

      if (a.def.kind === 'technique' && b.def.kind === 'technique') {
        const twA = tierWeight[a.def.tier ?? ''] ?? 9;
        const twB = tierWeight[b.def.tier ?? ''] ?? 9;
        if (twA !== twB) return twA - twB;
      }

      return a.def.cost - b.def.cost;
    });

    return entries;
  });

  ngOnInit(): void {
    // 初始化牌組
    const initial = this.initialDeck() ?? CHARACTER_MAIN_DECKS[this.character()];
    this.deckCounts.set({ ...initial });
  }

  // ─────────────────────────────────────────────
  // 牌組操作
  // ─────────────────────────────────────────────

  addCard(cardId: string): void {
    if (this.totalCards() >= RULES.mainDeckSize) return;

    const currentCount = this.deckCounts()[cardId] ?? 0;
    if (currentCount >= RULES.maxCopiesPerName) return;

    const def = tryCard(cardId);
    if (!def) return;

    if (def.tier === 'hidden' && this.hiddenCount() >= RULES.maxHiddenTechniques) {
      return;
    }

    this.deckCounts.update((d) => ({
      ...d,
      [cardId]: (d[cardId] ?? 0) + 1,
    }));
  }

  removeCard(cardId: string): void {
    const count = this.deckCounts()[cardId] ?? 0;
    if (count <= 0) return;

    this.deckCounts.update((d) => {
      const next = { ...d };
      if (next[cardId] > 1) {
        next[cardId]--;
      } else {
        delete next[cardId];
      }
      return next;
    });
  }

  resetDefault(): void {
    this.deckCounts.set({ ...CHARACTER_MAIN_DECKS[this.character()] });
  }

  clearDeck(): void {
    this.deckCounts.set({});
  }

  saveAndClose(): void {
    if (!this.validation().ok) return;
    this.deckChange.emit(this.deckCounts());
    this.close.emit();
  }

  // ─────────────────────────────────────────────
  // 拖曳 (Drag & Drop)
  // ─────────────────────────────────────────────

  onPoolDragStart(event: DragEvent, cardId: string): void {
    event.dataTransfer?.setData('text/plain', JSON.stringify({ source: 'pool', cardId }));
  }

  onDeckDragStart(event: DragEvent, cardId: string): void {
    event.dataTransfer?.setData('text/plain', JSON.stringify({ source: 'deck', cardId }));
  }

  onDeckDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDeckDragOver.set(true);
  }

  onDeckDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDeckDragOver.set(false);
    const data = event.dataTransfer?.getData('text/plain');
    if (!data) return;

    try {
      const parsed = JSON.parse(data);
      if (parsed.cardId) {
        this.addCard(parsed.cardId);
      }
    } catch {
      // 容錯直接傳 cardId
      this.addCard(data);
    }
  }

  onPoolDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onPoolDrop(event: DragEvent): void {
    event.preventDefault();
    const data = event.dataTransfer?.getData('text/plain');
    if (!data) return;

    try {
      const parsed = JSON.parse(data);
      if (parsed.source === 'deck' && parsed.cardId) {
        this.removeCard(parsed.cardId);
      }
    } catch {
      // ignore
    }
  }

  // ─────────────────────────────────────────────
  // 右鍵快速加入 / 移出
  // ─────────────────────────────────────────────

  onPoolContextMenu(event: MouseEvent, cardId: string): void {
    event.preventDefault();
    this.addCard(cardId);
  }

  onDeckContextMenu(event: MouseEvent, cardId: string): void {
    event.preventDefault();
    this.removeCard(cardId);
  }

  // ─────────────────────────────────────────────
  // 滑入卡片詳細效果
  // ─────────────────────────────────────────────

  onCardHover(event: MouseEvent, cardId: string): void {
    this.cardHover.emit({ defId: cardId, x: event.clientX, y: event.clientY });
  }

  onRowHover(event: MouseEvent, cardId: string): void {
    this.cardHover.emit({ defId: cardId, x: event.clientX, y: event.clientY });
  }

  onHoverLeave(): void {
    this.cardHover.emit(null);
  }

  // ─────────────────────────────────────────────
  // UI 標籤樣式
  // ─────────────────────────────────────────────

  cardBadge(def: CardDef): string {
    if (def.kind === 'technique') return TECHNIQUE_LABEL[(def.tier ?? 'trick') as TechniqueTier];
    if (def.kind === 'equipment') return EQUIP_LABEL[(def.slot ?? 'accessory') as EquipSlot];
    return CARD_KIND_LABEL[def.kind as CardKind];
  }

  kindBadgeClass(def: CardDef): string {
    if (def.tier === 'hidden') return 'bg-purple-900/60 text-purple-200 border border-purple-500/40';
    if (def.tier === 'ultimate') return 'bg-amber-900/60 text-amber-200 border border-amber-500/40';
    if (def.kind === 'technique') return 'bg-rose-950/60 text-rose-300';
    if (def.kind === 'equipment') return 'bg-sky-950/60 text-sky-300';
    if (def.kind === 'action') return 'bg-emerald-950/60 text-emerald-300';
    return 'bg-slate-800 text-slate-300';
  }

  safeArt(defId: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(cardArt(defId));
  }
}
