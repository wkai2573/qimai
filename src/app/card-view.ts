import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { CARD_BACK, cardArt } from './card-art';
import { card } from './game/cards';
import { TECHNIQUE_LABEL, TECHNIQUE_ORDER, type CardInstance } from './game/types';

export type CardSize = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<CardSize, string> = {
  sm: 'w-[74px] h-[100px] text-[9px]',
  // 小螢幕縮一號，否則 10 張手牌在手機上會擠出畫面
  md: 'w-[86px] h-[118px] text-[9px] sm:w-[104px] sm:h-[140px] sm:text-[11px]',
  lg: 'w-[132px] h-[180px] text-[13px]',
};

/**
 * 場上與手牌的卡牌顯示。
 *
 * 刻意只顯示「卡名 + 卡圖」——對局中同時有幾十張卡，塞進數值與說明文字
 * 會讓畫面變得難以掃視。完整資訊由 CardDetailComponent 在左側面板呈現。
 */
@Component({
  selector: 'app-card-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (faceDown()) {
      <div class="card-frame card-frame--back flex items-center justify-center" [class]="sizeClass()">
        <div class="card-art h-1/2 w-1/2 text-sky-400/70" [innerHTML]="backHtml()"></div>
      </div>
    } @else {
      <button
        type="button"
        class="card-frame group relative flex flex-col overflow-hidden transition-all duration-200 ease-out"
        [class]="sizeClass() + ' ' + frameClass()"
        [class.card-playable]="playable() && !showcase()"
        [class.card-disabled]="!playable() && !showcase()"
        [class.card-picked]="selected()"
        [class.card-draggable]="draggable() && playable() && !showcase()"
        [disabled]="!playable() || showcase()"
        (pointerdown)="onPointerDown($event)"
        (mouseenter)="onMouseEnter($event)"
        (mouseleave)="onMouseLeave()"
        (click)="pick.emit(inst().iid)"
      >
        <!-- 卡名 -->
        <div class="card-name px-1.5 pt-1.5 text-center leading-tight font-bold">{{ def().name }}</div>

        <!-- 卡圖 -->
        <div
          class="card-art relative mx-1.5 mt-1 mb-1.5 flex flex-1 items-center justify-center overflow-hidden rounded"
          [class]="artPlate()"
        >
          <div class="h-[78%] w-[78%] transition-transform duration-300 group-hover:scale-110" [innerHTML]="artHtml()"></div>

          <!-- 招式階級：亮起的圈數 = 特技1／密技2／奧義3／密奧義4 -->
          @if (tierLevel() > 0) {
            <div class="tier-pips" [class]="tierPipClass()" [title]="tierTitle()">
              @for (n of PIP_STEPS; track n) {
                <span class="tier-pip" [class.tier-pip--on]="n <= tierLevel()"></span>
              }
            </div>
          }
        </div>

        @if (exhausted()) {
          <div class="absolute inset-0 z-20 bg-slate-950/70"></div>
        }
      </button>
    }
  `,
})
export class CardViewComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly inst = input.required<CardInstance>();
  readonly playable = input(true);
  readonly selected = input(false);
  readonly faceDown = input(false);
  readonly exhausted = input(false);
  /** 純展示（戰鬥區打出的卡）：不灰、不 hover、不可點 */
  readonly showcase = input(false);
  /** 允許拖曳出招（只有手牌會開啟） */
  readonly draggable = input(false);
  /** 滑鼠移入時回報位置，由外層顯示詳細資訊浮層 */
  readonly tooltip = input(false);
  readonly size = input<CardSize>('md');

  readonly pick = output<number>();
  /** hover 狀態變化；null 表示移出 */
  readonly hoverInfo = output<{ iid: number; rect: DOMRect } | null>();
  /** 指標按下：由父層接手拖曳生命週期（移動與放開都在 document 上追蹤） */
  readonly pointerDown = output<PointerEvent>();

  onPointerDown(ev: PointerEvent): void {
    if (!this.playable() || this.showcase() || !this.draggable()) return;
    this.pointerDown.emit(ev);
  }

  onMouseEnter(ev: MouseEvent): void {
    if (!this.tooltip()) return;

    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.hoverInfo.emit({ iid: this.inst().iid, rect });
  }

  onMouseLeave(): void {
    if (!this.tooltip()) return;
    this.hoverInfo.emit(null);
  }

  readonly def = computed(() => card(this.inst().defId));

  /** 圈圈的固定四格（用常數避免模板每次重建陣列） */
  readonly PIP_STEPS = [1, 2, 3, 4] as const;

  /**
   * 招式的階級強度：特技 1、密技 2、奧義 3、密奧義 4。
   * 非招式卡回傳 0（不顯示圈圈）。
   */
  readonly tierLevel = computed(() => {
    const d = this.def();
    if (d.kind !== 'technique' || !d.tier) return 0;
    return TECHNIQUE_ORDER.indexOf(d.tier) + 1;
  });

  /** 圈圈的顏色依階級區分 */
  readonly tierPipClass = computed(() => {
    const tier = this.def().tier;
    if (!tier) return '';
    return `tier-pips--${tier}`;
  });

  readonly tierTitle = computed(() => {
    const d = this.def();
    return d.tier ? `${TECHNIQUE_LABEL[d.tier]}（第 ${this.tierLevel()} 階）` : '';
  });

  readonly artHtml = computed(() => this.sanitizer.bypassSecurityTrustHtml(cardArt(this.inst().defId)));
  readonly backHtml = computed(() => this.sanitizer.bypassSecurityTrustHtml(CARD_BACK));

  readonly sizeClass = computed(() => SIZE_CLASS[this.size()]);

  /** 卡框顏色：依卡種與招式階級區分 */
  readonly frameClass = computed(() => {
    const d = this.def();
    switch (d.kind) {
      case 'technique':
        if (d.tier === 'hidden') return 'card-frame--hidden';
        if (d.tier === 'ultimate') return 'card-frame--ultimate';
        if (d.tier === 'secret') return 'card-frame--secret';
        return 'card-frame--trick';
      case 'equipment':
        return 'card-frame--equipment';
      case 'action':
        return 'card-frame--action';
      case 'event':
        return 'card-frame--event';
      case 'quest':
        return 'card-frame--quest';
      default:
        return 'card-frame--trick';
    }
  });

  /** 卡圖底板的色調 */
  readonly artPlate = computed(() => {
    const d = this.def();
    switch (d.kind) {
      case 'technique':
        if (d.tier === 'hidden') return 'art-plate art-plate--hidden';
        if (d.tier === 'ultimate') return 'art-plate art-plate--ultimate';
        if (d.tier === 'secret') return 'art-plate art-plate--secret';
        return 'art-plate art-plate--trick';
      case 'equipment':
        return 'art-plate art-plate--equipment';
      case 'action':
        return 'art-plate art-plate--action';
      case 'event':
        return 'art-plate art-plate--event';
      case 'quest':
        return 'art-plate art-plate--quest';
      default:
        return 'art-plate';
    }
  });
}
