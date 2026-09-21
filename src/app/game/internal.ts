/**
 * 《氣脈》— 引擎低階操作
 *
 * 這一層只處理「卡牌在區域之間移動」「抽牌」「重構」「增益查詢」這類基礎動作，
 * 不含任何規則判斷（規則在 engine / combat / quests）。所有模組都依賴這一層，
 * 依賴方向固定為：internal ← effects ← quests ← combat ← engine（單向，不會循環）。
 */

import { card } from './cards';
import { Rng } from './rng';
import type {
  Buff,
  CardInstance,
  GameState,
  LogTone,
  ModifierTarget,
  PendingRebuild,
  Seat,
  SideState,
  TurnStats,
} from './types';
import { OTHER_SEAT } from './types';

// ─────────────────────────────────────────────
// 顯示用
// ─────────────────────────────────────────────

/** 座位的顯示名稱。以「你」為視角，回報給玩家看 */
export function seatLabel(seat: Seat | null): string {
  if (seat === null) return '';
  return seat === 'player' ? '你' : '對手';
}

/** 以指定視角稱呼某座位（NPC 回合時，「你」指的是 NPC 自己） */
export function seatLabelFrom(viewer: Seat, seat: Seat): string {
  return seat === viewer ? '你' : '對手';
}

// ─────────────────────────────────────────────
// 基本建構
// ─────────────────────────────────────────────

export function emptyStats(): TurnStats {
  return {
    playKind: { equipment: 0, action: 0, event: 0, quest: 0, technique: 0 },
    playTier: { trick: 0, secret: 0, ultimate: 0, hidden: 0 },
    damageTaken: 0,
    damageDealt: 0,
    drawn: 0,
    recovered: 0,
    rebuilt: 0,
    combos: [],
    tierSequence: [],
  };
}

export function resetTurnStats(side: SideState): void {
  side.stats = emptyStats();
  side.eventsUsedThisTurn = 0;
  side.questResolvedThisTurn = false;
}

/** 建立一張實體卡 */
export function makeInstance(state: GameState, defId: string): CardInstance {
  card(defId); // 驗證 id 存在，不存在就當場拋錯
  return { iid: state.nextIid++, defId };
}

/**
 * 借用 RNG。用法：
 *   const shuffled = withRng(state, (rng) => rng.shuffle(deck));
 * 產生的隨機序列完全由 state.rngState 決定，因此同一 seed 必然重現同一局。
 */
export function withRng<T>(state: GameState, fn: (rng: Rng) => T): T {
  const rng = new Rng(state.rngState);
  const result = fn(rng);
  state.rngState = rng.snapshot();
  return result;
}

// ─────────────────────────────────────────────
// 日誌
// ─────────────────────────────────────────────

export function log(state: GameState, seat: Seat | null, text: string, tone: LogTone = 'info'): void {
  state.log.push({ turn: state.turn, seat, text, tone });
}

/** 取卡名（找不到定義時退回 id，避免整個 UI 因為一張壞卡崩掉） */
export function nameOf(inst: CardInstance): string {
  try {
    return card(inst.defId).name;
  } catch {
    return inst.defId;
  }
}

// ─────────────────────────────────────────────
// 增益與常駐冷卻加成
// ─────────────────────────────────────────────

/** 某座位在指定數值上的增益總和（包含主動 BUFF 與冷卻區常駐效果） */
export function modifier(state: GameState, seat: Seat, target: ModifierTarget): number {
  const side = state.sides[seat];
  const fromBuffs = side.buffs
    .filter((b) => b.target === target)
    .reduce((sum, b) => sum + b.amount, 0);

  const fromCooldown = side.cooldownZone
    .map((cd) => {
      try {
        return card(cd.card.defId).cooldownBuff;
      } catch {
        return undefined;
      }
    })
    .filter((cb): cb is NonNullable<typeof cb> => !!cb && cb.target === target)
    .reduce((sum, cb) => sum + cb.amount, 0);

  return fromBuffs + fromCooldown;
}

export function addBuff(side: SideState, buff: Omit<Buff, 'id'>, nextId: () => number): void {
  side.buffs.push({ ...buff, id: nextId() });
}

/** 檢查手牌中的卡片是否因冷卻區同名限制而無法打出（需符合儲存 storage(X) 條件） */
export function canPlayWithCooldown(state: GameState, seat: Seat, defId: string): boolean {
  const side = state.sides[seat];
  const countInCooldown = side.cooldownZone.filter((c) => c.card.defId === defId).length;
  if (countInCooldown === 0) return true;
  const def = card(defId);
  const storage = def.storage ?? 1;
  return countInCooldown < storage;
}

/** 是否裝備了某部位的卡 */
export function hasEquipped(state: GameState, seat: Seat, slot: string): boolean {
  return state.sides[seat].equipment.some((c) => card(c.defId).slot === slot);
}

