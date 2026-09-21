/**
 * 《氣脈》— 核心型別定義
 *
 * 這個目錄（src/app/game）是完全獨立的純 TypeScript 規則層，不 import 任何 Angular API。
 * 好處：
 *   1. vitest 可以直接單元測試，不必啟動 TestBed
 *   2. 日後要做連線對戰，同一份檔案可直接搬到伺服器執行（伺服器權威架構）
 *   3. UI 換框架也不會動到規則本身
 */

// ─────────────────────────────────────────────
// 卡牌分類
// ─────────────────────────────────────────────

/** 角色三大類型 */
export type CharacterId = 'rage' | 'mage' | 'qigong';

export const CHARACTER_LABEL: Record<CharacterId, string> = {
  rage: '狂怒',
  mage: '秘法',
  qigong: '氣功',
};

/** 卡牌五大種類 */
export type CardKind = 'equipment' | 'action' | 'event' | 'quest' | 'technique';

export const CARD_KIND_LABEL: Record<CardKind, string> = {
  equipment: '裝備',
  action: '行動',
  event: '事件',
  quest: '任務',
  technique: '招式',
};

/** 招式子類。這個順序就是戰鬥階段「出招步驟」的固定打出順序 */
export type TechniqueTier = 'trick' | 'secret' | 'ultimate' | 'hidden';

/** 特技 → 密技 → 奧義 → 密奧義 */
export const TECHNIQUE_ORDER: readonly TechniqueTier[] = ['trick', 'secret', 'ultimate', 'hidden'];

export const TECHNIQUE_LABEL: Record<TechniqueTier, string> = {
  trick: '特技',
  secret: '密技',
  ultimate: '奧義',
  hidden: '密奧義',
};

/** 裝備部位 */
export type EquipSlot = 'weapon' | 'helmet' | 'glove' | 'boots' | 'accessory';

/** 各部位可裝備的張數上限：飾品可裝 2 張，其餘各 1 張 */
export const EQUIP_LIMITS: Record<EquipSlot, number> = {
  weapon: 1,
  helmet: 1,
  glove: 1,
  boots: 1,
  accessory: 2,
};

export const EQUIP_LABEL: Record<EquipSlot, string> = {
  weapon: '武器',
  helmet: '頭盔',
  glove: '手套',
  boots: '鞋子',
  accessory: '飾品',
};

/** 構築與開局規則常數（集中管理，測試與 UI 都讀這裡） */
export const RULES = {
  mainDeckSize: 50,
  questDeckSize: 5,
  /** 裝備／行動／事件／招式：同名卡上限 */
  maxCopiesPerName: 4,
  /** 密奧義：張數合計上限 */
  maxHiddenTechniques: 6,
  /** 生命區張數 */
  lifeCount: 3,
  /** 先攻起始抽牌數 */
  firstDraw: 8,
  /** 後攻起始抽牌數 */
  secondDraw: 10,
  /** 每回合抽牌階段抽幾張 */
  drawPerTurn: 2,
  /** 爆發階段丟棄牌組頂幾張來換 1 張手牌 */
  burstMill: 2,
  /** 事件卡每回合使用上限 */
  eventsPerTurn: 1,
  /** 詠唱每回合上限 */
  chantsPerTurn: 1,
} as const;

// ─────────────────────────────────────────────
// 效果系統（資料驅動）
// ─────────────────────────────────────────────

/** 卡牌篩選條件，用於檢索與回收 */
export interface CardFilter {
  kind?: CardKind;
  tier?: TechniqueTier;
  slot?: EquipSlot;
  /** 僅限名稱包含此字串者 */
  nameContains?: string;
}

/**
 * 效果持續到什麼時機。
 * 刻意用「相對描述」而不是絕對座位，這樣同一張卡不論由玩家或 NPC 使用都成立，
 * 引擎再依「效果擁有者是誰」決定實際座位。
 */
export type ExpiryPoint =
  | { at: 'thisTurnEnd' } // 到本回合結束
  | { at: 'opponentTurnEnd' } // 到對手回合結束
  | { at: 'nextOwnTurnStart' } // 到下個自己回合開始
  | { at: 'permanent' }; // 永久（裝備）

/** 可被增益影響的數值 */
export type ModifierTarget =
  | 'techniqueDamage' // 招式傷害
  | 'hiddenDamage' // 密奧義傷害
  | 'guardValue' // 防禦值
  | 'drawCount' // 抽牌階段的抽牌數
  | 'recoverAmount' // 回復量
  | 'cost' // 使用費用
  | 'extraGuard' // 防禦判定時額外翻開的張數
  | 'chantDamage' // 詠唱傷害加成
  | 'damageReduction' // 減免傷害
  | 'immuneTrickSecret'; // 免疫特技與密技傷害與效果

