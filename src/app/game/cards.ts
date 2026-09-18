/**
 * 《氣脈》— 卡表
 *
 * 全部卡片都是資料。要新增卡片，只需要在 CARD_DEFS 加一筆，
 * 不需要改動引擎（除非用到全新的 Effect 型別）。
 */

import type {
  CardDef,
  CardKind,
  Effect,
  EquipSlot,
  QuestCondition,
  TechniqueTier,
} from './types';
import { RULES } from './types';

// ─────────────────────────────────────────────
// 建卡輔助函式（讓卡表讀起來像卡表，而不是像程式碼）
// ─────────────────────────────────────────────

interface TechOpts {
  damage?: number;
  guard?: number;
  cost?: number;
  angerCost?: number;
  liberation?: CardDef['liberation'];
  comboBonus?: CardDef['comboBonus'];
  effects?: Effect[];
}

function technique(
  id: string,
  name: string,
  tier: TechniqueTier,
  opts: TechOpts,
  text: string,
): CardDef {
  return {
    id,
    name,
    kind: 'technique',
    tier,
    damage: opts.damage ?? 0,
    guard: opts.guard ?? 1,
    cost: opts.cost ?? 0,
    angerCost: opts.angerCost,
    liberation: opts.liberation,
    comboBonus: opts.comboBonus,
    effects: opts.effects,
    text,
  };
}

interface EquipOpts {
  guard?: number;
  cost?: number;
  level?: number;
  effects?: Effect[];
}

function equipment(
  id: string,
  name: string,
  slot: EquipSlot,
  opts: EquipOpts,
  text: string,
): CardDef {
  return {
    id,
    name,
    kind: 'equipment',
    slot,
    guard: opts.guard ?? 0,
    cost: opts.cost ?? 1,
    levelRequirement: opts.level ?? 1,
    effects: opts.effects,
    text,
  };
}

function action(id: string, name: string, guard: number, cost: number, effects: Effect[], text: string): CardDef {
  return { id, name, kind: 'action', guard, cost, effects, text };
}

function event(id: string, name: string, guard: number, cost: number, effects: Effect[], text: string): CardDef {
  return { id, name, kind: 'event', guard, cost, effects, text };
}

function quest(
  id: string,
  name: string,
  starter: boolean,
  complete: QuestCondition,
  completeText: string,
  block: QuestCondition,
  blockText: string,
  text: string,
): CardDef {
  return {
    id,
    name,
    kind: 'quest',
    guard: 0,
    // 任務卡在主要階段打出時，同樣需要橫置生命卡支付費用
    cost: 1,
    quest: { starter, complete, completeText, block, blockText },
    text,
  };
}

// ─────────────────────────────────────────────
// 招式卡
// ─────────────────────────────────────────────

const TECHNIQUES: CardDef[] = [
  // ── 特技：低傷害、低代價，連招的起手 ──
  technique('trick_beng', '崩拳', 'trick', { damage: 1, guard: 1 }, '最直白的一記直擊。'),
  technique('trick_chan', '纏絲手', 'trick', { damage: 0, guard: 3 }, '化勁卸力，以守代攻。防禦值高。'),
  technique('trick_ta', '踏影步', 'trick', { damage: 1, guard: 2 }, '踏影而進，身形難測。'),
  technique('trick_cun', '寸勁', 'trick', { damage: 2, guard: 1 }, '貼身爆發，距離越短力道越沉。'),

  // ── 密技：中堅戰力，連招的銜接 ──
  technique(
    'secret_lie',
    '裂空掌',
    'secret',
    { damage: 2, guard: 2, comboBonus: { sequence: ['trick', 'secret'], damage: 2 } },
    '掌風裂空。若接在特技之後，這一擊威力更增（+2 傷害）。',
  ),
  technique(
    'secret_hui',
    '迴天腳',
    'secret',
    { damage: 3, guard: 1, comboBonus: { sequence: ['trick', 'secret'], damage: 2 } },
    '旋身迴踢。若接在特技之後，這一擊威力更增（+2 傷害）。',
  ),
  technique('secret_suo', '鎖脈手', 'secret', { damage: 2, guard: 2 }, '封鎖經脈，令對手防禦鬆動。'),
  technique(
    'secret_nutao',
    '怒濤掌',
    'secret',
    { damage: 4, guard: 2, angerCost: 2 },
    '捨棄怒氣區 2 張卡。將積累的怒氣化為掌力。',
  ),

  // ── 奧義：主力傷害 ──
  technique('ult_guan', '貫脈衝', 'ultimate', { damage: 4, guard: 2, cost: 1 }, '一擊貫通氣脈。需橫置 1 張生命卡。'),
  technique(
    'ult_fen',
    '焚心訣',
    'ultimate',
    { damage: 5, guard: 1, cost: 0, effects: [{ type: 'mill', n: 2 }] },
    '焚我心神換取力量。對自己造成 2 點傷害。',
  ),

  // ── 密奧義：王牌，需解放條件，合計最多 6 張 ──
  technique(
    'ult_nuqi',
    '怒氣爆發',
    'ultimate',
    { damage: 6, guard: 1, angerCost: 3 },
    '捨棄怒氣區 3 張卡。傾瀉而出的爆發一擊。',
  ),
  technique(
    'hidden_tian',
    '天罡滅脈',
    'hidden',
    {
      damage: 7,
      guard: 4,
      cost: 1,
      liberation: { type: 'usedTierThisTurn', tier: 'ultimate' },
      effects: [
        {
          type: 'conditional',
          when: { type: 'combo', sequence: ['ultimate', 'hidden'] },
          effect: { type: 'recover', n: 2 },
        },
      ],
    },
    '【解放：本回合已使用奧義】傾盡天罡之氣。若接在奧義之後，回復 2 張。',
  ),
  technique(
    'hidden_wu',
    '無相氣海',
    'hidden',
    {
      damage: 6,
      guard: 5,
      cost: 1,
      liberation: { type: 'usedTierThisTurn', tier: 'secret' },
      effects: [{ type: 'recover', n: 3 }],
    },
    '【解放：本回合已使用密技】氣海無相。使用後回復 3 張。',
  ),
];