/** 該座位目前可用的（未橫置）生命卡數 */
export function availableLife(state: GameState, seat: Seat): number {
  return state.sides[seat].life.filter((l) => !l.tapped).length;
}

// ─────────────────────────────────────────────
// 費用
// ─────────────────────────────────────────────

/**
 * 支付費用：橫置 N 張生命卡。
 * 生命卡在重置階段會復原，所以這是「每回合可用的資源」，不是永久消耗。
 * 回傳是否支付成功。
 */
export function payLifeCost(state: GameState, seat: Seat, n: number): boolean {
  const side = state.sides[seat];
  const usable = side.life.filter((l) => !l.tapped);
  if (usable.length < n) return false;
  for (let i = 0; i < n; i++) usable[i].tapped = true;
  return true;
}

/**
 * 支付怒氣費用：捨棄怒氣區最上面 N 張卡，放進棄牌區。
 * 回傳是否支付成功。這是「把累積的怒氣換成力量」的機制。
 */
export function payAngerCost(state: GameState, seat: Seat, n: number): boolean {
  const side = state.sides[seat];
  if (side.anger.length < n) return false;

  for (let i = 0; i < n; i++) {
    const c = side.anger.pop();
    if (!c) break;
    side.discard.push(c);
  }
  return true;
}

/** 重置階段：把所有橫置的生命卡復原 */
export function readyAllLife(state: GameState, seat: Seat): void {
  let count = 0;
  for (const l of state.sides[seat].life) {
    if (l.tapped) {
      l.tapped = false;
      count++;
    }
  }
  if (count > 0) {
    log(state, seat, `${seatLabel(seat)}的 ${count} 張生命卡已重置復原（可再次支付費用）。`, 'info');
  }
}

// ─────────────────────────────────────────────
// 抽牌與重構
// ─────────────────────────────────────────────

/** 重構的結果：完成 / 等待玩家選擇 / 失敗（遊戲結束） */
export type RebuildResult = 'done' | 'pending' | 'failed';

/**
 * 重構：牌組沒牌時觸發。
 *   1. 從生命區取 1 張卡加入手牌（生命區已空 → 該方敗北）
 *   2. 將棄牌區全部洗勻成為新牌組（棄牌區也空 → 無法重建，該方敗北）
 *
 * 生命區有多張時，**玩家要自己挑哪一張進手牌**，所以這裡會回傳 'pending'
 * 並把遊戲停在待決狀態，等 UI 呼叫 resolveRebuild() 接手。
 * NPC 沒這個待遇，直接由 chooseLifeForNpc() 決定。
 *
 * remaining / resume 用來記住「重構打斷了什麼」，
 * 例如抽牌抽到一半牌組就空了，選完之後要繼續把剩下的抽完。
 */
export function rebuild(
  state: GameState,
  seat: Seat,
  remaining = 0,
  resume: PendingRebuild['resume'] = 'draw',
): RebuildResult {
  const side = state.sides[seat];

  if (side.life.length === 0) {
    log(state, seat, `${seatLabel(seat)}的生命區已空，無法重構。`, 'rebuild');
    endGame(state, OTHER_SEAT[seat]);
    return 'failed';
  }

  // 只剩一張就沒得選，不必打擾玩家
  if (side.life.length === 1) {
    return finishRebuild(state, seat, side.life[0].card.iid, remaining, resume);
  }

  if (seat === 'player') {
    state.pendingRebuild = { seat, remaining, resume };
    log(state, seat, '【牌組耗盡・重構】請從你的生命區挑選 1 張卡加入手牌。', 'rebuild');
    return 'pending';
  }

  return finishRebuild(state, seat, chooseLifeForNpc(state, seat), remaining, resume);
}

/** NPC 挑生命卡：取第一張。生命卡不參與戰鬥，挑哪張對 AI 的實際影響很小 */
function chooseLifeForNpc(state: GameState, seat: Seat): number {
  const life = state.sides[seat].life;
  return life.length > 0 ? life[0].card.iid : -1;
}

