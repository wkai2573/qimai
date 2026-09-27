import { TestBed } from '@angular/core/testing';

import { App } from './app';
import { RAGE_MAIN_DECK } from './game/cards';
import { createGame } from './game/engine';
import { PHASE_LABEL, type Phase } from './game/types';
import type { P2PMessage } from './p2p/p2p-types';

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

  it('牌堆區置中為 [牌組]、[怒氣]、[棄牌]、[LEVEL]、[任務] 5 個牌堆，任務堆在 LEVEL 右邊', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const centerContainers = el.querySelectorAll('.pile-stacks-center');
    expect(centerContainers.length).toBe(2);

    for (const container of Array.from(centerContainers)) {
      const stacks = Array.from(container.querySelectorAll('.pile-stack'));
      expect(stacks.length).toBe(5);

      const labels = stacks.map((s) => s.querySelector('span:last-child')?.textContent?.trim());
      expect(labels).toEqual(['牌組', '怒氣', '棄牌', 'LEVEL', '任務']);

      // 任務堆只顯示張數，不能點開查看（不是按鈕）
      expect(stacks[4].tagName).toBe('DIV');
    }
  });

  it('冷卻區與詠唱區位於牌堆區最左側，且僅在該區域有牌時才顯示', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const leftContainers = el.querySelectorAll('.pile-stacks-left');
    expect(leftContainers.length).toBe(2);

    // 初始狀態下雙方冷卻與詠唱皆為空，不應渲染任何按鈕
    for (const container of Array.from(leftContainers)) {
      expect(container.children.length).toBe(0);
    }

    // 當我方有冷卻卡與詠唱卡時，最左側容器顯示這兩者
    (app.store as any)._state.update((s: any) => ({
      ...s,
      sides: {
        ...s.sides,
        player: {
          ...s.sides.player,
          cooldownZone: [
            { card: { iid: 888, defId: 'mg_tech_huoqiu' }, counter: 1, maxCounter: 3 },
          ],
          chantedCards: [
            { iid: 889, defId: 'mg_secret_fuzhou' },
          ],
        },
      },
    }));
    fixture.detectChanges();
    await fixture.whenStable();

    const playerLeft = el.querySelectorAll('.pile-area')[1].querySelector('.pile-stacks-left');
    expect(playerLeft?.querySelector('.pile-stack--cooldown')).toBeTruthy();
    expect(playerLeft?.querySelector('.pile-stack--chant')).toBeTruthy();
  });

  it('事件區顯示事件的持有者與指示物；可發動的我方裝備會亮框，點擊就發動並橫置', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    (app.store as any)._state.update((s: any) => ({
      ...s,
      phase: 'main',
      activeSeat: 'player',
      pending: null,
      eventZone: { card: { iid: 901, defId: 'rg_shenshenxian' }, owner: 'player', counters: 1 },
      sides: {
        ...s.sides,
        player: { ...s.sides.player, equipment: [{ iid: 902, defId: 'rg_eq_toujin' }], tappedEquipment: [], equipCounters: {} },
      },
    }));
    // 開場隨機局若是對手先攻，NPC 會進入思考狀態讓玩家不能操作；這裡明確設成輪到玩家
    app.store.npcThinking.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('我方事件');
    expect(el.textContent).toContain('1 / 2');

    const chip = el.querySelector('.equip-activatable') as HTMLElement | null;
    expect(chip).toBeTruthy();
    chip!.click();
    fixture.detectChanges();

    expect(app.store.state().sides.player.tappedEquipment).toContain(902);
    expect(el.querySelector('.equip-activatable')).toBeNull();
  });

  it('冷卻區卡牌能正確取得並顯示剩餘回合數', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    (app.store as any)._state.update((s: any) => ({
      ...s,
      sides: {
        ...s.sides,
        player: {
          ...s.sides.player,
          cooldownZone: [
            { card: { iid: 888, defId: 'mg_tech_huoqiu' }, counter: 1, maxCounter: 3 },
          ],
        },
      },
    }));
    fixture.detectChanges();
    await fixture.whenStable();

    // 剩餘回合 = maxCounter (3) - counter (1) = 2
    expect(app.getCooldownRemaining('player', 888)).toBe(2);

    // 打開冷卻區檢視彈窗
    app.openPile('player', 'cooldown');
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const modal = el.querySelector('.popover');
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toContain('剩餘 2 回合');
  });

  it('角色選擇介面可開啟牌組構築器並儲存自訂牌組', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    expect(app.isDeckBuilderOpen()).toBe(false);
    app.openDeckBuilder();
    expect(app.isDeckBuilderOpen()).toBe(true);

    fixture.detectChanges();
    await fixture.whenStable(); // 組牌器是 @defer 載入
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-deck-builder')).toBeTruthy();

    // 儲存修改後的牌組
    const custom = { ...app.playerCustomDeck(), cm_tiandi: 2, rg_tech_nuce: 2 };
    app.onDeckSaved(custom);
    expect(app.store.getCustomDeck(app.selectedPlayerChar())['cm_tiandi']).toBe(2);

    app.closeDeckBuilder();
    expect(app.isDeckBuilderOpen()).toBe(false);
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

  it('怒氣區、牌組與任務牌組皆為隱藏資訊，雙方皆不可查看內容', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    app.openPile('player', 'deck');
    expect(app.pileHidden()).toBe(true);

    app.openPile('player', 'anger');
    expect(app.pileHidden()).toBe(true);

    app.openPile('npc', 'anger');
    expect(app.pileHidden()).toBe(true);

    app.openPile('player', 'questDeck');
    expect(app.pileHidden()).toBe(true);

    app.openPile('player', 'discard');
    expect(app.pileHidden()).toBe(false);
  });

  it('P2P 客人連線後在大廳換英雄或改牌組，會把最新的英雄與牌組送給房主', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    const sent: P2PMessage[] = [];
    vi.spyOn(app.p2p, 'send').mockImplementation((msg) => void sent.push(msg));
    app.selectedPlayerChar.set('rage');
    app.p2p.role.set('guest');
    app.p2p.status.set('connected');
    await fixture.whenStable();
    expect(sent.at(-1)).toEqual({ type: 'GUEST_HELLO', hero: 'rage', deck: app.playerCustomDeck() });

    app.selectedPlayerChar.set('qigong');
    await fixture.whenStable();
    expect(sent.at(-1)).toMatchObject({ type: 'GUEST_HELLO', hero: 'qigong' });

    // 存檔後 playerCustomDeck 要讀到新牌組，並重新送給房主
    app.selectedPlayerChar.set('rage');
    const custom = { ...RAGE_MAIN_DECK, rg_tech_nuce: 3, cm_tiandi: 1 };
    app.onDeckSaved(custom);
    await fixture.whenStable();
    expect(app.playerCustomDeck()).toEqual(custom);
    expect(sent.at(-1)).toEqual({ type: 'GUEST_HELLO', hero: 'rage', deck: custom });

    // 對局進行中不再送，以免房主端的對手角色與盤面不符
    const game = createGame(1, { playerCharacter: 'mage', npcCharacter: 'rage', manualLifeSetupBoth: true, mode: 'p2p' });
    app.store.initAsP2PGuest(1, 'mage', 'rage', game);
    await fixture.whenStable();
    const countInGame = sent.length;
    app.showHeroSelect.set(true);
    app.selectedPlayerChar.set('qigong');
    await fixture.whenStable();
    expect(sent.length).toBe(countInGame);
  });
});
