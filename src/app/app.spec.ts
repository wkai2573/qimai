import { TestBed } from '@angular/core/testing';

import { App } from './app';
import { PHASE_LABEL, type Phase } from './game/types';

describe('App', () => {
  beforeEach(async () => {
    // 預設當作已經看過規則，避免規則彈窗干擾其他測試
    localStorage.setItem('qimai.rules-seen', '1');

    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('可以建立主畫面元件', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('渲染出標題、雙方區塊與日誌', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('氣脈');
    expect(text).toContain('對手');
    expect(text).toContain('你');
    expect(text).toContain('日誌');
  });

  it('詳細面板一開始顯示提示文字', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const detail = (fixture.nativeElement as HTMLElement).querySelector('app-card-detail');

    expect(detail).toBeTruthy();
    expect(detail?.textContent).toContain('點擊任何一張卡');
  });

  it('點擊手牌後，詳細面板會顯示該卡的完整資訊', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const cardButton = el.querySelector('app-card-view button') as HTMLButtonElement | null;
    expect(cardButton, '手牌上應該有可點的卡').toBeTruthy();

    cardButton!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const detail = el.querySelector('app-card-detail');
    const text = detail?.textContent ?? '';

    // 面板應該從提示狀態變成顯示數值欄位
    expect(text).not.toContain('點擊任何一張卡');
    expect(text).toContain('費用');
    expect(text).toContain('傷害');
    expect(text).toContain('防禦');
  });

  it('回合流程進度條涵蓋所有階段（開局與結束除外）', () => {
    const app = TestBed.createComponent(App).componentInstance;

    const all = Object.keys(PHASE_LABEL) as Phase[];
    const inTrack = new Set(app.turnPhases);

    // 之後若在 Phase 新增階段卻忘了加進進度條，這個測試會紅燈
    const missing = all.filter((p) => p !== 'setup' && p !== 'ended' && !inTrack.has(p));
    expect(missing).toEqual([]);
  });

  it('回合流程進度條會渲染出來，並標出目前階段', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const track = el.querySelector('.phase-track');
    expect(track, '應該有流程進度條').toBeTruthy();

    const text = track?.textContent ?? '';
    for (const name of ['重置', '抽牌', '主要', '戰鬥']) {
      expect(text).toContain(name);
    }

    // 開局後停在爆發階段
    const active = track?.querySelector('.phase-step--active');
    expect(active?.textContent).toContain('爆發');
  });

  it('點「？」按鈕會開啟規則說明', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector('button[title="遊戲規則"]') as HTMLButtonElement | null;
    expect(button, '應該有規則按鈕').toBeTruthy();

    button!.click();
    fixture.detectChanges();

    expect(el.textContent).toContain('氣脈 · 遊戲規則');
  });

  it('第一次遊玩（還沒看過規則）會自動打開規則說明', () => {
    localStorage.removeItem('qimai.rules-seen');

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('氣脈 · 遊戲規則');
  });

  it('規則說明涵蓋所有主要段落', async () => {
    const app = TestBed.createComponent(App).componentInstance;
    const titles = app.ruleSections.map((s) => s.title);

    for (const expected of ['遊戲目標', '回合流程', '戰鬥階段', '特殊事件', '操作方式']) {
      expect(titles).toContain(expected);
    }

    // 每個段落都要有內容，不能是空殼
    for (const section of app.ruleSections) {
      expect(section.items.length, `${section.title} 沒有內容`).toBeGreaterThan(0);
    }
  });
});
