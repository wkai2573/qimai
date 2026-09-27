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
  /** 發動能力、觸發能力等其餘欄位 */
  extra?: Partial<CardDef>;
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
    ...opts.extra,
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
  /** 持續時間(X)；不設定 = 直到被其他事件取代 */
  duration?: number;
  /** 打出條件、持續效果、離場效果等其餘欄位 */
  extra?: Partial<CardDef>;
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
    duration: opts.duration,
    ...opts.extra,
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
    '【持續時間4】自傷 2 點。對手回合中我方不受特技、密技的傷害與效果影響。',
    { duration: 4 },
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
    '【持續時間2】本回合戰鬥時防禦判定額外翻開 1 張防禦卡，且受到的戰鬥傷害減免 2 點。',
    { duration: 2 },
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
  // ── 狂怒修羅擴充（CSV 新卡）──

  // 行動
  action(
    'rg_xiyan',
    '吸菸',
    0,
    1,
    [
      { type: 'discardToAnger', n: 6 },
      { type: 'recover', n: 3 },
    ],
    '自己棄牌區 6 張卡放到怒氣區，將怒氣區洗牌，之後回復 3。',
  ),
  action(
    'rg_hejiu',
    '喝酒',
    2,
    1,
    [
      { type: 'discardToAnger', n: 4 },
      { type: 'draw', n: 2 },
    ],
    '自己棄牌區 4 張卡放到怒氣區，將怒氣區洗牌，之後抽 2 張。',
  ),

  // 事件
  event(
    'rg_nuqichang',
    '憤怒氣場',
    3,
    0,
    [{ type: 'draw', n: 1 }],
    '【持續時間1】怒氣區必須有 8 張以上才能打出此卡。抽 1 張。',
    { duration: 1, extra: { playCondition: { type: 'angerAtLeast', n: 8 } } },
  ),
  event(
    'rg_yingyuan',
    '應援團',
    3,
    3,
    [{ type: 'discardAnger', n: 'all' }],
    '【持續時間4】裝備「金項鍊」時此卡費用 -1。捨棄我方怒氣區全部卡片。在事件區期間：我方招式不需要費用（包括額外費用），回復效果 +1。',
    {
      duration: 4,
      extra: {
        costReduction: { when: { type: 'equippedCard', defId: 'rg_eq_jinxianglian' }, amount: 1 },
        aura: [
          { target: 'freeTechnique', amount: 1 },
          { target: 'recoverAmount', amount: 1 },
        ],
      },
    },
  ),

  // 裝備
  equipment(
    'rg_eq_gunbang',
    '+9棍棒',
    'weapon',
    {
      level: 0,
      guard: 1,
      effects: [{ type: 'modify', target: 'cost', amount: -1, expiry: { at: 'permanent' }, filter: { id: 'rg_yingyuan' } }],
    },
    '【武器・等級0】「應援團」費用 -1。',
  ),
  equipment(
    'rg_eq_gunbang89',
    '8+9棍棒',
    'weapon',
    {
      level: 2,
      guard: 2,
      effects: [{ type: 'modify', target: 'cost', amount: -2, expiry: { at: 'permanent' }, filter: { id: 'rg_yingyuan' } }],
    },
    '【武器・等級2】「應援團」費用 -2。',
  ),
  equipment(
    'rg_eq_xiaodao',
    '小刀',
    'weapon',
    {
      level: 1,
      guard: 0,
      effects: [
        {
          type: 'modify',
          target: 'techniqueDamage',
          amount: 1,
          expiry: { at: 'permanent' },
          condition: { type: 'ownEventInZone' },
        },
        {
          type: 'modify',
          target: 'hiddenDamage',
          amount: 2,
          expiry: { at: 'permanent' },
          condition: { type: 'ownEventInZone' },
        },
      ],
    },
    '【武器・等級1】事件區有我方的事件時：我方全部招式傷害 +1，密奧義再 +2。',
  ),
  equipment(
    'rg_eq_diaoga',
    '打老婆吊嘎',
    'armor',
    { level: 3, guard: 0, extra: { opponentEventTax: { type: 'ownEventInZone' } } },
    '【衣服・等級3】事件區有我方的事件時：對手打出事件需額外選擇自己 1 張手牌放到怒氣區底。',
  ),
  equipment(
    'rg_eq_pifeng',
    '披風',
    'armor',
    {
      level: 2,
      guard: 2,
      extra: {
        activate: {
          effects: [
            { type: 'mill', n: 2 },
            {
              type: 'modify',
              target: 'cost',
              amount: -1,
              expiry: { at: 'thisTurnEnd' },
              filter: { tiers: ['ultimate', 'hidden'] },
              once: true,
            },
          ],
        },
      },
    },
    '【衣服・等級2】主要階段：橫置此卡，對自己造成 2 點傷害，本回合你的下一張奧義或密奧義費用 -1。',
  ),
  equipment(
    'rg_eq_guaeryan',
    '掛耳菸',
    'helmet',
    {
      level: 2,
      guard: 0,
      extra: {
        activate: {
          effects: [
            { type: 'discardToAnger', n: 5 },
            { type: 'recover', n: 1 },
          ],
        },
      },
    },
    '【頭盔・等級2】主要階段：橫置此卡，自己棄牌區 5 張卡放到怒氣區並洗牌，之後回復 1。',
  ),
  equipment(
    'rg_eq_toujin',
    '頭巾',
    'helmet',
    { level: 0, guard: 0, extra: { activate: { effects: [{ type: 'discardToAnger', n: 2 }] } } },
    '【頭盔・等級0】主要階段：橫置此卡，自己棄牌區 2 張卡放到怒氣區並洗牌。',
  ),
  equipment(
    'rg_eq_pijiu',
    '罐裝啤酒',
    'glove',
    {
      level: 2,
      guard: 0,
      extra: {
        activate: {
          effects: [
            { type: 'discardToAnger', n: 3 },
            { type: 'draw', n: 1 },
          ],
        },
      },
    },
    '【手套・等級2】主要階段：橫置此卡，自己棄牌區 3 張卡放到怒氣區並洗牌，之後抽 1 張。',
  ),
  equipment(
    'rg_eq_fanghua',
    '防滑手套',
    'glove',
    { level: 3, guard: 1, extra: { guardBreakByLastTechnique: { type: 'ownEventInZone' } } },
    '【手套・等級3】事件區有我方的事件時：對手的防禦判定 −X（X = 我方最後一張招式卡的防禦值）。',
  ),
  equipment(
    'rg_eq_jiaotuo',
    '夾腳拖鞋',
    'boots',
    { level: 2, guard: 0, extra: { onEquipmentTap: [{ type: 'recover', n: 1 }] } },
    '【鞋子・等級2】每當你的裝備橫置時，回復 1。',
  ),
  equipment(
    'rg_eq_muji',
    '木屐',
    'boots',
    {
      level: 2,
      guard: 2,
      extra: {
        activate: {
          effects: [
            { type: 'mill', n: 2 },
            {
              type: 'modify',
              target: 'cost',
              amount: -1,
              expiry: { at: 'thisTurnEnd' },
              filter: { kind: 'action' },
              once: true,
            },
          ],
        },
      },
    },
    '【鞋子・等級2】主要階段：橫置此卡，對自己造成 2 點傷害，本回合你的下一張行動卡費用 -1。',
  ),
  equipment(
    'rg_eq_yaogao',
    '藥膏貼布',
    'accessory',
    {
      level: 1,
      guard: 0,
      effects: [{ type: 'modify', target: 'recoverAmount', amount: 1, expiry: { at: 'permanent' } }],
      extra: { leavesAtOpponentTurnEnd: true },
    },
    '【飾品・等級1】回復效果 +1。對手回合結束時，此卡放到怒氣區底。',
  ),
  equipment(
    'rg_eq_jinxianglian',
    '金項鍊',
    'accessory',
    {
      level: 3,
      guard: 2,
      cost: 2,
      extra: {
        activate: { lifeCost: 1, effects: [] },
        onSelfTap: [{ type: 'recover', n: 1 }],
        untapOnOwnEvent: true,
      },
    },
    '【飾品・等級3】主要階段：你可以支付 1 費橫置此卡。此卡橫置時，回復 1。你打出事件時，此卡重置。',
  ),
  equipment(
    'rg_eq_bengdai',
    '繃帶',
    'accessory',
    { level: 3, guard: 1, extra: { beforeRebuildDiscardAnger: 10 } },
    '【飾品・等級3】你的牌組為 0、要重構前：此卡放到怒氣區底，並捨棄怒氣區 10 張卡。',
  ),

  // 招式（CSV 未提供卡名，名稱依效果暫定）
  technique(
    'rg_tech_jiaoxiao',
    '群起叫囂',
    'trick',
    {
      damage: 1,
      guard: 1,
      effects: [
        {
          type: 'conditional',
          when: { type: 'ownEventInZone', defId: 'rg_nuqichang' },
          effect: { type: 'allDrawThenAngerBottom', draw: 1 },
        },
      ],
    },
    '事件區有我方的「憤怒氣場」時：雙方各抽 1 張，然後各自選擇 1 張手牌放到怒氣區底。',
  ),
  technique(
    'rg_tech_boming',
    '搏命拳',
    'trick',
    {
      damage: 1,
      guard: 1,
      effects: [
        { type: 'mill', n: 2 },
        { type: 'tapEquipment', n: 1 },
      ],
    },
    '對自己造成 2 點傷害，橫置 1 張裝備卡。',
  ),
  technique(
    'rg_tech_xienu',
    '洩怒掌',
    'trick',
    { damage: 2, guard: 2, effects: [{ type: 'discardAnger', n: 2 }] },
    '捨棄我方怒氣區 2 張卡。',
  ),
  technique(
    'rg_tech_nizhuan',
    '逆怒轉勁',
    'secret',
    {
      damage: 2,
      guard: 1,
      effects: [
        {
          type: 'conditional',
          when: { type: 'ownEventInZone', defId: 'rg_nuqichang' },
          effect: { type: 'angerToHandThenDiscard', n: 2 },
          otherwise: {
            type: 'conditional',
            when: { type: 'ownEventInZone' },
            effect: { type: 'angerToHandThenDiscard', n: 1 },
          },
        },
      ],
    },
    '事件區有我方的事件時：從怒氣區取 X 張卡加入手牌，然後捨棄 X 張手牌。該事件為「憤怒氣場」時 X = 2，否則 X = 1。',
  ),
  technique(
    'rg_tech_huyou',
    '呼朋引伴',
    'secret',
    {
      damage: 2,
      guard: 1,
      effects: [
        {
          type: 'conditional',
          when: { type: 'ownEventInZone', defId: 'rg_yingyuan' },
          effect: { type: 'freeEquip' },
        },
      ],
    },
    '事件區有我方的「應援團」時：可以不支付費用打出 1 張裝備（須符合需求）。',
  ),
  technique(
    'rg_tech_nuyan',
    '怒焰斬',
    'secret',
    { damage: 3, guard: 2, effects: [{ type: 'discardAnger', n: 3 }] },
    '捨棄我方怒氣區 3 張卡。',
  ),
  technique(
    'rg_tech_yanmian',
    '怒氣延綿',
    'ultimate',
    {
      damage: 3,
      guard: 2,
      cost: 1,
      effects: [
        { type: 'removeOwnEventCounters', n: 2 },
        {
          type: 'conditional',
          when: { type: 'ownEventInZone', defId: 'rg_nuqichang' },
          effect: { type: 'untapLife', n: 1 },
        },
      ],
    },
    '事件區有我方的事件時：移除該事件上 2 個持續時間指示物。該事件為「憤怒氣場」時，重置我方 1 張生命卡。',
  ),
  technique(
    'rg_tech_sheshen',
    '修羅捨身',
    'ultimate',
    {
      damage: 3,
      guard: 2,
      cost: 1,
      effects: [
        { type: 'mill', n: 4 },
        { type: 'tapEquipment', n: 2 },
      ],
    },
    '對自己造成 4 點傷害，橫置 2 張裝備卡。',
  ),
  technique(
    'rg_tech_bengtian',
    '狂怒崩天',
    'ultimate',
    { damage: 5, guard: 3, cost: 1, effects: [{ type: 'discardAnger', n: 5 }] },
    '捨棄我方怒氣區 5 張卡。',
  ),
  technique(
    'rg_tech_baibing',
    '修羅百兵',
    'hidden',
    {
      damage: 5,
      guard: 4,
      cost: 1,
      liberation: { type: 'equipmentAtLeast', n: 2 },
      effects: [{ type: 'boostSelfPerTappedEquipment' }],
    },
    '【密奧義・解放條件：持有 2 張以上裝備】此卡傷害 +X（X = 橫置狀態的裝備張數）。',
  ),
  technique(
    'rg_tech_diyu',
    '修羅地獄',
    'hidden',
    {
      damage: 4,
      guard: 4,
      cost: 1,
      liberation: {
        type: 'allOf',
        conditions: [{ type: 'ownEventInZone' }, { type: 'usedTierThisTurn', tier: 'ultimate' }],
      },
      effects: [
        {
          type: 'conditional',
          when: { type: 'ownEventInZone', defId: 'rg_nuqichang' },
          effect: { type: 'opponentDrawToThenAngerBottom', handSize: 10, n: 7 },
          otherwise: { type: 'opponentDrawToThenAngerBottom', handSize: 10, n: 5 },
        },
      ],
    },
    '【密奧義・解放條件：事件區有我方的事件，且本回合已打出過奧義】對手抽牌直到手牌 10 張，然後對手選擇自己 X 張手牌放到怒氣區底。事件為「憤怒氣場」時 X = 7，否則 X = 5。',
  ),
  technique(
    'rg_tech_kuangtao',
    '怒海狂濤',
    'hidden',
    {
      damage: 7,
      guard: 5,
      cost: 1,
      liberation: { type: 'angerAtLeast', n: 4 },
      effects: [{ type: 'opponentDiscardToAngerBottom', n: 2 }],
    },
    '【密奧義・解放條件：怒氣區 4 張以上】選擇對手棄牌區 2 張卡放到對手的怒氣區底。',
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
    '【持續時間1】本回合受到的戰鬥傷害減免 3 點。',
    { duration: 1 },
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
    '【持續時間1】若本回合已打出過詠唱招式，立即抽取 2 張卡。',
    { duration: 1 },
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
  // ── 祕法星詠擴充（CSV 新卡）──

  // 行動
  action(
    'mg_gaosu',
    '高速詠唱',
    1,
    0,
    [{ type: 'modify', target: 'chantCostFixed', amount: 1, expiry: { at: 'thisTurnEnd' } }],
    '本回合你全部卡片的詠唱費用改為 1。',
  ),
  action(
    'mg_kuaisu',
    '快速冷卻',
    2,
    1,
    [{ type: 'chantFromDiscard' }],
    '選擇棄牌區 1 張卡作為詠唱打出（需支付詠唱費用，佔用本回合詠唱次數）。',
  ),
  action(
    'mg_jiasu',
    '祕法加速',
    2,
    1,
    [{ type: 'addEventCounters', n: 3 }],
    '在事件區的事件卡上放置 3 個持續時間指示物。',
  ),
  action(
    'mg_bingfeng',
    '冰封',
    2,
    1,
    [{ type: 'reshuffleDiscard', filter: { kind: 'technique', nameAny: ['冰'] }, then: 'recoverX' }],
    '棄牌區名稱包含「冰」的招式卡全部放回牌組洗牌，之後回復 X（X = 放回牌組的張數）。',
  ),
  action(
    'mg_dianshan',
    '電閃',
    2,
    1,
    [{ type: 'drawPerDiscard', filter: { kind: 'technique', nameAny: ['電'] }, max: 5 }],
    '抽 X 張（X = 棄牌區名稱包含「電」的招式卡張數，最多 5）。',
  ),
  action(
    'mg_huoguang',
    '火光',
    2,
    1,
    [{ type: 'discardAngerPerDiscard', filter: { kind: 'technique', nameAny: ['火'] } }],
    '捨棄怒氣區 X 張卡（X = 棄牌區名稱包含「火」的招式卡張數）。',
  ),

  // 事件
  event(
    'mg_lichang',
    '秘法力場',
    3,
    1,
    [],
    '【持續時間10】你每次詠唱時，在此卡上放置被詠唱卡防禦值數量的持續時間指示物。你防禦時，防禦值 + 此卡上的指示物數。',
    { duration: 10, extra: { countersOnChant: true, guardFromCounters: true } },
  ),
  event(
    'mg_modao',
    '整理魔導書',
    1,
    1,
    [],
    '【持續時間3】此卡離開事件區時，從棄牌區選擇 X 張招式卡加入手牌（X = 此卡上的持續時間指示物）。',
    { duration: 3, extra: { onLeave: [{ type: 'salvageByCounters', filter: { kind: 'technique' } }] } },
  ),

  // 裝備
  equipment(
    'mg_eq_xianzhang',
    '賢者法杖',
    'weapon',
    {
      level: 3,
      guard: 2,
      extra: {
        activate: {
          lifeCost: 1,
          effects: [{ type: 'modify', target: 'extraChant', amount: 1, expiry: { at: 'thisTurnEnd' } }],
        },
      },
    },
    '【武器・等級3】主要階段：支付 1 費橫置此卡，本回合你可以額外詠唱 1 次。',
  ),
  equipment(
    'mg_eq_xianpao',
    '賢者法袍',
    'armor',
    { level: 3, guard: 2, extra: { chantPayWithEquipment: true } },
    '【衣服・等級3】你的全部裝備可以橫置來支付詠唱費用。',
  ),
  equipment(
    'mg_eq_mipao',
    '秘法法袍',
    'armor',
    { level: 3, guard: 2, extra: { counterShield: { ratio: 1, redirectFromEvent: 'mg_lichang' } } },
    '【衣服・等級3】我方「秘法力場」要放置指示物時，改為放在此卡上。我方要受到傷害時，改為移除此卡上的指示物代替（每 1 個指示物代替 1 點傷害）。',
  ),
  equipment(
    'mg_eq_mimao',
    '秘法帽',
    'helmet',
    { level: 1, guard: 2, extra: { counterShield: { ratio: 2, mirrorOwnEvent: true } } },
    '【頭盔・等級1】你的事件要放置指示物時，此卡也放置相同數量的指示物。我方要受到傷害時，改為移除此卡上的指示物代替（每 2 個指示物代替 1 點傷害）。',
  ),
  equipment(
    'mg_eq_yuansu',
    '元素之章',
    'accessory',
    { level: 2, guard: 2, extra: { elementBonus: { names: ['火', '冰', '電'], bonusByKinds: { 2: 2, 3: 5 } } } },
    '【飾品・等級2】傷害計算時我方傷害 +X：本回合打出的招式名稱包含「火」「冰」「電」達 2 種時 X = 2，3 種時 X = 5。',
  ),

  // 招式：元素系（詠唱引爆傷害 = 基礎傷害 + 詠唱加成）
  technique(
    'mg_el_huoqiu',
    '火球',
    'trick',
    { damage: 2, guard: 2, chant: { cost: 1, damage: 4, bonus: 2, text: '詠唱(1)：此卡傷害 +2。' } },
    '【詠唱(1)】此卡傷害 +2。',
  ),
  technique(
    'mg_el_bingzhui',
    '冰錐',
    'trick',
    {
      damage: 1,
      guard: 3,
      chant: {
        cost: 1,
        damage: 1,
        bonus: 0,
        effects: [{ type: 'addEventCounters', n: 1 }],
        text: '詠唱(1)：在事件卡上放置 1 個持續時間指示物。',
      },
    },
    '【詠唱(1)】在事件卡上放置 1 個持續時間指示物。',
  ),
  technique(
    'mg_el_dianqiu',
    '電球',
    'trick',
    {
      damage: 1,
      guard: 1,
      effects: [{ type: 'discardToSalvage', filter: { kind: 'technique', nameAny: ['電'] } }],
      chant: { cost: 1, damage: 2, bonus: 1, text: '詠唱(1)：此卡傷害 +1。' },
    },
    '可以捨棄 1 張手牌，若這麼做則從棄牌區選擇 1 張名稱包含「電」的招式卡加入手牌。【詠唱(1)】此卡傷害 +1。',
  ),
  technique(
    'mg_el_huoqiang',
    '火牆',
    'secret',
    {
      damage: 1,
      guard: 2,
      chant: {
        cost: 2,
        damage: 1,
        bonus: 0,
        effects: [
          {
            type: 'modify',
            target: 'techniqueDamage',
            amount: 2,
            expiry: { at: 'thisTurnEnd' },
            filter: { kind: 'technique', nameAny: ['火'] },
            excludeSelf: true,
          },
        ],
        text: '詠唱(2)：本回合其他名稱包含「火」的招式傷害 +2。',
      },
    },
    '【詠唱(2)】本回合其他名稱包含「火」的招式傷害 +2。',
  ),
  technique(
    'mg_el_bingqiang',
    '冰牆',
    'secret',
    {
      damage: 1,
      guard: 3,
      chant: {
        cost: 2,
        damage: 1,
        bonus: 0,
        conditionalBonus: { when: { type: 'eventExpiredThisTurn' }, damage: 5 },
        text: '詠唱(2)：本回合若有事件因持續時間到而捨棄，此卡傷害 +5。',
      },
    },
    '【詠唱(2)】本回合若有事件因持續時間到而捨棄，此卡傷害 +5。',
  ),
  technique(
    'mg_el_dianwang',
    '電網',
    'secret',
    {
      damage: 1,
      guard: 1,
      effects: [
        { type: 'draw', n: 1 },
        { type: 'discardChosen', n: 1 },
      ],
      chant: {
        cost: 2,
        damage: 1,
        bonus: 0,
        effects: [{ type: 'opponentDiscardTechOrMill', mill: 4 }],
        text: '詠唱(2)：對手選擇捨棄自己手中 1 張招式，或捨棄牌組頂 4 張。',
      },
    },
    '抽 1 張，捨棄 1 張手牌。【詠唱(2)】對手選擇捨棄自己手中 1 張招式，或捨棄牌組頂 4 張。',
  ),
  technique(
    'mg_el_huoyu',
    '火雨',
    'ultimate',
    { damage: 3, guard: 2, cost: 1, chant: { cost: 1, damage: 5, bonus: 2, text: '詠唱(1)：此卡傷害 +2。' } },
    '【詠唱(1)】此卡傷害 +2。',
  ),
  technique(
    'mg_el_bingshuang',
    '冰霜爆',
    'ultimate',
    {
      damage: 2,
      guard: 3,
      cost: 1,
      chant: {
        cost: 2,
        damage: 2,
        bonus: 0,
        effects: [{ type: 'addEventCounters', n: 2 }],
        text: '詠唱(2)：在事件卡上放置 2 個持續時間指示物。',
      },
    },
    '【詠唱(2)】在事件卡上放置 2 個持續時間指示物。',
  ),
  technique(
    'mg_el_diancipao',
    '電磁砲',
    'ultimate',
    {
      damage: 2,
      guard: 1,
      cost: 1,
      effects: [{ type: 'discardToSalvage', filter: { kind: 'technique', nameAny: ['電'] } }],
      chant: { cost: 2, damage: 4, bonus: 2, text: '詠唱(2)：此卡傷害 +2。' },
    },
    '可以捨棄 1 張手牌，若這麼做則從棄牌區選擇 1 張名稱包含「電」的招式卡加入手牌。【詠唱(2)】此卡傷害 +2。',
  ),
  technique(
    'mg_tech_wanquan',
    '完全詠唱',
    'hidden',
    {
      damage: 1,
      guard: 4,
      cost: 1,
      liberation: { type: 'allPlayedTechniquesChanted' },
      effects: [{ type: 'gainPlayedChants' }],
    },
    '【密奧義・解放條件：本回合有詠唱過，且本回合打出的招式都帶有詠唱特性】此卡獲得本回合打出招式的全部詠唱效果，並額外詠唱此卡。',
  ),
  technique(
    'mg_tech_dianguang',
    '電光石火',
    'hidden',
    {
      damage: 5,
      guard: 4,
      cost: 1,
      liberation: { type: 'playedNamesThisTurn', names: ['電', '火'] },
      effects: [
        { type: 'discardAllHand' },
        { type: 'reshuffleDiscard', filter: { kind: 'technique', nameAny: ['電', '火'] }, then: 'boostSelf' },
      ],
    },
    '【密奧義・解放條件：本回合打出過名稱包含「電」與「火」的招式各 1 張】捨棄全部手牌，棄牌區名稱包含「電」「火」的招式卡全部放回牌組洗牌。此卡傷害 +X（X = 放回牌組的張數）。',
  ),
  technique(
    'mg_tech_bingling',
    '冰菱城下',
    'hidden',
    {
      damage: 3,
      guard: 4,
      cost: 1,
      liberation: { type: 'anyOf', conditions: [{ type: 'eventExpiredThisTurn' }, { type: 'eventHasCounters' }] },
      effects: [{ type: 'discardAngerByCountersGainChant', filter: { nameAny: ['冰'] } }],
    },
    '【密奧義・解放條件：本回合有事件因持續時間到而捨棄，或事件區的事件上有持續時間指示物】捨棄自己怒氣區 X 張（X = 我方卡片上的持續時間指示物總數）。此卡獲得因此捨棄、名稱包含「冰」的招式詠唱效果，並額外詠唱此卡。',
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
    '【持續時間1・冷卻3】本回合受到的戰鬥傷害減免 2 點。離開事件區後進入冷卻區；在冷卻區期間：我方防禦值 +1。',
    {
      duration: 1,
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
    '【持續時間1】回復 2 張怒氣卡至牌組頂，本回合防禦值 +2。',
    { duration: 1 },
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
// 【共用 / 中立】卡牌（任何流派皆可構築）
// ─────────────────────────────────────────────

export const COMMON_CARDS: readonly CardDef[] = [
  // 行動
  action(
    'cm_tiandi',
    '天地吐納',
    1,
    1,
    [
      { type: 'draw', n: 1 },
      { type: 'recover', n: 1 },
    ],
    '調順呼吸，抽取 1 張卡並回復 1 張怒氣卡至牌組頂。',
  ),
  action(
    'cm_xinjue',
    '靜心凝氣',
    0,
    1,
    [{ type: 'draw', n: 1 }],
    '【0費】平復氣息，抽取 1 張卡。',
  ),
  action(
    'cm_dan_huigu',
    '回生金丹',
    1,
    1,
    [{ type: 'recover', n: 2 }],
    '吞服靈丹，回復 2 張怒氣卡至牌組頂。',
  ),

  // 事件
  event(
    'cm_jinchan',
    '金蟬脫殼',
    2,
    2,
    [{ type: 'modify', target: 'damageReduction', amount: 2, expiry: { at: 'thisTurnEnd' } }],
    '【持續時間1】幻形退避，本回合受到的戰鬥傷害減免 2 點。',
    { duration: 1 },
  ),
  event(
    'cm_qiguan',
    '氣貫長虹',
    1,
    1,
    [{ type: 'modify', target: 'techniqueDamage', amount: 2, expiry: { at: 'thisTurnEnd' } }],
    '【持續時間1】真氣灌頂，本回合所有招式傷害 +2。',
    { duration: 1 },
  ),

  // 裝備
  equipment(
    'cm_eq_tieyi',
    '護心鐵鏡',
    'accessory',
    {
      level: 1,
      guard: 2,
      effects: [{ type: 'modify', target: 'guardValue', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【飾品・等級1】防禦值 +1。',
  ),
  equipment(
    'cm_eq_caoxie',
    '疾風草履',
    'boots',
    {
      level: 1,
      guard: 1,
      effects: [{ type: 'modify', target: 'drawCount', amount: 1, expiry: { at: 'permanent' } }],
    },
    '【鞋子・等級1】抽牌階段多抽 1 張卡。',
  ),

  // 招式
  technique(
    'cm_tech_zhengquan',
    '正氣拳',
    'trick',
    { damage: 2, guard: 2 },
    '江湖各派通用的基礎剛猛拳法。',
  ),
  technique(
    'cm_tech_shentou',
    '探海掌',
    'secret',
    {
      damage: 3,
      guard: 2,
      comboBonus: { sequence: ['trick', 'secret'], damage: 1 },
    },
    '【連招：特技→密技】此擊傷害 +1。',
  ),
  technique(
    'cm_tech_poyun',
    '破雲式',
    'ultimate',
    { damage: 5, guard: 2, cost: 1 },
    '【奧義】勢如破竹的一擊，造成 5 點傷害。',
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
  ...COMMON_CARDS,
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
// 卡牌角色歸屬與卡池篩選
// ─────────────────────────────────────────────

export type CardAffiliation = CharacterId | 'common' | 'quest';

export function cardAffiliation(id: string): CardAffiliation {
  if (id.startsWith('rg_')) return 'rage';
  if (id.startsWith('mg_')) return 'mage';
  if (id.startsWith('qg_')) return 'qigong';
  if (id.startsWith('cm_')) return 'common';
  if (id.startsWith('qst_')) return 'quest';
  return 'common';
}

export function isCardAllowedForCharacter(cardId: string, charId: CharacterId): boolean {
  const aff = cardAffiliation(cardId);
  return aff === charId || aff === 'common';
}

export function getCardPoolForCharacter(charId: CharacterId): CardDef[] {
  return CARD_DEFS.filter(
    (c) => c.kind !== 'quest' && isCardAllowedForCharacter(c.id, charId),
  );
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
  rg_tech_nubaofa: 4,
  rg_tech_xiumie: 3,
  rg_tech_bajuan: 2,
  rg_tech_nuhai: 1,
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
  mg_tech_huoqiu: 4,
  mg_tech_yunshi: 3,
  mg_tech_jiguang: 3,
  mg_tech_xingyun: 2,
  mg_tech_yanmie: 1,
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
  qg_tech_chuanyun: 4,
  qg_tech_bengshan: 4,
  qg_tech_qixuan: 3,
  qg_tech_hunyuan: 3,
  qg_tech_zhentian: 3,
  qg_tech_jiuxiao: 2,
  qg_tech_jingang: 1,
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

export function validateMainDeck(
  counts: Readonly<Record<string, number>>,
  character?: CharacterId,
): DeckValidation {
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
    if (character && !isCardAllowedForCharacter(id, character)) {
      errors.push(`「${def.name}」不屬於該角色專屬或共用卡池`);
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
