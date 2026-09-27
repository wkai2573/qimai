import { describe, expect, it } from 'vitest';

import { CHARACTER_MAIN_DECKS, card } from './cards';
import { formatDeck, parseDeck } from './deck-code';
import type { CharacterId } from './types';

describe('牌組匯入 / 匯出', () => {
  it.each<CharacterId>(['rage', 'mage', 'qigong'])('%s 預設牌組匯出後再匯入，內容完全相同', (ch) => {
    const text = formatDeck(CHARACTER_MAIN_DECKS[ch], ch);
    const result = parseDeck(text, ch);
    expect(result).toEqual({ ok: true, deck: { ...CHARACTER_MAIN_DECKS[ch] } });
  });

  it('匯出文字帶角色與卡名，方便人看', () => {
    const text = formatDeck({ rg_tech_nuce: 4, rg_xiefen: 2 }, 'rage');
    expect(text).toContain('character: rage');
    expect(text).toContain('# 狂怒修羅 · 6 張');
    expect(text).toContain(`4 rg_tech_nuce ${card('rg_tech_nuce').name}`);
    expect(text).toContain(`2 rg_xiefen ${card('rg_xiefen').name}`);
  });

  it('可以用卡名匯入，也接受「4x」寫法，同一張卡分兩行會加總', () => {
    const name = card('rg_tech_nuce').name;
    const result = parseDeck(`4x ${name}\n# 註解\n\n1 rg_xiefen\n2 rg_xiefen`, 'rage');
    expect(result).toEqual({ ok: true, deck: { rg_tech_nuce: 4, rg_xiefen: 3 } });
  });

  it('卡名開頭是數字也讀得到（8+9棍棒）', () => {
    const result = parseDeck('1 8+9棍棒', 'rage');
    expect(result).toEqual({ ok: true, deck: { rg_eq_gunbang89: 1 } });
  });

  it('卡名有重複時要求改用 ID', () => {
    const result = parseDeck('1 氣貫長虹', 'qigong');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('qg_changhong');
  });

  it('接受 localStorage 的 JSON 格式', () => {
    expect(parseDeck('{"rg_xiefen": 3}', 'rage')).toEqual({ ok: true, deck: { rg_xiefen: 3 } });
    expect(parseDeck('{"character": "rage", "deck": {"rg_xiefen": 3}}', 'rage')).toEqual({
      ok: true,
      deck: { rg_xiefen: 3 },
    });
  });

  it('別的角色的牌組整份退回', () => {
    const text = formatDeck(CHARACTER_MAIN_DECKS.mage, 'mage');
    const result = parseDeck(text, 'rage');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(['這是「秘法星詠」的牌組，目前正在構築「狂怒修羅」']);
  });

  it('不在卡池、未知的卡、任務卡或看不懂的行都會列出錯誤，不會只匯入一半', () => {
    const result = parseDeck('4 rg_xiefen\n2 mg_gaosu\n1 不存在的卡\n1 qst_first\nhello', 'rage');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(4);
      expect(result.errors[0]).toContain('第 2 行');
      expect(result.errors[1]).toContain('找不到卡牌「不存在的卡」');
      expect(result.errors[2]).toContain('任務卡');
      expect(result.errors[3]).toContain('看不懂「hello」');
    }
  });

  it('空白內容或沒有卡牌時退回', () => {
    expect(parseDeck('   ', 'rage').ok).toBe(false);
    expect(parseDeck('character: rage\n# 什麼都沒有', 'rage').ok).toBe(false);
  });

  it('構築規則不在匯入時擋，交給組牌器提示（例如只有 3 張）', () => {
    expect(parseDeck('3 rg_xiefen', 'rage')).toEqual({ ok: true, deck: { rg_xiefen: 3 } });
  });
});