/**
 * 效果。資料驅動的核心：新增卡片只要組合這些既有效果，不必改引擎。
 * 需要新行為時才在此擴充一個 type，並在 engine 的 applyEffect 補上對應分支。
 */
export type Effect =
  | { type: 'draw'; n: number }
  /** 牌組頂 N 張直接進怒氣區（等同受到 N 點傷害，但不由戰鬥產生） */
  | { type: 'mill'; n: number }
  /** 回復N：怒氣區 N 張放回牌組頂 */
  | { type: 'recover'; n: number }
  /** 從棄牌區取回 N 張上手 */
  | { type: 'salvage'; n: number; filter?: CardFilter }
  /** 檢索：看牌組頂 look 張，取 pick 張上手，其餘進棄牌區 */
  | { type: 'search'; look: number; pick: number; filter?: CardFilter }
  /** 隨機棄 N 張手牌 */
  | { type: 'discardHand'; n: number }
  /** 變更數值，持續到指定時機 */
  | { type: 'modify'; target: ModifierTarget; amount: number; expiry: ExpiryPoint }
  /** 戰鬥時額外翻 N 張防禦卡 */
  | { type: 'extraGuard'; n: number; expiry: ExpiryPoint }
  /** 等級 +N */
  | { type: 'gainLevel'; n: number }
  /** 【洩憤】公開怒氣頂 look 張，招式卡全上手，其餘棄牌 */
  | { type: 'rageSearchTech'; look: number }
  /** 【忍氣吞聲】回復 X（X = 手牌數） */
  | { type: 'recoverHandCount' }
  /** 【挑釁/威嚇】對手選擇 1 張手牌置於怒氣區底 */
  | { type: 'forceOpponentHandToAnger'; conditionHandAtLeast?: number }
  /** 【拋下狠話】對手捨棄 1 張招式卡（無則展示手牌），我方抽 1 張 */
  | { type: 'opponentDiscardTechnique' }
  /** 本回合下一張特定卡免費用 */
  | { type: 'freeCardNext'; targetDefId: string }
  /** 【替罪羊】對手下回合中我方不受特技、密技傷害與效果影響 */
  | { type: 'immuneTrickSecret' }
  /** 【氣功】使冷卻區所有卡牌進度 +N */
  | { type: 'advanceCooldowns'; n: number }
  /** 【氣功】立即完成 1 張冷卻卡送入棄牌區 */
  | { type: 'finishCooldown' }
  /** 條件效果：when 成立時才套用 effect。連招加成、密奧義追加效果都靠這個 */
  | { type: 'conditional'; when: Condition; effect: Effect };

/** 條件判斷，用於連招、密奧義解放、裝備門檻 */
export type Condition =
  | { type: 'always' }
  /** 連招：本戰鬥階段已依序打出指定 tier 組合 */
  | { type: 'combo'; sequence: TechniqueTier[] }
  /** 本回合已使用過指定 tier 的招式 */
  | { type: 'usedTierThisTurn'; tier: TechniqueTier }
  | { type: 'handAtLeast'; n: number }
  | { type: 'angerAtLeast'; n: number }
  | { type: 'deckAtLeast'; n: number }
  | { type: 'lifeAtLeast'; n: number }
  | { type: 'equippedSlot'; slot: EquipSlot }
  | { type: 'levelAtLeast'; n: number }
  /** 冷卻區卡牌數量達到 N */
  | { type: 'cooldownCountAtLeast'; n: number }
  /** 本回合已有詠唱過招式 */
  | { type: 'hasChantedThisTurn' };

/**
 * 任務條件。任務卡是「雙面」的：
 *   complete — 我方達成 → 任務完成，等級 +1，此卡進等級區
 *   block    — 對手促成 → 我方任務失敗，此卡回到我方手牌
 */
export type QuestCondition =
  | { type: 'playKindInTurn'; kind: CardKind; n: number }
  | { type: 'playTierInTurn'; tier: TechniqueTier; n: number }
  | { type: 'handAtLeast'; n: number }
  | { type: 'takeDamageInTurn'; n: number }
  | { type: 'dealDamageInTurn'; n: number }
  | { type: 'comboInTurn'; sequence: TechniqueTier[] }
  | { type: 'recoverInTurn'; n: number }
  | { type: 'rebuildInTurn'; n: number }
  | { type: 'levelAtLeast'; n: number };

// ─────────────────────────────────────────────
// 卡牌定義
// ─────────────────────────────────────────────

export interface QuestDef {
  /** 是否帶有「起始任務」特徵（任務牌組必須至少 1 張） */
  starter: boolean;
  /** 我方完成條件 */
  complete: QuestCondition;
  /** 對方阻止條件（由對手促成的失敗條件） */
  block: QuestCondition;
  /** 任務條件的白話說明，供 UI 顯示 */
  completeText: string;
  blockText: string;
}

