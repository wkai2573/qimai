/**
 * 《氣脈》— 牌組匯入 / 匯出
 *
 * 匯出格式是純文字，方便貼在聊天室或存成 .txt：
 *
 *   # 氣脈 Qimai 牌組
 *   # 狂怒修羅 · 50 張
 *   character: rage
 *
 *   # 招式
 *   4 rg_tech_nuce 起手怒策
 *
 * 每行是「張數 卡牌ID 卡名」，卡名只給人看，匯入時以 ID 為準
 * （卡名有重複，例如氣宗的「氣貫長虹」有兩張不同的卡）。
 * 匯入也接受「張數 卡名」、「4x 卡名」，以及 localStorage 存的 JSON 格式。
 */

import { getCardPoolForCharacter, tryCard } from './cards';
import { CHARACTERS } from './characters';
import { CARD_KIND_LABEL, type CardDef, type CharacterId } from './types';

export interface DeckEntry {
  def: CardDef;
  count: number;
}

export type DeckImportResult =
  | { ok: true; deck: Record<string, number> }
  | { ok: false; errors: string[] };

/** 匯入的文字上限，避免誤選到大檔案 */
export const DECK_TEXT_MAX_LENGTH = 20_000;

const KIND_WEIGHT: Record<string, number> = { technique: 1, action: 2, event: 3, equipment: 4 };
const TIER_WEIGHT: Record<string, number> = { hidden: 1, ultimate: 2, secret: 3, trick: 4 };

/** 牌組條目排序：招式（密奧義 → 奧義 → 密技 → 特技）→ 行動 → 事件 → 裝備，同類依費用 */
export function sortedDeckEntries(counts: Readonly<Record<string, number>>): DeckEntry[] {
  const entries: DeckEntry[] = [];
  for (const [id, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const def = tryCard(id);
    if (def) entries.push({ def, count });
  }

  entries.sort((a, b) => {
    const kw = (KIND_WEIGHT[a.def.kind] ?? 9) - (KIND_WEIGHT[b.def.kind] ?? 9);
    if (kw !== 0) return kw;
    if (a.def.kind === 'technique' && b.def.kind === 'technique') {
      const tw = (TIER_WEIGHT[a.def.tier ?? ''] ?? 9) - (TIER_WEIGHT[b.def.tier ?? ''] ?? 9);
      if (tw !== 0) return tw;
    }
    return a.def.cost - b.def.cost;
  });

  return entries;
}

/** 把牌組轉成可分享的文字 */
export function formatDeck(counts: Readonly<Record<string, number>>, character: CharacterId): string {
  const entries = sortedDeckEntries(counts);
  const total = entries.reduce((sum, e) => sum + e.count, 0);

  const lines = ['# 氣脈 Qimai 牌組', `# ${CHARACTERS[character].title} · ${total} 張`, `character: ${character}`];
  let kind = '';
  for (const { def, count } of entries) {
    if (def.kind !== kind) {
      kind = def.kind;
      lines.push('', `# ${CARD_KIND_LABEL[def.kind]}`);
    }
    lines.push(`${count} ${def.id} ${def.name}`);
  }
  return lines.join('\n') + '\n';
}

/** 角色欄位可以寫 id（rage）或稱號（狂怒修羅） */
function resolveCharacter(value: string): CharacterId | undefined {
  const v = value.trim();
  return (Object.keys(CHARACTERS) as CharacterId[]).find((id) => id === v || CHARACTERS[id].title === v);
}

/**
 * 解析匯入的文字，只收目前角色卡池裡的卡。
 * 任何一行讀不懂就整份退回，不會只匯入一半。
 * 張數、密奧義上限這類構築規則不在這裡擋，交給組牌器的驗證提示。
 */
export function parseDeck(text: string, character: CharacterId): DeckImportResult {
  const src = text.replace(/^﻿/, '').trim();
  if (!src) return { ok: false, errors: ['沒有內容可以匯入'] };
  if (src.length > DECK_TEXT_MAX_LENGTH) return { ok: false, errors: ['內容太長，這看起來不是牌組'] };

  const pool = getCardPoolForCharacter(character);
  const poolIds = new Set(pool.map((c) => c.id));
  const title = CHARACTERS[character].title;
  const errors: string[] = [];
  const deck: Record<string, number> = {};

  const add = (where: string, key: string, count: unknown): void => {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      errors.push(`${where}：「${key}」的張數不正確`);
      return;
    }
    if (count === 0) return;
    const def = resolveCard(key, pool);
    if (typeof def === 'string') {
      errors.push(`${where}：${def}`);
      return;
    }
    if (!poolIds.has(def.id)) {
      errors.push(`${where}：「${def.name}」不在「${title}」的卡池裡`);
      return;
    }
    deck[def.id] = (deck[def.id] ?? 0) + count;
  };

  // 角色不對時每張卡都會報「不在卡池」，只留這一句就好
  let wrongCharacter: string | null = null;
  const checkCharacter = (value: string): void => {
    const ch = resolveCharacter(value);
    if (!ch) errors.push(`不認得的角色「${value}」`);
    else if (ch !== character) wrongCharacter = `這是「${CHARACTERS[ch].title}」的牌組，目前正在構築「${title}」`;
  };

  if (src.startsWith('{')) {
    // JSON：{ "rg_x": 4 } 或 { "character": "rage", "deck": { ... } }
    let data: unknown;
    try {
      data = JSON.parse(src);
    } catch {
      return { ok: false, errors: ['JSON 格式錯誤'] };
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, errors: ['JSON 內容不是牌組'] };
    }
    const obj = data as Record<string, unknown>;
    const counts = obj['deck'] && typeof obj['deck'] === 'object' ? (obj['deck'] as Record<string, unknown>) : obj;
    if (typeof obj['character'] === 'string') checkCharacter(obj['character']);
    for (const [key, count] of Object.entries(counts)) {
      if (counts === obj && key === 'character') continue;
      add('JSON', key, count);
    }
  } else {
    src.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      const where = `第 ${i + 1} 行`;
      if (!line || line.startsWith('#') || line.startsWith('//')) return;

      const meta = /^(character|角色)\s*[:：]\s*(.+)$/i.exec(line);
      if (meta) {
        checkCharacter(meta[2]);
        return;
      }

      const m = /^(\d+)\s*[xX×]?\s+(.+)$/.exec(line);
      if (!m) {
        errors.push(`${where}：看不懂「${line}」，格式應為「張數 卡牌ID」`);
        return;
      }
      add(where, m[2].trim(), Number(m[1]));
    });
  }

  if (wrongCharacter) return { ok: false, errors: [wrongCharacter] };
  if (errors.length === 0 && Object.keys(deck).length === 0) errors.push('沒有讀到任何卡牌');
  return errors.length > 0 ? { ok: false, errors } : { ok: true, deck };
}

/**
 * 找出一行指的是哪張卡：先看開頭是不是卡牌 ID（後面接的卡名忽略），
 * 不是的話整段當卡名，在角色卡池裡找。找不到或有歧義時回傳錯誤訊息。
 */
function resolveCard(key: string, pool: readonly CardDef[]): CardDef | string {
  const first = key.split(/\s+/)[0];
  const byId = tryCard(first);
  if (byId && byId.kind !== 'quest') return byId;
  if (byId) return `任務卡「${byId.name}」不能放進主牌組`;

  const byName = pool.filter((c) => c.name === key);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) return `卡名「${key}」對應到 ${byName.length} 張不同的卡，請改用卡牌 ID（${byName.map((c) => c.id).join('、')}）`;
  return `找不到卡牌「${key}」`;
}
