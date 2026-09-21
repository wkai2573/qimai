/**
 * 《氣脈》— 卡表與角色預設牌組
 *
 * 三大角色（狂怒、秘法、氣功）專屬主牌組（各 50 張）與共通任務牌組（5 張）
 */

import type {
  CardDef,
  CardKind,
  CharacterId,
  Effect,
  EquipSlot,
  QuestCondition,
  TechniqueTier,
} from './types';
import { RULES } from './types';

// ─────────────────────────────────────────────
// 建卡輔助函式
// ─────────────────────────────────────────────

interface TechOpts {
  damage?: number;
  guard?: number;
  cost?: number;
  angerCost?: number;
  toAngerBottom?: boolean;
  chant?: CardDef['chant'];
  cooldown?: number;
  storage?: number;
  cooldownBuff?: CardDef['cooldownBuff'];
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
    toAngerBottom: opts.toAngerBottom,
    chant: opts.chant,
    cooldown: opts.cooldown,
    storage: opts.storage,
    cooldownBuff: opts.cooldownBuff,
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

interface ActionOpts {
  toAngerBottom?: boolean;
  cooldown?: number;
  storage?: number;
  cooldownBuff?: CardDef['cooldownBuff'];
}

function action(
  id: string,
  name: string,
  guard: number,
  cost: number,
  effects: Effect[],
  text: string,
  opts: ActionOpts = {},
): CardDef {
  return {
    id,
    name,
    kind: 'action',
    guard,
    cost,
    effects,
    text,
    toAngerBottom: opts.toAngerBottom,
    cooldown: opts.cooldown,
    storage: opts.storage,
    cooldownBuff: opts.cooldownBuff,
  };
}

interface EventOpts {
  toAngerBottom?: boolean;
  cooldown?: number;
  cooldownBuff?: CardDef['cooldownBuff'];
}

function event(
  id: string,
  name: string,
  guard: number,
  cost: number,
  effects: Effect[],
  text: string,
  opts: EventOpts = {},
): CardDef {
  return {
    id,
    name,
    kind: 'event',
    guard,
    cost,
    effects,
    text,
    toAngerBottom: opts.toAngerBottom,
    cooldown: opts.cooldown,
    cooldownBuff: opts.cooldownBuff,
  };
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
    guard: 2,
    cost: 0,
    quest: { starter, complete, completeText, block, blockText },
    text,
  };
}

// ─────────────────────────────────────────────
// 【狂怒】專屬卡牌（Rage）
// ─────────────────────────────────────────────