/** 詠唱特性定義 */
export interface ChantDef {
  cost: number;
  damage?: number;
  guardReduction?: number;
  text: string;
}

/** 冷卻常駐增益定義 */
export interface CooldownBuffDef {
  target: ModifierTarget;
  amount: number;
  text: string;
}

export interface CardDef {
  id: string;
  name: string;
  kind: CardKind;

  /** 防禦值：所有卡都有。被翻作防禦卡時，扣掉對手這麼多傷害 */
  guard: number;

  /** 費用：需橫置幾張生命卡支付。招式卡通常為 0，改用其他代價 */
  cost: number;

  /**
   * 額外費用：捨棄怒氣區 N 張卡（進入棄牌區）。
   * 用來做出「把累積的怒氣轉換成力量」的卡片。
   */
  angerCost?: number;

  /** 卡面敘述（UI 顯示用） */
  text: string;

  /** 【狂怒】使用後不送棄牌區，改置於怒氣區最底下 */
  toAngerBottom?: boolean;

  /** 【魔法】詠唱特性：可在主要階段支付費用打出，戰鬥階段作為額外出招引爆 */
  chant?: ChantDef;

  /** 【氣功】冷卻回合數：使用後進入冷卻區，累積 X 個指示物後進棄牌區 */
  cooldown?: number;

  /** 【氣功】儲存(X)：冷卻區低於 X 張此卡同名卡時，不受同名卡無法使用影響 */
  storage?: number;

  /** 【氣功】在冷卻區期間為角色提供的常駐增益 */
  cooldownBuff?: CooldownBuffDef;

  // ── 招式專屬 ──
  tier?: TechniqueTier;
  /** 基礎傷害 */
  damage?: number;
  /**
   * 連招加成：本戰鬥階段出招序列的尾端符合 sequence 時，這一擊額外增加 damage 點傷害。
   * 刻意做成獨立欄位而不是 buff——它只強化「這一張卡」，不會滾雪球到本回合後續招式。
   */
  comboBonus?: { sequence: TechniqueTier[]; damage: number };
  /** 密奧義解放條件：不滿足就不能打出 */
  liberation?: Condition;

  // ── 裝備專屬 ──
  slot?: EquipSlot;
  /** 裝備使用門檻：等級 N 以上才能使用 */
  levelRequirement?: number;

  // ── 任務專屬 ──
  quest?: QuestDef;

  /** 卡牌效果 */
  effects?: Effect[];
}

// ─────────────────────────────────────────────
// 執行期狀態
// ─────────────────────────────────────────────

/** 座位。player = 人類玩家，npc = 電腦對手 */
export type Seat = 'player' | 'npc';

export const OTHER_SEAT: Record<Seat, Seat> = { player: 'npc', npc: 'player' };

/** 牌組／棄牌區／手牌中的一張實體卡。同一張卡可能有多份，用 iid 追蹤個體 */
export interface CardInstance {
  /** 本局唯一的執行期 id */
  iid: number;
  /** 指向 CardDef.id */
  defId: string;
}

/** 冷卻區的一張卡 */
export interface CooldownCard {
  card: CardInstance;
  counter: number;
  maxCounter: number;
}

/** 生命區的一張卡。橫置 = 本回合已支付費用，重置階段會復原 */
export interface LifeCard {
  card: CardInstance;
  tapped: boolean;
}

/** 持續中的增益／減益 */
export interface Buff {
  id: number;
  /** 來源卡名，UI 顯示用 */
  source: string;
  target: ModifierTarget;
  amount: number;
  expiry: ExpiryPoint;
}

/** 單一回合內的統計，任務條件與連招的判定依據 */
export interface TurnStats {
  playKind: Record<CardKind, number>;
  playTier: Record<TechniqueTier, number>;
  damageTaken: number;
  damageDealt: number;
  drawn: number;
  recovered: number;
  rebuilt: number;
  /** 本回合已成立的連招（以 sequence 的 key 記錄） */
  combos: string[];
  /** 本回合打出的招式 tier 序列（依打出順序） */
  tierSequence: TechniqueTier[];
}