/** 實際執行重構：指定的生命卡進手牌，棄牌區洗成新牌組 */
function finishRebuild(
  state: GameState,
  seat: Seat,
  iid: number,
  _remaining: number,
  _resume: PendingRebuild['resume'],
): RebuildResult {
  const side = state.sides[seat];

  const idx = side.life.findIndex((l) => l.card.iid === iid);
  const picked = idx >= 0 ? side.life.splice(idx, 1)[0] : side.life.shift();

  if (!picked) {
    log(state, seat, `${seatLabel(seat)}的生命區已空，無法重構。`, 'rebuild');
    endGame(state, OTHER_SEAT[seat]);
    state.pendingRebuild = null;
    return 'failed';
  }

  side.hand.push(picked.card);
  side.stats.rebuilt++;
  log(
    state,
    seat,
    `【重構扣血】${seatLabel(seat)}從生命區取回「${nameOf(picked.card)}」加入手牌（生命區剩餘 ${side.life.length} 張）。`,
    'rebuild',
  );

  if (side.discard.length === 0) {
    log(state, seat, `${seatLabel(seat)}的棄牌區也是空的，無法重建牌組。`, 'rebuild');
    endGame(state, OTHER_SEAT[seat]);
    state.pendingRebuild = null;
    return 'failed';
  }

  side.deck = withRng(state, (rng) => rng.shuffle(side.discard));
  const size = side.deck.length;
  side.discard = [];
  log(state, seat, `【牌組重構】${seatLabel(seat)}將棄牌區 ${size} 張卡洗勻成為新牌組。`, 'rebuild');

  state.pendingRebuild = null;
  return 'done';
}

/**
 * 玩家挑完生命卡後接手：完成重構，並把當初被打斷的動作補完。
 */
export function resolveRebuild(state: GameState, iid: number): void {
  const pending = state.pendingRebuild;
  if (!pending || state.winner) return;

  const { seat, remaining, resume } = pending;
  const result = finishRebuild(state, seat, iid, remaining, resume);

  if (result !== 'done' || remaining <= 0 || state.winner) return;

  switch (resume) {
    case 'draw':
      draw(state, seat, remaining);
      break;
    case 'anger':
      millToAnger(state, seat, remaining);
      break;
    case 'discard':
      millToDiscard(state, seat, remaining);
      break;
  }
}

/**
 * 抽 N 張卡。中途牌組空了會即時觸發重構（規則：重構時暫停未解決的效果）。
 * 若重構需要玩家選擇，這裡會停下，剩下的張數由 resolveRebuild() 補完。
 */
export function draw(state: GameState, seat: Seat, n: number): number {
  const side = state.sides[seat];
  let drawn = 0;

  for (let i = 0; i < n; i++) {
    if (state.winner || state.pendingRebuild) break;

    if (side.deck.length === 0) {
      const result = rebuild(state, seat, n - i, 'draw');
      if (result !== 'done') break;
    }

    const top = side.deck.shift();
    if (!top) break;

    side.hand.push(top);
    side.stats.drawn++;
    drawn++;
  }

  return drawn;
}

/** 把牌組頂 N 張送進怒氣區，並回傳移入的卡片實例 */
export function millToAngerCards(state: GameState, seat: Seat, n: number): { count: number; cards: CardInstance[] } {
  const side = state.sides[seat];
  const movedCards: CardInstance[] = [];

  for (let i = 0; i < n; i++) {
    if (state.winner || state.pendingRebuild) break;

    if (side.deck.length === 0) {
      const result = rebuild(state, seat, n - i, 'anger');
      if (result !== 'done') break;
    }

    const top = side.deck.shift();
    if (!top) break;
    side.anger.push(top);
    movedCards.push(top);
  }

  side.stats.damageTaken += movedCards.length;
  return { count: movedCards.length, cards: movedCards };
}

/** 把牌組頂 N 張直接送進怒氣區（等同受到 N 點傷害，但不由戰鬥產生） */
export function millToAnger(state: GameState, seat: Seat, n: number): number {
  return millToAngerCards(state, seat, n).count;
}

/** 把牌組頂 N 張丟進棄牌區（爆發階段的代價） */
export function millToDiscard(state: GameState, seat: Seat, n: number): number {
  const side = state.sides[seat];
  let moved = 0;

  for (let i = 0; i < n; i++) {
    if (state.winner || state.pendingRebuild) break;

    if (side.deck.length === 0) {
      const result = rebuild(state, seat, n - i, 'discard');
      if (result !== 'done') break;
    }

    const top = side.deck.shift();
    if (!top) break;
    side.discard.push(top);
    moved++;
  }

  return moved;
}

/**
 * 回復N：將怒氣區 N 張卡放回牌組頂，並回傳移入的卡片實例。
 * 裝備「聚氣玉」會讓 N 增加（recoverAmount 增益）。
 */
export function recoverCards(state: GameState, seat: Seat, n: number): { count: number; cards: CardInstance[] } {
  const side = state.sides[seat];
  const amount = Math.max(0, n + modifier(state, seat, 'recoverAmount'));
  const movedCards: CardInstance[] = [];

  for (let i = 0; i < amount; i++) {
    const c = side.anger.pop();
    if (!c) break;
    side.deck.unshift(c); // 放回牌組「頂部」（deck[0] 是頂，和抽牌的 shift 對應）
    movedCards.push(c);
  }

  side.stats.recovered += movedCards.length;
  return { count: movedCards.length, cards: movedCards };
}