// ─────────────────────────────────────────────
// 裝備卡
// ─────────────────────────────────────────────

const EQUIPMENTS: CardDef[] = [
  equipment(
    'eq_duanyue',
    '斷嶽刀',
    'weapon',
    {
      level: 1,
      guard: 1,
      effects: [{ type: 'modify', target: 'techniqueDamage', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【武器・等級1】所有招式傷害 +1。',
  ),
  equipment(
    'eq_chanqi',
    '纏氣手套',
    'weapon',
    {
      level: 2,
      guard: 2,
      effects: [{ type: 'modify', target: 'hiddenDamage', amount: 2, expiry: { at: 'permanent' } }],
    },
    '【武器・等級2】密奧義傷害 +2。',
  ),
  equipment(
    'eq_jingxin',
    '靜心冠',
    'helmet',
    {
      level: 1,
      guard: 2,
      effects: [{ type: 'modify', target: 'guardValue', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【頭盔・等級1】防禦值 +1。',
  ),
  equipment(
    'eq_xuantie',
    '玄鐵面',
    'helmet',
    {
      level: 2,
      guard: 3,
      effects: [{ type: 'extraGuard', n: 1, expiry: { at: 'permanent' } }],
    },
    '【頭盔・等級2】防禦判定時額外翻開 1 張防禦卡。',
  ),
  equipment(
    'eq_hukou',
    '虎口纏',
    'glove',
    {
      level: 1,
      guard: 1,
      effects: [{ type: 'modify', target: 'techniqueDamage', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【手套・等級1】所有招式傷害 +1。',
  ),
  equipment(
    'eq_tayun',
    '踏雲靴',
    'boots',
    {
      level: 1,
      guard: 1,
      effects: [{ type: 'modify', target: 'drawCount', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【鞋子・等級1】抽牌階段多抽 1 張。',
  ),
  equipment(
    'eq_juqi',
    '聚氣玉',
    'accessory',
    {
      level: 1,
      guard: 0,
      effects: [{ type: 'modify', target: 'recoverAmount', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【飾品・等級1】所有「回復N」的 N +1。',
  ),
  equipment(
    'eq_huxin',
    '護心鏡',
    'accessory',
    {
      level: 2,
      guard: 2,
      effects: [{ type: 'modify', target: 'guardValue', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【飾品・等級2】防禦值 +1。',
  ),
];

// ─────────────────────────────────────────────
// 行動卡
// ─────────────────────────────────────────────

const ACTIONS: CardDef[] = [
  action('act_ning', '凝神', 1, 0, [{ type: 'draw', n: 2 }], '調勻呼吸。抽 2 張卡。'),
  action('act_tuna', '吐納', 2, 1, [{ type: 'recover', n: 3 }], '回復 3：將怒氣區 3 張卡放回牌組頂。'),
  action(
    'act_xunxi',
    '尋隙',
    1,
    1,
    [{ type: 'search', look: 3, pick: 1 }],
    '看牌組頂 3 張，取 1 張加入手牌，其餘進棄牌區。',
  ),
  action(
    'act_shiyi',
    '拾遺',
    1,
    1,
    [{ type: 'salvage', n: 1 }],
    '從棄牌區取 1 張卡加入手牌。',
  ),
  action('act_sanshou', '散手', 1, 0, [{ type: 'discardHand', n: 1 }, { type: 'draw', n: 2 }], '棄 1 張手牌，抽 2 張。'),
  action(
    'act_naqi',
    '納氣',
    1,
    1,
    [{ type: 'recover', n: 2 }, { type: 'draw', n: 1 }],
    '回復 2：怒氣區 2 張卡放回牌組頂，然後抽 1 張。',
  ),
  action('act_qihai', '氣海歸流', 1, 2, [{ type: 'recover', n: 5 }], '回復 5：將怒氣區 5 張卡放回牌組頂。'),
];

// ─────────────────────────────────────────────
// 事件卡（每回合最多使用 1 張）
// ─────────────────────────────────────────────

const EVENTS: CardDef[] = [
  event(
    'ev_qishi',
    '氣勢如虹',
    1,
    1,
    [{ type: 'modify', target: 'techniqueDamage', amount: 2, expiry: { at: 'thisTurnEnd' } }],
    '本回合內，我方所有招式傷害 +2。',
  ),
  event(
    'ev_tiebi',
    '鐵壁',
    2,
    1,
    [{ type: 'modify', target: 'guardValue', amount: 2, expiry: { at: 'opponentTurnEnd' } }],
    '到對手回合結束前，我方防禦值 +2。',
  ),
  event(
    'ev_huichun',
    '回春',
    1,
    1,
    [{ type: 'modify', target: 'recoverAmount', amount: 2, expiry: { at: 'thisTurnEnd' } }],
    '本回合內，所有「回復N」的 N +2。',
  ),
  event(
    'ev_pojun',
    '破軍',
    1,
    0,
    [
      { type: 'modify', target: 'techniqueDamage', amount: 3, expiry: { at: 'thisTurnEnd' } },
      { type: 'mill', n: 1 },
    ],
    '本回合招式傷害 +3，但對自己造成 1 點傷害。',
  ),
];

// ─────────────────────────────────────────────
// 任務卡（雙面條件）
//   complete — 我方達成 → 任務完成，等級 +1
//   block    — 對手促成 → 我方任務失敗，此卡回到手牌
// ─────────────────────────────────────────────

const QUESTS: CardDef[] = [
  quest(
    'q_shishi',
    '初試身手',
    true,
    { type: 'playKindInTurn', kind: 'technique', n: 2 },
    '一個回合內打出 2 張招式卡',
    { type: 'takeDamageInTurn', n: 5 },
    '一個回合內受到 5 點以上傷害',
    '起始任務。先證明你出得了手。',
  ),
  quest(
    'q_lianji',
    '連擊之證',
    false,
    { type: 'comboInTurn', sequence: ['trick', 'secret'] },
    '一個回合內成立一次連招',
    { type: 'takeDamageInTurn', n: 6 },
    '一個回合內受到 6 點以上傷害',
    '證明你的招式銜接得上。',
  ),
  quest(
    'q_xushi',
    '蓄勢待發',
    false,
    { type: 'handAtLeast', n: 6 },
    '回合結束時手牌達 6 張以上',
    { type: 'takeDamageInTurn', n: 8 },
    '一個回合內受到 8 點以上傷害',
    '手裡有牌，心裡不慌。',
  ),
  quest(
    'q_nuqi',
    '怒氣奔流',
    false,
    { type: 'recoverInTurn', n: 4 },
    '一個回合內回復 4 張以上',
    { type: 'takeDamageInTurn', n: 5 },
    '一個回合內受到 5 點以上傷害',
    '把怒氣化為力量收回。',
  ),
  quest(
    'q_dacheng',
    '大成之境',
    false,
    { type: 'playTierInTurn', tier: 'hidden', n: 1 },
    '一個回合內打出 1 張密奧義',
    { type: 'takeDamageInTurn', n: 10 },
    '一個回合內受到 10 點以上傷害',
    '氣脈大成，只差臨門一腳。',
  ),
];

// ─────────────────────────────────────────────
// 對外匯出
// ─────────────────────────────────────────────

export const CARD_DEFS: CardDef[] = [...TECHNIQUES, ...EQUIPMENTS, ...ACTIONS, ...EVENTS, ...QUESTS];

const CARD_INDEX = new Map<string, CardDef>(CARD_DEFS.map((c) => [c.id, c]));

/** 依 id 取卡牌定義。找不到時直接拋錯，避免默默產生壞資料 */
export function card(id: string): CardDef {
  const def = CARD_INDEX.get(id);
  if (!def) throw new Error(`未知的卡牌 id：${id}`);
  return def;
}

export function findCard(id: string): CardDef | undefined {
  return CARD_INDEX.get(id);
}

/** 主牌組（可放到主牌組的卡，不含任務卡） */
export function mainDeckPool(): CardDef[] {
  return CARD_DEFS.filter((c) => c.kind !== 'quest');
}

/** 任務卡池 */
export function questPool(): CardDef[] {
  return CARD_DEFS.filter((c) => c.kind === 'quest');
}

// ─────────────────────────────────────────────
// 預設牌組
// ─────────────────────────────────────────────

/** 主牌組：卡 id → 張數。合計必須是 50 張 */
export const STARTER_MAIN_DECK: Readonly<Record<string, number>> = {
  // 特技 9
  trick_beng: 3,
  trick_chan: 2,
  trick_ta: 2,
  trick_cun: 2,
  // 密技 9
  secret_lie: 3,
  secret_hui: 2,
  secret_suo: 2,
  secret_nutao: 2,
  // 奧義 7
  ult_guan: 3,
  ult_fen: 2,
  ult_nuqi: 2,
  // 密奧義 4（合計上限 6）
  hidden_tian: 2,
  hidden_wu: 2,
  // 裝備 10
  eq_duanyue: 2,
  eq_chanqi: 1,
  eq_jingxin: 1,
  eq_xuantie: 1,
  eq_hukou: 1,
  eq_tayun: 2,
  eq_juqi: 1,
  eq_huxin: 1,
  // 行動 8
  act_ning: 1,
  act_tuna: 2,
  act_xunxi: 1,
  act_shiyi: 1,
  act_naqi: 2,
  act_qihai: 1,
  // 事件 3
  ev_qishi: 1,
  ev_tiebi: 1,
  ev_huichun: 1,
  // 合計 50
};

/** 任務牌組 5 張，且必須含至少 1 張起始任務 */
export const STARTER_QUEST_DECK: readonly string[] = [
  'q_shishi',
  'q_lianji',
  'q_xushi',
  'q_nuqi',
  'q_dacheng',
];

// ─────────────────────────────────────────────
// 構築規則驗證
// ─────────────────────────────────────────────

export interface DeckIssue {
  message: string;
}

/**
 * 驗證主牌組是否合法。回傳問題清單，空陣列代表合法。
 * UI 可以在玩家自組牌組時即時顯示這些問題。
 */
export function validateMainDeck(counts: Readonly<Record<string, number>>): DeckIssue[] {
  const issues: DeckIssue[] = [];
  let total = 0;
  let hiddenTotal = 0;

  for (const [id, n] of Object.entries(counts)) {
    const def = CARD_INDEX.get(id);
    if (!def) {
      issues.push({ message: `未知的卡牌 id：${id}` });
      continue;
    }
    if (def.kind === 'quest') {
      issues.push({ message: `${def.name} 是任務卡，不能放入主牌組` });
      continue;
    }
    if (n <= 0) {
      issues.push({ message: `${def.name} 的張數必須大於 0` });
      continue;
    }
    total += n;

    if (def.tier === 'hidden') {
      hiddenTotal += n;
    } else if (n > RULES.maxCopiesPerName) {
      issues.push({ message: `${def.name} 同名卡最多 ${RULES.maxCopiesPerName} 張，目前 ${n} 張` });
    }
  }

  if (total !== RULES.mainDeckSize) {
    issues.push({ message: `主牌組必須剛好 ${RULES.mainDeckSize} 張，目前 ${total} 張` });
  }
  if (hiddenTotal > RULES.maxHiddenTechniques) {
    issues.push({ message: `密奧義合計最多 ${RULES.maxHiddenTechniques} 張，目前 ${hiddenTotal} 張` });
  }

  return issues;
}

/** 驗證任務牌組是否合法 */
export function validateQuestDeck(ids: readonly string[]): DeckIssue[] {
  const issues: DeckIssue[] = [];

  if (ids.length !== RULES.questDeckSize) {
    issues.push({ message: `任務牌組必須剛好 ${RULES.questDeckSize} 張，目前 ${ids.length} 張` });
  }

  const seen = new Set<string>();
  let starterCount = 0;

  for (const id of ids) {
    const def = CARD_INDEX.get(id);
    if (!def) {
      issues.push({ message: `未知的卡牌 id：${id}` });
      continue;
    }
    if (def.kind !== 'quest') {
      issues.push({ message: `${def.name} 不是任務卡` });
      continue;
    }
    if (seen.has(id)) {
      issues.push({ message: `任務牌組不能有同名卡：${def.name}` });
    }
    seen.add(id);
    if (def.quest?.starter) starterCount++;
  }

  if (starterCount === 0) {
    issues.push({ message: '任務牌組必須至少包含 1 張帶有「起始任務」特徵的任務卡' });
  }

  return issues;
}

/** 展開牌組清單成卡 id 陣列（依張數重複） */
export function expandDeck(counts: Readonly<Record<string, number>>): string[] {
  const out: string[] = [];
  for (const [id, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) out.push(id);
  }
  return out;
}

/** 取得卡片的種類顯示名（給 UI 用） */
export function kindOf(def: CardDef): CardKind {
  return def.kind;
}