export interface SideState {
  seat: Seat;
  character: CharacterId;
  /** 任務完成數，即等級 */
  level: number;
  deck: CardInstance[];
  hand: CardInstance[];
  life: LifeCard[];
  anger: CardInstance[];
  discard: CardInstance[];
  equipment: CardInstance[];
  levelZone: CardInstance[];
  questDeck: CardInstance[];
  currentQuest: CardInstance | null;
  /** 氣功專屬：冷卻區 */
  cooldownZone: CooldownCard[];
  /** 魔法專屬：本回合已詠唱的招式卡 */
  chantedCards: CardInstance[];
  /** 本回合已詠唱次數（上限 RULES.chantsPerTurn） */
  chantsUsedThisTurn: number;
  /** 免費卡清單（例如拋下狠話讓替罪羊免費） */
  freeNextCards: string[];
  /** 替罪羊：下個對手回合中免疫特技、密技傷害與效果 */
  immuneTrickSecretNextTurn: boolean;
  stats: TurnStats;
  /** 本回合已使用的事件卡數（上限 RULES.eventsPerTurn） */
  eventsUsedThisTurn: number;
  /** 本回合是否已結算過任務（完成或失敗），防止連鎖結算 */
  questResolvedThisTurn: boolean;
  buffs: Buff[];
}

/** 戰鬥階段內部步驟 */
export type CombatStep = 'declare' | 'defense' | 'damage' | 'return' | 'done';

export interface CombatPlay {
  tier: TechniqueTier;
  card: CardInstance;
  /** 結算當下的實際傷害（含增益） */
  damage: number;
}

export interface ChantCombatPlay {
  card: CardInstance;
  damage: number;
  guardReduction?: number;
}

export interface CombatState {
  attacker: Seat;
  defender: Seat;
  /** 出招步驟打出的招式，依 tier 順序 */
  plays: CombatPlay[];
  /** 詠唱特殊出招 */
  chantPlays: ChantCombatPlay[];
  /** 防禦判定步驟翻開的防禦卡 */
  defenseCards: CardInstance[];
  /** 防禦值總和 */
  defenseGuard: number;
  /** 傷害總和 − 防禦值，最低 0 */
  damage: number;
  step: CombatStep;
  /** 本戰鬥是否成立連招 */
  comboFormed: boolean;
}

/** 回合階段 */
export type Phase = 'setup' | 'reset' | 'draw' | 'burst' | 'main' | 'combat' | 'ended';

export const PHASE_LABEL: Record<Phase, string> = {
  setup: '準備',
  reset: '重置階段',
  draw: '抽牌階段',
  burst: '爆發階段',
  main: '主要階段',
  combat: '戰鬥階段',
  ended: '遊戲結束',
};

export type LogTone = 'info' | 'combat' | 'quest' | 'rebuild' | 'system' | 'error';

export interface LogEntry {
  turn: number;
  seat: Seat | null;
  text: string;
  tone: LogTone;
}

/** 需要玩家做選擇的種類 */
export type PendingChoiceKind =
  | 'search' // 檢索：看牌組頂 N 張，選 M 張加入手牌
  | 'lifeSetup'; // 開局：從手牌選 N 張覆蓋到生命區

/**
 * 等待玩家做選擇的待決事項。非 null 時遊戲暫停，UI 要先讓玩家選完才能繼續。
 *
 * 與 PendingRebuild 分開，是因為重構還帶著「打斷了抽牌、選完要補完」的額外狀態，
 * 而這裡的選擇是獨立的、選完就結束。
 */
export interface PendingChoice {
  kind: PendingChoiceKind;
  seat: Seat;
  prompt: string;
  /** 可以選的卡片 */
  candidates: CardInstance[];
  /** 需要選幾張 */
  pick: number;
  /** 已選中的 iid；累積到 pick 張才會結算 */
  selected: number[];
  /** 檢索專用：沒被選中的牌要去哪裡 */
  rest?: 'discard' | 'deckTop';
}

/**
 * 重構（扣血）時等待玩家挑選要加入手牌的生命卡。
 *
 * 生命區有多張卡時不能自動決定——挑哪一張進手牌會影響後續戰局，
 * 所以遊戲會停在這裡等玩家選。生命區只剩一張時則直接自動處理，不必打擾玩家。
 */
export interface PendingRebuild {
  seat: Seat;
  /** 完成重構後還要繼續處理的張數（例如抽牌抽到一半） */
  remaining: number;
  /** 完成後要接續的動作 */
  resume: 'draw' | 'anger' | 'discard';
}

export interface GameState {
  /** 本局種子。同一 seed + 同一串操作 = 完全相同的對局 */
  seed: number;
  /** 隨機數產生器的當前內部狀態。存進 state 才能讓整局可序列化、可存檔、可重播 */
  rngState: number;
  turn: number;
  activeSeat: Seat;
  phase: Phase;
  sides: Record<Seat, SideState>;
  combat: CombatState | null;
  winner: Seat | null;
  log: LogEntry[];
  /** 下一個可用的執行期 id */
  nextIid: number;
  pending: PendingChoice | null;
  /** 等待玩家挑選生命卡的重構；非 null 時遊戲暫停 */
  pendingRebuild: PendingRebuild | null;
}
