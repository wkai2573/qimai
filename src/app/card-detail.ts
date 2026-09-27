import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { cardArt } from './card-art';
import { card } from './game/cards';
import type { CardInstance } from './game/types';
import { CARD_KIND_LABEL, EQUIP_LABEL, TECHNIQUE_LABEL } from './game/types';

/**
 * 卡片詳細資訊面板。
 *
 * 對局中所有文字都收在這裡：點擊場上任何一張卡，這裡就顯示它的完整資訊。
 * 這樣牌桌本身可以保持乾淨，只留卡名與卡圖。
 */
@Component({
  selector: 'app-card-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (inst(); as ci) {
      <div class="flex flex-col gap-3">
        <!-- 大卡圖 -->
        <div class="card-frame relative mx-auto flex w-[150px] flex-col overflow-hidden" [class]="frameClass()">
          @if (def()!.kind !== 'quest') {
            <span class="card-cost w-6 h-6 text-[13px] top-1.5 left-1.5" [title]="'費用：' + def()!.cost">{{ def()!.cost }}</span>
          }
          <div class="card-name px-4 pt-2 text-center leading-tight font-bold">{{ def()!.name }}</div>
          <div class="card-art mx-2 mt-1.5 mb-2 flex h-[104px] items-center justify-center rounded" [class]="artPlate()">
            <div class="h-[80%] w-[80%]" [innerHTML]="artHtml()"></div>
          </div>
        </div>

        <!-- 資訊 -->
        <div class="rounded-lg border border-slate-700 bg-slate-900 p-2.5">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="rounded px-1.5 py-0.5 text-[10px] font-bold" [class]="badgeClass()">{{ typeLabel() }}</span>
            @if (def()!.levelRequirement) {
              <span class="tag tag--amber">等級 {{ def()!.levelRequirement }}+</span>
            }
            @if (def()!.toAngerBottom) {
              <span class="tag tag--rose">怒底</span>
            }
            @if (def()!.angerCost) {
              <span class="tag tag--rose">怒氣費用 {{ def()!.angerCost }}</span>
            }
            @if (def()!.chant) {
              <span class="tag tag--sky">詠唱({{ def()!.chant!.cost }})</span>
            }
            @if (def()!.cooldown) {
              <span class="tag tag--emerald">冷卻({{ def()!.cooldown }})</span>
            }
          </div>

          <!-- 數值列 -->
          <div class="mt-2 grid grid-cols-3 gap-1.5 text-center">
            <div class="stat-box">
              <div class="stat-box__label">費用</div>
              <div class="stat-box__value text-sky-300">{{ def()!.cost }}</div>
            </div>
            <div class="stat-box">
              <div class="stat-box__label">傷害</div>
              <div class="stat-box__value text-rose-300">{{ def()!.damage ?? '—' }}</div>
            </div>
            <div class="stat-box">
              <div class="stat-box__label">防禦</div>
              <div class="stat-box__value text-sky-300">{{ def()!.guard }}</div>
            </div>
          </div>

          @if (def()!.chant; as ch) {
            <div class="mt-2 rounded border border-sky-600/40 bg-sky-950/30 px-2 py-1 text-[10px] text-sky-200">
              詠唱特性：主要階段橫置 {{ ch.cost }} 生命打出；戰鬥階段額外出招。{{ ch.text }}
            </div>
          }

          @if (def()!.cooldown; as cd) {
            <div class="mt-2 rounded border border-emerald-600/40 bg-emerald-950/30 px-2 py-1 text-[10px] text-emerald-200">
              冷卻特性：使用後進入冷卻區計時 {{ cd }} 回合{{ def()!.storage ? '（儲存上限 ' + def()!.storage + ' 張）' : '' }}。{{ def()!.cooldownBuff?.text ?? '' }}
            </div>
          }

          @if (def()!.comboBonus; as combo) {
            <div class="mt-2 rounded border border-amber-600/40 bg-amber-950/30 px-2 py-1 text-[10px] text-amber-200">
              連招加成：接在 {{ comboText(combo.sequence) }} 之後，這一擊 +{{ combo.damage }} 傷害
            </div>
          }

          @if (def()!.liberation; as lib) {
            <div class="mt-2 rounded border border-fuchsia-600/40 bg-fuchsia-950/30 px-2 py-1 text-[10px] text-fuchsia-200">
              解放條件：{{ liberationText() }}
            </div>
          }

          <p class="mt-2 text-[11px] leading-relaxed text-slate-300">{{ def()!.text }}</p>

          <!-- 任務卡的雙面條件 -->
          @if (def()!.quest; as q) {
            <div class="mt-2 space-y-1 border-t border-slate-700 pt-2">
              <p class="text-[10px] leading-snug text-emerald-300">完成：{{ q.completeText }}</p>
              <p class="text-[10px] leading-snug text-rose-300">阻止：{{ q.blockText }}</p>
              @if (q.starter) {
                <p class="text-[10px] text-amber-300">★ 起始任務</p>
              }
            </div>
          }
        </div>

        <!-- 動作 -->
        @if (actionLabel()) {
          <button
            type="button"
            class="w-full rounded-lg bg-amber-700 px-3 py-2 text-sm font-bold transition hover:bg-amber-600 disabled:opacity-40"
            [disabled]="!actionEnabled()"
            (click)="act.emit()"
          >
            {{ actionLabel() }}
          </button>
        }
      </div>
    } @else {
      <div class="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-800">
        <p class="px-4 text-center text-[11px] leading-relaxed text-slate-600">
          點擊任何一張卡<br />查看完整資訊
        </p>
      </div>
    }
  `,
})
export class CardDetailComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly inst = input<CardInstance | null>(null);
  /** 有值就顯示動作按鈕（例如「使用這張卡」「出招」） */
  readonly actionLabel = input('');
  readonly actionEnabled = input(true);

  readonly act = output<void>();

  readonly def = computed(() => {
    const ci = this.inst();
    return ci ? card(ci.defId) : null;
  });

  readonly artHtml = computed(() => {
    const ci = this.inst();
    return ci ? this.sanitizer.bypassSecurityTrustHtml(cardArt(ci.defId)) : '';
  });

  readonly typeLabel = computed(() => {
    const d = this.def();
    if (!d) return '';
    if (d.kind === 'technique' && d.tier) return TECHNIQUE_LABEL[d.tier];
    if (d.kind === 'equipment' && d.slot) return `${CARD_KIND_LABEL.equipment}・${EQUIP_LABEL[d.slot]}`;
    return CARD_KIND_LABEL[d.kind];
  });

  readonly frameClass = computed(() => {
    const d = this.def();
    if (!d) return '';
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

  readonly artPlate = computed(() => {
    const d = this.def();
    if (!d) return 'art-plate';
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

  readonly badgeClass = computed(() => {
    const d = this.def();
    if (!d) return '';
    switch (d.kind) {
      case 'technique':
        return 'bg-rose-500/25 text-rose-200';
      case 'equipment':
        return 'bg-sky-500/25 text-sky-200';
      case 'action':
        return 'bg-emerald-500/25 text-emerald-200';
      case 'event':
        return 'bg-violet-500/25 text-violet-200';
      case 'quest':
        return 'bg-amber-500/25 text-amber-200';
      default:
        return 'bg-slate-500/25 text-slate-200';
    }
  });

  comboText(sequence: readonly string[]): string {
    return sequence.map((t) => TECHNIQUE_LABEL[t as keyof typeof TECHNIQUE_LABEL] ?? t).join(' → ');
  }

  liberationText(): string {
    const lib = this.def()?.liberation;
    if (!lib) return '';
    switch (lib.type) {
      case 'usedTierThisTurn':
        return `本回合已使用過${TECHNIQUE_LABEL[lib.tier]}`;
      case 'combo':
        return `本戰鬥階段成立連招 ${this.comboText(lib.sequence)}`;
      case 'handAtLeast':
        return `手牌 ${lib.n} 張以上`;
      case 'angerAtLeast':
        return `怒氣區 ${lib.n} 張以上`;
      case 'deckAtLeast':
        return `牌組 ${lib.n} 張以上`;
      case 'lifeAtLeast':
        return `生命區 ${lib.n} 張以上`;
      case 'levelAtLeast':
        return `等級 ${lib.n} 以上`;
      case 'cooldownCountAtLeast':
        return `冷卻區卡牌 ${lib.n} 張以上`;
      case 'hasChantedThisTurn':
        return '本回合已有詠唱過招式';
      case 'equippedSlot':
        return `裝備了${EQUIP_LABEL[lib.slot]}`;
      default:
        return '條件成立時';
    }
  }
}
