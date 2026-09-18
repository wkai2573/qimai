import { TestBed } from '@angular/core/testing';

import { CardViewComponent } from './card-view';
import { CARD_DEFS } from './game/cards';
import { TECHNIQUE_ORDER } from './game/types';

/**
 * 招式階級圈的測試。
 *
 * 「亮幾個圈 = 第幾階」是一個 1:1 映射，寫錯一格玩家就會誤判戰力，
 * 所以四種階級都逐一驗證，而不是只抽查一個。
 */
describe('卡牌的招式階級圈', () => {
  function render(defId: string) {
    const fixture = TestBed.createComponent(CardViewComponent);
    fixture.componentRef.setInput('inst', { iid: 1, defId });
    fixture.detectChanges();
    return fixture;
  }

  const expected: Record<string, number> = {
    trick: 1,
    secret: 2,
    ultimate: 3,
    hidden: 4,
  };

  it('四種階級分別對應 1～4 個亮圈', () => {
    for (const tier of TECHNIQUE_ORDER) {
      const def = CARD_DEFS.find((d) => d.tier === tier);
      expect(def, `找不到 ${tier} 的卡`).toBeTruthy();

      const fixture = render(def!.id);
      const el = fixture.nativeElement as HTMLElement;

      // 四格固定，亮起的數量才是階級
      expect(el.querySelectorAll('.tier-pip').length, `${tier} 應該有 4 格`).toBe(4);
      expect(el.querySelectorAll('.tier-pip--on').length, `${tier} 的亮圈數`).toBe(expected[tier]);
    }
  });

  it('階級數字與 TECHNIQUE_ORDER 的順序一致', () => {
    for (let i = 0; i < TECHNIQUE_ORDER.length; i++) {
      const def = CARD_DEFS.find((d) => d.tier === TECHNIQUE_ORDER[i])!;
      const fixture = render(def.id);

      expect(fixture.componentInstance.tierLevel(), `${def.name} 的階級`).toBe(i + 1);
    }
  });

  it('非招式卡不顯示圈圈', () => {
    for (const kind of ['equipment', 'action', 'event'] as const) {
      const def = CARD_DEFS.find((d) => d.kind === kind)!;
      const fixture = render(def.id);
      const el = fixture.nativeElement as HTMLElement;

      expect(fixture.componentInstance.tierLevel(), `${def.name} 不該有階級`).toBe(0);
      expect(el.querySelectorAll('.tier-pip').length, `${def.name} 不該顯示圈圈`).toBe(0);
    }
  });

  it('每一張招式卡都有階級，不會漏掉', () => {
    const techniques = CARD_DEFS.filter((d) => d.kind === 'technique');
    expect(techniques.length).toBeGreaterThan(0);

    for (const def of techniques) {
      const fixture = render(def.id);
      expect(fixture.componentInstance.tierLevel(), `${def.name} 缺少階級`).toBeGreaterThanOrEqual(1);
      expect(fixture.componentInstance.tierLevel()).toBeLessThanOrEqual(4);
    }
  });
});
