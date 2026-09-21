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


  it('不再有左側固定資訊面板（卡片資訊改由 hover 浮層提供）', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;

    // 桌面版的側邊面板已經移除
    expect(el.querySelector('aside'), '不該再有側邊面板').toBeNull();
    // 而 hover 浮層在未移入時不該存在
    expect(el.querySelector('.card-tooltip'), '未移入時不該有浮層').toBeNull();
  });

  it('回合流程進度條涵蓋所有階段（開局與結束除外）', () => {
    const app = TestBed.createComponent(App).componentInstance;

    const all = Object.keys(PHASE_LABEL) as Phase[];
    const inTrack = new Set(app.turnPhases);

    // 之後若在 Phase 新增階段卻忘了加進進度條，這個測試會紅燈
    const missing = all.filter((p) => p !== 'setup' && p !== 'ended' && !inTrack.has(p));
    expect(missing).toEqual([]);
  });

  it('開局要玩家自選生命卡，選完才進入回合流程', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;

    // 還沒進入回合，不該有進度條
    expect(el.querySelector('.phase-track'), '開局時不該有進度條').toBeNull();

    // 選擇對話框應該出現
    expect(el.textContent).toContain('生命區');

    // 注意：要限定在對話框內查詢，否則會抓到下方手牌區的卡片
    const dialog = el.querySelector('.popover--accent');
    expect(dialog, '應該有選擇對話框').toBeTruthy();

    // 點 3 張卡完成開局（選中的卡不會消失，所以固定點前 3 個）
    for (let i = 0; i < 3; i++) {
      const button = dialog!.querySelectorAll('app-card-view button')[i] as HTMLButtonElement | undefined;
      expect(button, `第 ${i + 1} 張候選卡應該存在`).toBeTruthy();
      button!.click();
      fixture.detectChanges();
    }
    await fixture.whenStable();

    const track = el.querySelector('.phase-track');
    expect(track, '選完生命卡後應該出現進度條').toBeTruthy();

    const text = track?.textContent ?? '';
    for (const name of ['重置', '抽牌', '主要', '戰鬥']) {
      expect(text).toContain(name);
    }

    // 開局完成後停在爆發階段
    const active = track?.querySelector('.phase-step--active');
    expect(active?.textContent).toContain('爆發');
  });

  it('滑鼠移入卡片會顯示詳細資訊浮層，移出後消失', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;

    // 開局先選完生命卡才能進到正常對局
    const setupDialog = el.querySelector('.popover--accent');
    for (let i = 0; i < 3; i++) {
      (setupDialog!.querySelectorAll('app-card-view button')[i] as HTMLButtonElement).click();
      fixture.detectChanges();
    }
    await fixture.whenStable();

    // 一開始不該有浮層
    expect(el.querySelector('.card-tooltip'), '未移入時不該有浮層').toBeNull();

    // 移入手牌第一張
    const card = el.querySelector('app-card-view button') as HTMLButtonElement;
    expect(card, '應該有手牌').toBeTruthy();
    card.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    const tooltip = el.querySelector('.card-tooltip');
    expect(tooltip, '移入卡片應該顯示浮層').toBeTruthy();
    // 浮層要顯示完整資訊，而不只是卡名
    expect(tooltip?.textContent).toContain('費用');
    expect(tooltip?.textContent).toContain('防禦');

    // 移出後消失
    card.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(el.querySelector('.card-tooltip'), '移出後浮層應該消失').toBeNull();
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

  it('雙方資源堆疊中，冷卻區位於棄牌堆右邊、等級堆左邊', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const pileContainers = el.querySelectorAll('.flex.shrink-0.items-center.justify-center');
    expect(pileContainers.length).toBeGreaterThanOrEqual(2);

    for (const container of Array.from(pileContainers)) {
      const stacks = Array.from(container.querySelectorAll('.pile-stack'));
      const classNames = stacks.map((s) => Array.from(s.classList).find((c) => c.startsWith('pile-stack--')) ?? '');

      const discardIdx = classNames.findIndex((c) => c.includes('discard'));
      const cooldownIdx = classNames.findIndex((c) => c.includes('cooldown'));
      const levelIdx = classNames.findIndex((c) => c.includes('level'));

      expect(discardIdx, '必須有棄牌堆').toBeGreaterThanOrEqual(0);
      expect(cooldownIdx, '必須有冷卻區').toBeGreaterThanOrEqual(0);
      expect(levelIdx, '必須有等級堆').toBeGreaterThanOrEqual(0);

      expect(cooldownIdx, '冷卻區必須在棄牌堆右邊').toBe(discardIdx + 1);
      expect(levelIdx, '等級堆必須在冷卻區右邊（冷卻區在等級堆左邊）').toBe(cooldownIdx + 1);
    }
  });

  it('日誌具有分類過濾（全部/戰鬥/任務/系統）與展開收合功能', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    expect(app.logExpanded()).toBe(false);
    app.toggleLogExpanded();
    expect(app.logExpanded()).toBe(true);
    app.toggleLogExpanded();
    expect(app.logExpanded()).toBe(false);

    expect(app.logFilter()).toBe('all');
    app.setLogFilter('combat');
    expect(app.logFilter()).toBe('combat');
    app.setLogFilter('quest');
    expect(app.logFilter()).toBe('quest');
    app.setLogFilter('system');
    expect(app.logFilter()).toBe('system');
    app.setLogFilter('all');
    expect(app.logFilter()).toBe('all');
  });
});