const RAGE_CARDS: CardDef[] = [
  // 行動
  action(
    'rg_xiefen',
    '洩憤',
    0,
    1,
    [{ type: 'rageSearchTech', look: 3 }],
    '【怒底】公開怒氣區頂 3 張卡，將其中的招式卡全部加入手牌，其餘送入棄牌區。使用後置於怒氣區底。',
    { toAngerBottom: true },
  ),
  action(
    'rg_renqi',
    '忍氣吞聲',
    1,
    2,
    [{ type: 'recoverHandCount' }],
    '回復 X（X = 自己的手牌數量）。',
  ),
  action(
    'rg_tiaoxin',
    '挑釁',
    1,
    1,
    [
      { type: 'draw', n: 2 },
      { type: 'forceOpponentHandToAnger' },
    ],
    '【怒底】雙方抽 2 張卡。對手選擇自己 1 張手牌放到其怒氣區底。使用後置於怒氣區底。',
    { toAngerBottom: true },
  ),
  action(
    'rg_weidai',
    '威嚇',
    1,
    1,
    [
      { type: 'mill', n: 2 },
      { type: 'forceOpponentHandToAnger', conditionHandAtLeast: 5 },
    ],
    '【怒底】對自己造成 2 點傷害（牌組頂 2 張進怒氣）。若對手手牌在 5 張以上，對手選擇 1 張手牌置於其怒氣區底。使用後置於怒氣區底。',
    { toAngerBottom: true },
  ),
  action(
    'rg_paohua',
    '拋下狠話',
    1,
    1,
    [
      { type: 'opponentDiscardTechnique' },
      { type: 'draw', n: 1 },
      { type: 'freeCardNext', targetDefId: 'rg_tizuiliang' },
    ],
    '【怒底】對手選擇 1 張招式卡捨棄（若無則展示手牌），然後我方抽 1 張。本回合下一張《替罪羊》免橫置費用。使用後置於怒氣區底。',
    { toAngerBottom: true },
  ),
  action(
    'rg_xueqi',
    '血氣逆行',
    0,
    1,
    [
      { type: 'mill', n: 2 },
      { type: 'draw', n: 2 },
    ],
    '自傷 2 點（牌組頂 2 張進怒氣），抽取 2 張卡。',
  ),

  // 事件
  event(
    'rg_tizuiliang',
    '替罪羊',
    3,
    3,
    [
      { type: 'mill', n: 2 },
      { type: 'immuneTrickSecret' },
    ],
    '自傷 2 點。對手下回合中我方不受特技、密技的傷害與效果影響。',
  ),
  event(
    'rg_shenshenxian',
    '腎上腺素',
    2,
    1,
    [
      { type: 'extraGuard', n: 1, expiry: { at: 'thisTurnEnd' } },
      { type: 'modify', target: 'damageReduction', amount: 2, expiry: { at: 'thisTurnEnd' } },
    ],
    '本回合戰鬥時防禦判定額外翻開 1 張防禦卡，且受到的戰鬥傷害減免 2 點。',
  ),

  // 裝備
  equipment(
    'rg_eq_jufu',
    '破陣巨斧',
    'weapon',
    {
      level: 1,
      guard: 1,
      effects: [{ type: 'modify', target: 'techniqueDamage', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【武器・等級1】所有招式傷害 +1。',
  ),
  equipment(
    'rg_eq_shixue',
    '嗜血魔刃',
    'weapon',
    {
      level: 2,
      guard: 2,
      effects: [
        { type: 'modify', target: 'techniqueDamage', amount: 2, expiry: { at: 'permanent' } },
        { type: 'modify', target: 'hiddenDamage', amount: 2, expiry: { at: 'permanent' } },
      ],
    },
    '【武器・等級2】所有招式傷害 +2，密奧義傷害再 +2。',
  ),
  equipment(
    'rg_eq_mianju',
    '修羅戰盔',
    'helmet',
    {
      level: 1,
      guard: 2,
      effects: [{ type: 'extraGuard', n: 1, expiry: { at: 'permanent' } }],
    },
    '【頭盔・等級1】防禦判定時額外翻開 1 張防禦卡。',
  ),
  equipment(
    'rg_eq_kuanggu',
    '狂骨之握',
    'glove',
    {
      level: 1,
      guard: 1,
      effects: [{ type: 'modify', target: 'techniqueDamage', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【手套・等級1】所有招式傷害 +1。',
  ),
  equipment(
    'rg_eq_xuebu',
    '血步重靴',
    'boots',
    {
      level: 1,
      guard: 1,
      effects: [{ type: 'modify', target: 'drawCount', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【鞋子・等級1】抽牌階段多抽 1 張卡。',
  ),
  equipment(
    'rg_eq_xuejie',
    '復仇血戒',
    'accessory',
    {
      level: 1,
      guard: 0,
      effects: [{ type: 'modify', target: 'recoverAmount', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【飾品・等級1】所有「回復N」的 N +1。',
  ),

  // 招式
  technique('rg_tech_nuce', '怒影爪', 'trick', { damage: 1, guard: 1 }, '狂怒特技起手。'),
  technique(
    'rg_tech_bengxue',
    '崩血拳',
    'trick',
    { damage: 2, guard: 1, angerCost: 1 },
    '【額外費用：捨棄怒氣 1 張】造成 2 點傷害。',
  ),
  technique(
    'rg_tech_kuangni',
    '狂逆衝',
    'secret',
    { damage: 3, guard: 2, comboBonus: { sequence: ['trick', 'secret'], damage: 2 } },
    '【連招：特技→密技】此擊傷害 +2。',
  ),
  technique(
    'rg_tech_liepo',
    '裂魄掌',
    'secret',
    { damage: 4, guard: 1, angerCost: 2 },
    '【額外費用：捨棄怒氣 2 張】造成 4 點傷害。',
  ),
  technique(
    'rg_tech_nubaofa',
    '怒氣爆發',
    'ultimate',
    { damage: 6, guard: 1, angerCost: 3 },
    '【額外費用：捨棄怒氣 3 張】造成 6 點傷害。',
  ),
  technique(
    'rg_tech_xiumie',
    '修羅滅脈',
    'ultimate',
    { damage: 5, guard: 2, cost: 1, effects: [{ type: 'mill', n: 2 }] },
    '造成 5 點傷害，對自己造成 2 點自傷。',
  ),
  technique(
    'rg_tech_bajuan',
    '修羅滅世拳',
    'hidden',
    {
      damage: 7,
      guard: 3,
      cost: 1,
      liberation: { type: 'angerAtLeast', n: 4 },
    },
    '【密奧義・解放條件：怒氣區 4 張以上】造成 7 點強大傷害。',
  ),
  technique(
    'rg_tech_nuhai',
    '無盡怒海',
    'hidden',
    {
      damage: 8,
      guard: 4,
      cost: 1,
      angerCost: 2,
      liberation: { type: 'usedTierThisTurn', tier: 'ultimate' },
    },
    '【密奧義・解放條件：本回合已打出過奧義】【額外費用：捨棄怒氣 2 張】造成 8 點毀滅傷害。',
  ),
];

// ─────────────────────────────────────────────
// 【秘法】專屬卡牌（Mage）
// ─────────────────────────────────────────────

const MAGE_CARDS: CardDef[] = [
  // 行動
  action(
    'mg_juling',
    '聚靈術',
    1,
    1,
    [
      { type: 'draw', n: 2 },
      { type: 'modify', target: 'techniqueDamage', amount: 1, expiry: { at: 'thisTurnEnd' } },
    ],
    '抽取 2 張卡，本回合所有招式傷害 +1。',
  ),
  action(
    'mg_tanxun',
    '魔脈探尋',
    0,
    1,
    [{ type: 'search', look: 4, pick: 1, filter: { kind: 'technique' } }],
    '檢索：檢視牌組頂 4 張卡，挑選 1 張招式卡加入手牌，其餘送入棄牌區。',
  ),
  action(
    'mg_guozai',
    '魔力過載',
    0,
    1,
    [
      { type: 'mill', n: 1 },
      { type: 'modify', target: 'techniqueDamage', amount: 2, expiry: { at: 'thisTurnEnd' } },
      { type: 'modify', target: 'chantDamage', amount: 2, expiry: { at: 'thisTurnEnd' } },
    ],
    '自傷 1 點（牌組頂 1 張進怒氣），本回合所有招式與詠唱傷害 +2。',
  ),
  action(
    'mg_huanxing',
    '元素喚醒',
    1,
    1,
    [{ type: 'salvage', n: 1, filter: { kind: 'technique' } }],
    '從棄牌區取回 1 張招式卡加入手牌。',
  ),
  action(
    'mg_huiyong',
    '法力回湧',
    2,
    2,
    [{ type: 'recover', n: 3 }],
    '回復 3 張怒氣卡至牌組頂。',
  ),

  // 事件
  event(
    'mg_hudun',
    '法力護盾',
    3,
    2,
    [{ type: 'modify', target: 'damageReduction', amount: 3, expiry: { at: 'thisTurnEnd' } }],
    '本回合受到的戰鬥傷害減免 3 點。',
  ),
  event(
    'mg_gongming',
    '元素共鳴',
    2,
    1,
    [
      {
        type: 'conditional',
        when: { type: 'hasChantedThisTurn' },
        effect: { type: 'draw', n: 2 },
      },
    ],
    '若本回合已打出過詠唱招式，立即抽取 2 張卡。',
  ),

  // 裝備
  equipment(
    'mg_eq_fazhang',
    '引靈法杖',
    'weapon',
    {
      level: 1,
      guard: 1,
      effects: [
        { type: 'modify', target: 'techniqueDamage', amount: 1, expiry: { at: 'permanent' } },
        { type: 'modify', target: 'chantDamage', amount: 1, expiry: { at: 'permanent' } },
      ],
    },
    '【武器・等級1】所有招式與詠唱傷害 +1。',
  ),
  equipment(
    'mg_eq_miezhang',
    '滅法魔杖',
    'weapon',
    {
      level: 2,
      guard: 2,
      effects: [
        { type: 'modify', target: 'techniqueDamage', amount: 2, expiry: { at: 'permanent' } },
        { type: 'modify', target: 'chantDamage', amount: 2, expiry: { at: 'permanent' } },
      ],
    },
    '【武器・等級2】所有招式與詠唱傷害 +2。',
  ),
  equipment(
    'mg_eq_fapao',
    '奧術法袍',
    'helmet',
    {
      level: 1,
      guard: 2,
      effects: [{ type: 'modify', target: 'guardValue', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【頭盔・等級1】防禦值 +1。',
  ),
  equipment(
    'mg_eq_baozhu',
    '元素寶珠',
    'accessory',
    {
      level: 1,
      guard: 0,
      effects: [{ type: 'modify', target: 'chantDamage', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【飾品・等級1】詠唱傷害 +1。',
  ),
  equipment(
    'mg_eq_faxue',
    '疾行法靴',
    'boots',
    {
      level: 1,
      guard: 1,
      effects: [{ type: 'modify', target: 'drawCount', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【鞋子・等級1】抽牌階段多抽 1 張卡。',
  ),
  equipment(
    'mg_eq_hufu',
    '護身符文',
    'accessory',
    {
      level: 2,
      guard: 2,
      effects: [{ type: 'extraGuard', n: 1, expiry: { at: 'permanent' } }],
    },
    '【飾品・等級2】防禦判定時額外翻開 1 張防禦卡。',
  ),

  // 招式（含詠唱）
  technique(
    'mg_tech_feidan',
    '奧術飛彈',
    'trick',
    {
      damage: 2,
      guard: 1,
      chant: { cost: 1, damage: 2, text: '詠唱(1)：戰鬥時額外造成 2 點法術打擊。' },
    },
    '【詠唱(1)】可在主要階段詠唱打出；戰鬥時額外造成 2 點打擊。',
  ),
  technique(
    'mg_tech_bingzhi',
    '寒冰指',
    'trick',
    {
      damage: 1,
      guard: 2,
      chant: { cost: 1, damage: 1, guardReduction: 1, text: '詠唱(1)：戰鬥時削弱對手 1 點防禦，追加 1 點傷害。' },
    },
    '【詠唱(1)】削弱對手 1 點防禦並追加 1 點傷害。',
  ),
  technique(
    'mg_tech_shandian',
    '連鎖閃電',
    'secret',
    {
      damage: 3,
      guard: 1,
      comboBonus: { sequence: ['trick', 'secret'], damage: 2 },
      chant: { cost: 1, damage: 3, text: '詠唱(1)：戰鬥時額外造成 3 點雷電打擊。' },
    },
    '【詠唱(1)】【連招：特技→密技】此擊傷害 +2。',
  ),
  technique(
    'mg_tech_huoqiu',
    '灼熱烈焰',
    'secret',
    {
      damage: 4,
      guard: 1,
      chant: { cost: 2, damage: 4, text: '詠唱(2)：戰鬥時額外造成 4 點火焰打擊。' },
    },
    '【詠唱(2)】造成 4 點高額傷害。',
  ),
  technique(
    'mg_tech_yunshi',
    '隕石天降',
    'ultimate',
    {
      damage: 5,
      guard: 2,
      cost: 1,
      chant: { cost: 2, damage: 5, text: '詠唱(2)：戰鬥時額外造成 5 點毀滅隕石。' },
    },
    '【奧義】【詠唱(2)】造成 5 點毀滅隕石打擊。',
  ),
  technique(
    'mg_tech_jiguang',
    '極光破滅',
    'ultimate',
    { damage: 6, guard: 1, cost: 1 },
    '【奧義】橫置 1 張生命卡，造成 6 點純粹奧術打擊。',
  ),
  technique(
    'mg_tech_xingyun',
    '終焉星殞',
    'hidden',
    {
      damage: 7,
      guard: 3,
      cost: 1,
      liberation: { type: 'hasChantedThisTurn' },
    },
    '【密奧義・解放條件：本回合已有詠唱過招式】造成 7 點星殞傷害。',
  ),
  technique(
    'mg_tech_yanmie',
    '萬象湮滅',
    'hidden',
    {
      damage: 8,
      guard: 4,
      cost: 1,
      liberation: { type: 'usedTierThisTurn', tier: 'ultimate' },
    },
    '【密奧義・解放條件：本回合已打出過奧義】造成 8 點毀天滅地的終極傷害。',
  ),
];

// ─────────────────────────────────────────────
// 【氣功】專屬卡牌（Qigong）
// ─────────────────────────────────────────────

const QIGONG_CARDS: CardDef[] = [
  // 行動
  action(
    'qg_tiaoxi',
    '運氣調息',
    2,
    1,
    [
      { type: 'draw', n: 1 },
      { type: 'recover', n: 1 },
    ],
    '【冷卻2】抽 1 張，回復 1 張。在冷卻區期間：所有「回復N」的 N +1。',
    {
      cooldown: 2,
      cooldownBuff: { target: 'recoverAmount', amount: 1, text: '調息：回復量 +1' },
    },
  ),
  action(
    'qg_jinzhong',
    '金鐘罩',
    3,
    2,
    [{ type: 'extraGuard', n: 1, expiry: { at: 'thisTurnEnd' } }],
    '【冷卻3】防禦判定時額外翻 1 張防禦卡。在冷卻區期間：受到的戰鬥傷害減免 1 點。',
    {
      cooldown: 3,
      cooldownBuff: { target: 'damageReduction', amount: 1, text: '金鐘：受傷 -1' },
    },
  ),
  action(
    'qg_changhong',
    '氣貫長虹',
    1,
    1,
    [
      { type: 'draw', n: 1 },
      { type: 'modify', target: 'techniqueDamage', amount: 1, expiry: { at: 'thisTurnEnd' } },
    ],
    '【冷卻2・儲存2】抽 1 張，本回合招式傷害 +1。在冷卻區期間：所有招式傷害 +1。',
    {
      cooldown: 2,
      storage: 2,
      cooldownBuff: { target: 'techniqueDamage', amount: 1, text: '長虹：招式傷害 +1' },
    },
  ),
  action(
    'qg_tongmai',
    '通脈訣',
    1,
    1,
    [
      { type: 'draw', n: 1 },
      { type: 'advanceCooldowns', n: 1 },
    ],
    '【冷卻1】抽 1 張卡，使冷卻區所有卡牌進度 +1。',
    { cooldown: 1 },
  ),
  action(
    'qg_huajin',
    '化勁歸元',
    2,
    1,
    [
      { type: 'finishCooldown' },
      { type: 'draw', n: 2 },
    ],
    '立即完成冷卻區 1 張卡並送入棄牌區，然後抽取 2 張卡。',
  ),

  // 事件
  event(
    'qg_taiji',
    '太極圓轉',
    3,
    2,
    [{ type: 'modify', target: 'damageReduction', amount: 2, expiry: { at: 'thisTurnEnd' } }],
    '【冷卻3】本回合受到的戰鬥傷害減免 2 點。在冷卻區期間：我方防禦值 +1。',
    {
      cooldown: 3,
      cooldownBuff: { target: 'guardValue', amount: 1, text: '太極：防禦值 +1' },
    },
  ),
  event(
    'qg_shouyi',
    '歸元守一',
    2,
    1,
    [
      { type: 'recover', n: 2 },
      { type: 'modify', target: 'guardValue', amount: 2, expiry: { at: 'thisTurnEnd' } },
    ],
    '回復 2 張怒氣卡至牌組頂，本回合防禦值 +2。',
  ),

  // 裝備
  equipment(
    'qg_eq_xuanpao',
    '八卦玄袍',
    'helmet',
    {
      level: 1,
      guard: 2,
      effects: [{ type: 'modify', target: 'guardValue', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【頭盔・等級1】防禦值 +1。',
  ),
  equipment(
    'qg_eq_lingpei',
    '聚氣靈佩',
    'accessory',
    {
      level: 1,
      guard: 1,
      effects: [{ type: 'modify', target: 'recoverAmount', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【飾品・等級1】所有「回復N」的 N +1。',
  ),
  equipment(
    'qg_eq_zhitao',
    '玄罡指套',
    'glove',
    {
      level: 1,
      guard: 1,
      effects: [{ type: 'modify', target: 'techniqueDamage', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【手套・等級1】所有招式傷害 +1。',
  ),
  equipment(
    'qg_eq_daolu',
    '行氣道履',
    'boots',
    {
      level: 1,
      guard: 1,
      effects: [{ type: 'modify', target: 'drawCount', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【鞋子・等級1】抽牌階段多抽 1 張卡。',
  ),
  equipment(
    'qg_eq_yinyang',
    '太極陰陽鏡',
    'accessory',
    {
      level: 2,
      guard: 2,
      effects: [{ type: 'extraGuard', n: 1, expiry: { at: 'permanent' } }],
    },
    '【飾品・等級2】防禦判定時額外翻開 1 張防禦卡。',
  ),
  equipment(
    'qg_eq_fuchen',
    '乾坤拂塵',
    'weapon',
    {
      level: 1,
      guard: 1,
      effects: [{ type: 'modify', target: 'techniqueDamage', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【武器・等級1】所有招式傷害 +1。',
  ),

  // 招式
  technique(
    'qg_tech_tuishou',
    '推手',
    'trick',
    { damage: 2, guard: 2, cooldown: 2, storage: 2 },
    '【冷卻2・儲存2】以柔克剛的氣勁推手。',
  ),
  technique('qg_tech_chuanyun', '穿雲掌', 'trick', { damage: 1, guard: 3 }, '兼具高防禦的氣功起手。'),
  technique(
    'qg_tech_bengshan',
    '崩山氣勁',
    'secret',
    {
      damage: 3,
      guard: 2,
      comboBonus: { sequence: ['trick', 'secret'], damage: 2 },
      cooldown: 2,
      cooldownBuff: { target: 'guardValue', amount: 1, text: '氣勁：防禦 +1' },
    },
    '【冷卻2】【連招：特技→密技】此擊傷害 +2。冷卻期間：防禦值 +1。',
  ),
  technique(
    'qg_tech_qixuan',
    '氣旋破',
    'secret',
    { damage: 3, guard: 3, cooldown: 2, storage: 2 },
    '【冷卻2・儲存2】造成 3 點傷害，防禦值 3。',
  ),
  technique(
    'qg_tech_hunyuan',
    '混元一氣',
    'ultimate',
    {
      damage: 5,
      guard: 3,
      cost: 1,
      cooldown: 3,
      cooldownBuff: { target: 'techniqueDamage', amount: 1, text: '混元：招式傷害 +1' },
    },
    '【奧義】【冷卻3】造成 5 點傷害。在冷卻區期間：所有招式傷害 +1。',
  ),
  technique(
    'qg_tech_zhentian',
    '震天撼海',
    'ultimate',
    { damage: 6, guard: 2, cost: 1 },
    '【奧義】凝聚渾身氣勁，造成 6 點沉重打擊。',
  ),
  technique(
    'qg_tech_jiuxiao',
    '九霄天脈引',
    'hidden',
    {
      damage: 7,
      guard: 4,
      cost: 1,
      liberation: { type: 'cooldownCountAtLeast', n: 2 },
    },
    '【密奧義・解放條件：冷卻區卡牌達到 2 張以上】引爆九霄脈氣，造成 7 點傷害。',
  ),
  technique(
    'qg_tech_jingang',
    '無相金剛身',
    'hidden',
    {
      damage: 6,
      guard: 5,
      cost: 1,
      cooldown: 4,
      liberation: { type: 'cooldownCountAtLeast', n: 3 },
      cooldownBuff: { target: 'damageReduction', amount: 2, text: '金剛：受傷 -2' },
    },
    '【密奧義・解放條件：冷卻區卡牌達到 3 張以上】【冷卻4】造成 6 點傷害。冷卻期間：受到的傷害減免 2 點。',
  ),
];

// ─────────────────────────────────────────────
// 【共通】任務牌組（共 5 張，不可同名，雙面條件）
// ─────────────────────────────────────────────

const QUEST_CARDS: CardDef[] = [
  quest(
    'qst_first',
    '初試身手',
    true,
    { type: 'playKindInTurn', kind: 'action', n: 1 },
    '一個回合內使用 1 張行動卡',
    { type: 'takeDamageInTurn', n: 5 },
    '一個回合內受到 5 點以上傷害',
    '雙方初探虛實的開局任務。完成可提升 1 等級。',
  ),
  quest(
    'qst_combo',
    '連擊之證',
    false,
    { type: 'comboInTurn', sequence: ['trick', 'secret'] },
    '一個回合內成立「特技→密技」連招',
    { type: 'takeDamageInTurn', n: 6 },
    '一個回合內受到 6 點以上傷害',
    '證明出招熟稔度。完成可提升 1 等級。',
  ),
  quest(
    'qst_ready',
    '蓄勢待發',
    false,
    { type: 'handAtLeast', n: 7 },
    '手牌達到 7 張以上',
    { type: 'takeDamageInTurn', n: 6 },
    '一個回合內受到 6 點以上傷害',
    '蓄積底蘊以謀後著。完成可提升 1 等級。',
  ),
  quest(
    'qst_surge',
    '怒氣奔流',
    false,
    { type: 'recoverInTurn', n: 2 },
    '一個回合內累積回復 2 張以上',
    { type: 'takeDamageInTurn', n: 7 },
    '一個回合內受到 7 點以上傷害',
    '以氣脈調和轉化生機。完成可提升 1 等級。',
  ),
  quest(
    'qst_master',
    '大地之境',
    false,
    { type: 'dealDamageInTurn', n: 5 },
    '一個回合內造成 5 點以上傷害',
    { type: 'takeDamageInTurn', n: 6 },
    '一個回合內受到 6 點以上傷害',
    '厚德載物，以雄渾氣勁破敵致勝。完成可提升 1 等級。',
  ),
];

// ─────────────────────────────────────────────
// 卡表字典
// ─────────────────────────────────────────────

export const CARD_DEFS: readonly CardDef[] = [
  ...RAGE_CARDS,
  ...MAGE_CARDS,
  ...QIGONG_CARDS,
  ...QUEST_CARDS,
];

const DEF_MAP = new Map<string, CardDef>(CARD_DEFS.map((d) => [d.id, d]));

/** 依 id 取得卡牌定義；找不到時拋錯（在編譯期應捕捉所有無效 id） */
export function card(id: string): CardDef {
  const def = DEF_MAP.get(id);
  if (!def) throw new Error(`未知的卡牌 ID: ${id}`);
  return def;
}

export function tryCard(id: string): CardDef | undefined {
  return DEF_MAP.get(id);
}

// ─────────────────────────────────────────────
// 角色預設主牌組（各剛好 50 張）
// ─────────────────────────────────────────────

export const RAGE_MAIN_DECK: Readonly<Record<string, number>> = {
  // 行動 (14)
  rg_xiefen: 3,
  rg_renqi: 2,
  rg_tiaoxin: 3,
  rg_weidai: 2,
  rg_paohua: 2,
  rg_xueqi: 2,
  // 事件 (4)
  rg_tizuiliang: 2,
  rg_shenshenxian: 2,
  // 裝備 (8)
  rg_eq_jufu: 2,
  rg_eq_shixue: 1,
  rg_eq_mianju: 1,
  rg_eq_kuanggu: 1,
  rg_eq_xuebu: 2,
  rg_eq_xuejie: 1,
  // 招式 (24)
  rg_tech_nuce: 4,
  rg_tech_bengxue: 3,
  rg_tech_kuangni: 4,
  rg_tech_liepo: 3,
  rg_tech_nubaofa: 3,
  rg_tech_xiumie: 3,
  rg_tech_bajuan: 2,
  rg_tech_nuhai: 2,
};

export const MAGE_MAIN_DECK: Readonly<Record<string, number>> = {
  // 行動 (13)
  mg_juling: 3,
  mg_tanxun: 3,
  mg_guozai: 3,
  mg_huanxing: 2,
  mg_huiyong: 2,
  // 事件 (5)
  mg_hudun: 3,
  mg_gongming: 2,
  // 裝備 (8)
  mg_eq_fazhang: 2,
  mg_eq_miezhang: 1,
  mg_eq_fapao: 1,
  mg_eq_baozhu: 2,
  mg_eq_faxue: 1,
  mg_eq_hufu: 1,
  // 招式 (24)
  mg_tech_feidan: 4,
  mg_tech_bingzhi: 3,
  mg_tech_shandian: 4,
  mg_tech_huoqiu: 3,
  mg_tech_yunshi: 3,
  mg_tech_jiguang: 3,
  mg_tech_xingyun: 2,
  mg_tech_yanmie: 2,
};

export const QIGONG_MAIN_DECK: Readonly<Record<string, number>> = {
  // 行動 (14)
  qg_tiaoxi: 3,
  qg_jinzhong: 3,
  qg_changhong: 3,
  qg_tongmai: 3,
  qg_huajin: 2,
  // 事件 (4)
  qg_taiji: 2,
  qg_shouyi: 2,
  // 裝備 (8)
  qg_eq_xuanpao: 1,
  qg_eq_lingpei: 2,
  qg_eq_zhitao: 1,
  qg_eq_daolu: 2,
  qg_eq_yinyang: 1,
  qg_eq_fuchen: 1,
  // 招式 (24)
  qg_tech_tuishou: 4,
  qg_tech_chuanyun: 3,
  qg_tech_bengshan: 4,
  qg_tech_qixuan: 3,
  qg_tech_hunyuan: 3,
  qg_tech_zhentian: 3,
  qg_tech_jiuxiao: 2,
  qg_tech_jingang: 2,
};

export const CHARACTER_MAIN_DECKS: Record<CharacterId, Readonly<Record<string, number>>> = {
  rage: RAGE_MAIN_DECK,
  mage: MAGE_MAIN_DECK,
  qigong: QIGONG_MAIN_DECK,
};

/** 共通任務牌組（固定 5 張） */
export const COMMON_QUEST_DECK: readonly string[] = [
  'qst_first',
  'qst_combo',
  'qst_ready',
  'qst_surge',
  'qst_master',
];

// 舊常數相容
export const STARTER_MAIN_DECK = RAGE_MAIN_DECK;
export const STARTER_QUEST_DECK = COMMON_QUEST_DECK;

// ─────────────────────────────────────────────
// 牌組展開與構築驗證
// ─────────────────────────────────────────────

/** 把 `{ cardId: count }` 展開成一維陣列 */
export function expandDeck(counts: Readonly<Record<string, number>>): string[] {
  const list: string[] = [];
  for (const [id, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) list.push(id);
  }
  return list;
}

export interface DeckValidation {
  ok: boolean;
  errors: string[];
}

export function validateMainDeck(counts: Readonly<Record<string, number>>): DeckValidation {
  const errors: string[] = [];
  let total = 0;
  let hiddenCount = 0;

  for (const [id, n] of Object.entries(counts)) {
    if (n <= 0) continue;
    total += n;

    const def = tryCard(id);
    if (!def) {
      errors.push(`未知的卡牌：${id}`);
      continue;
    }
    if (def.kind === 'quest') {
      errors.push(`任務卡「${def.name}」不可放入主牌組`);
    }
    if (n > RULES.maxCopiesPerName) {
      errors.push(`「${def.name}」超出同名上限（目前 ${n} 張，最多 ${RULES.maxCopiesPerName} 張）`);
    }
    if (def.tier === 'hidden') {
      hiddenCount += n;
    }
  }

  if (total !== RULES.mainDeckSize) {
    errors.push(`主牌組必須剛好 ${RULES.mainDeckSize} 張（目前 ${total} 張）`);
  }
  if (hiddenCount > RULES.maxHiddenTechniques) {
    errors.push(`密奧義合計超出上限（目前 ${hiddenCount} 張，最多 ${RULES.maxHiddenTechniques} 張）`);
  }

  return { ok: errors.length === 0, errors };
}

export function validateQuestDeck(ids: readonly string[]): DeckValidation {
  const errors: string[] = [];

  if (ids.length !== RULES.questDeckSize) {
    errors.push(`任務牌組必須剛好 ${RULES.questDeckSize} 張（目前 ${ids.length} 張）`);
  }

  const seen = new Set<string>();
  let hasStarter = false;

  for (const id of ids) {
    const def = tryCard(id);
    if (!def) {
      errors.push(`未知的卡牌：${id}`);
      continue;
    }
    if (def.kind !== 'quest') {
      errors.push(`「${def.name}」不是任務卡，不可放入任務牌組`);
    }
    if (seen.has(id)) {
      errors.push(`任務卡不可重複放入（${def.name} 重複了）`);
    }
    seen.add(id);
    if (def.quest?.starter) hasStarter = true;
  }

  if (!hasStarter) {
    errors.push('任務牌組必須至少包含 1 張帶有「起始任務」特徵的任務卡');
  }

  return { ok: errors.length === 0, errors };
}
