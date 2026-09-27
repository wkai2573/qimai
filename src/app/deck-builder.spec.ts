import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeckBuilderComponent } from './deck-builder';
import { cardAffiliation } from './game/cards';

describe('DeckBuilderComponent', () => {
  let fixture: ComponentFixture<DeckBuilderComponent>;
  let component: DeckBuilderComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeckBuilderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DeckBuilderComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('character', 'rage');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('成功建立組牌器元件', () => {
    expect(component).toBeTruthy();
  });

  it('初始狀態牌組總數剛好 50 張，密奧義總數最多 6 張', () => {
    expect(component.totalCards()).toBe(50);
    expect(component.hiddenCount()).toBeLessThanOrEqual(6);
    expect(component.validation().ok).toBe(true);
  });

  it('卡池只包含當前角色（狂怒）專屬牌與共用牌，不包含其他角色專屬牌', () => {
    const pool = component.cardPool();
    expect(pool.length).toBeGreaterThan(0);

    for (const c of pool) {
      const aff = cardAffiliation(c.id);
      expect(aff === 'rage' || aff === 'common').toBe(true);
      expect(aff).not.toBe('mage');
      expect(aff).not.toBe('qigong');
      expect(aff).not.toBe('quest');
    }
  });

  it('同名卡不可超過 4 張', () => {
    // 狂怒起手怒策已經有 4 張
    expect(component.deckCounts()['rg_tech_nuce']).toBe(4);

    // 嘗試再加 1 張
    component.addCard('rg_tech_nuce');
    expect(component.deckCounts()['rg_tech_nuce']).toBe(4);
  });

  it('密奧義卡片不可超過 6 張', () => {
    // 先移除 4 張非密奧義牌以騰出牌組空間
    for (let i = 0; i < 4; i++) component.removeCard('rg_tech_nuce');
    expect(component.totalCards()).toBe(46);

    // 目前預設牌組已有 3 張密奧義（bajuan 2 + nuhai 1），再補 3 張到上限 6 張
    expect(component.hiddenCount()).toBe(3);
    component.addCard('rg_tech_bajuan');
    component.addCard('rg_tech_bajuan');
    component.addCard('rg_tech_nuhai');
    expect(component.hiddenCount()).toBe(6);

    // 嘗試加入第 7 張密奧義
    component.addCard('rg_tech_nuhai');
    // 密奧義不能增加
    expect(component.hiddenCount()).toBe(6);
    expect(component.deckCounts()['rg_tech_nuhai']).toBe(2);
  });

  it('牌組總數不可超過 50 張', () => {
    expect(component.totalCards()).toBe(50);
    // 嘗試加 1 張共用卡
    component.addCard('cm_tiandi');
    expect(component.totalCards()).toBe(50);
    expect(component.deckCounts()['cm_tiandi']).toBeUndefined();
  });

  it('右鍵卡庫卡片可快速加入牌組，右鍵牌組卡片可快速移出牌組', () => {
    // 先移出 1 張
    const preventSpy = vi.fn();
    const mouseEvent = { preventDefault: preventSpy } as unknown as MouseEvent;

    component.onDeckContextMenu(mouseEvent, 'rg_tech_nuce');
    expect(preventSpy).toHaveBeenCalled();
    expect(component.deckCounts()['rg_tech_nuce']).toBe(3);
    expect(component.totalCards()).toBe(49);

    // 從卡庫右鍵加入共用卡
    component.onPoolContextMenu(mouseEvent, 'cm_tiandi');
    expect(component.deckCounts()['cm_tiandi']).toBe(1);
    expect(component.totalCards()).toBe(50);
  });

  it('支援拖曳卡片將其移入牌組區與移出牌組區', () => {
    // 先移出 1 張
    component.removeCard('rg_tech_nuce');
    expect(component.totalCards()).toBe(49);

    // 拖曳放入
    const dropEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        getData: () => JSON.stringify({ source: 'pool', cardId: 'cm_xinjue' }),
      },
    } as unknown as DragEvent;

    component.onDeckDrop(dropEvent);
    expect(component.deckCounts()['cm_xinjue']).toBe(1);
    expect(component.totalCards()).toBe(50);

    // 拖曳移出
    const poolDropEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        getData: () => JSON.stringify({ source: 'deck', cardId: 'cm_xinjue' }),
      },
    } as unknown as DragEvent;

    component.onPoolDrop(poolDropEvent);
    expect(component.deckCounts()['cm_xinjue']).toBeUndefined();
    expect(component.totalCards()).toBe(49);
  });

  it('可清空牌組並一鍵恢復預設 50 張牌組', () => {
    component.clearDeck();
    expect(component.totalCards()).toBe(0);
    expect(component.validation().ok).toBe(false);

    component.resetDefault();
    expect(component.totalCards()).toBe(50);
    expect(component.validation().ok).toBe(true);
  });

  it('搜尋與分類篩選能精確過濾卡庫', () => {
    component.searchQuery.set('正氣拳');
    const filtered = component.filteredPool();
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('cm_tech_zhengquan');

    component.searchQuery.set('');
    component.filterKind.set('common');
    const commonCards = component.filteredPool();
    expect(commonCards.length).toBeGreaterThan(0);
    for (const c of commonCards) {
      expect(c.id.startsWith('cm_')).toBe(true);
    }
  });
});