export function recover(state: GameState, seat: Seat, n: number): number {
  return recoverCards(state, seat, n).count;
}

// ─────────────────────────────────────────────
// 區域移動
// ─────────────────────────────────────────────

export function toDiscard(state: GameState, seat: Seat, cards: CardInstance[]): void {
  state.sides[seat].discard.push(...cards);
}

/** 將卡片置於怒氣區最底部 */
export function toAngerBottom(state: GameState, seat: Seat, cards: CardInstance[]): void {
  // anger[0] 是最底部，pop() 是從頂部拿
  state.sides[seat].anger.unshift(...cards);
}

/** 將卡片送入冷卻區 */
export function toCooldownZone(state: GameState, seat: Seat, cardInst: CardInstance, cooldown: number): void {
  state.sides[seat].cooldownZone.push({
    card: cardInst,
    counter: 0,
    maxCounter: cooldown,
  });
}

/** 依據卡片屬性決定使用後的去處（怒氣底 / 冷卻區 / 棄牌區） */
export function routeCardAfterPlay(state: GameState, seat: Seat, inst: CardInstance): void {
  const def = card(inst.defId);
  if (def.toAngerBottom) {
    toAngerBottom(state, seat, [inst]);
    log(state, seat, `${seatLabel(seat)}的「${def.name}」進入怒氣區最底部【怒底】。`, 'info');
  } else if (def.cooldown && def.cooldown > 0) {
    toCooldownZone(state, seat, inst, def.cooldown);
    log(state, seat, `${seatLabel(seat)}的「${def.name}」進入冷卻區（需冷卻 ${def.cooldown} 回合）。`, 'info');
  } else {
    toDiscard(state, seat, [inst]);
  }
}

/** 回合開始時推進冷卻區計時器，達成者送入棄牌區 */
export function tickCooldowns(state: GameState, seat: Seat): void {
  const side = state.sides[seat];
  if (side.cooldownZone.length === 0) return;

  const remaining: typeof side.cooldownZone = [];
  for (const cd of side.cooldownZone) {
    cd.counter++;
    if (cd.counter >= cd.maxCounter) {
      side.discard.push(cd.card);
      log(state, seat, `${seatLabel(seat)}的「${nameOf(cd.card)}」冷卻完成，進入棄牌區。`, 'info');
    } else {
      remaining.push(cd);
      log(state, seat, `${seatLabel(seat)}的「${nameOf(cd.card)}」冷卻推進（剩餘 ${cd.maxCounter - cd.counter} 回合）。`, 'info');
    }
  }
  side.cooldownZone = remaining;
}

/** 從手牌移除指定卡並回傳（找不到回傳 null） */
export function takeFromHand(state: GameState, seat: Seat, iid: number): CardInstance | null {
  const side = state.sides[seat];
  const idx = side.hand.findIndex((c) => c.iid === iid);
  if (idx < 0) return null;
  return side.hand.splice(idx, 1)[0];
}

// ─────────────────────────────────────────────
// 增益到期
// ─────────────────────────────────────────────

/**
 * 處理增益到期。
 *   turnStart(seat)：移除 seat 身上「到下個自己回合開始」的增益
 *   turnEnd(seat)：移除 seat 身上「到本回合結束」，以及對手身上「到對手回合結束」的增益
 */
export function expireBuffs(state: GameState, seat: Seat, at: 'turnStart' | 'turnEnd'): void {
  const own = state.sides[seat];
  const opp = state.sides[OTHER_SEAT[seat]];

  if (at === 'turnStart') {
    own.buffs = own.buffs.filter((b) => b.expiry.at !== 'nextOwnTurnStart');
  } else {
    own.buffs = own.buffs.filter((b) => b.expiry.at !== 'thisTurnEnd');
    opp.buffs = opp.buffs.filter((b) => b.expiry.at !== 'opponentTurnEnd');
  }
}

// ─────────────────────────────────────────────
// 勝負
// ─────────────────────────────────────────────

export function endGame(state: GameState, winner: Seat): void {
  if (state.winner) return;
  state.winner = winner;
  state.phase = 'ended';
  log(state, null, `遊戲結束：${seatLabel(winner)}獲勝。`, 'system');
}

/** 取出一個座位的完整快照摘要（給 UI 或 AI 評估用） */
export function sideSummary(state: GameState, seat: Seat) {
  const s = state.sides[seat];
  return {
    seat,
    level: s.level,
    deck: s.deck.length,
    hand: s.hand.length,
    life: s.life.length,
    lifeReady: s.life.filter((l) => !l.tapped).length,
    anger: s.anger.length,
    discard: s.discard.length,
    equipment: s.equipment.length,
  };
}
