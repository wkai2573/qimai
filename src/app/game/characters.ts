/**
 * 《氣脈》— 角色系統定義
 */

import type { CharacterId } from './types';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  title: string;
  badge: string;
  colorName: 'rose' | 'sky' | 'emerald';
  summary: string;
  featureDesc: string;
  primaryPlaystyle: string;
  bgGradient: string;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  rage: {
    id: 'rage',
    name: '狂怒',
    title: '狂怒修羅',
    badge: '怒火焚身',
    colorName: 'rose',
    summary: '以傷換怒，化血為刃。專精怒氣循環與對手干擾。',
    featureDesc: '消耗怒氣發動強力效果，卡片使用後直接送入怒氣區底；能迫使對手捨棄手牌至怒氣區。',
    primaryPlaystyle: '怒底循環 · 對手干擾 · 殘血爆發',
    bgGradient: 'from-rose-950/80 via-red-900/40 to-slate-950',
  },
  mage: {
    id: 'mage',
    name: '秘法',
    title: '秘法星詠',
    badge: '魔能詠唱',
    colorName: 'sky',
    summary: '引導魔能，構築詠唱。追求極致的傷害增幅與元素轟炸。',
    featureDesc: '主要階段可進行一次「詠唱」出招，戰鬥時作為額外出招引爆；擁有強大的直接增傷手段。',
    primaryPlaystyle: '詠唱出招 · 傷害增幅 · 元素轟炸',
    bgGradient: 'from-sky-950/80 via-indigo-900/40 to-slate-950',
  },
  qigong: {
    id: 'qigong',
    name: '氣功',
    title: '玄門氣宗',
    badge: '經脈冷卻',
    colorName: 'emerald',
    summary: '以氣化勁，循環相生。利用冷卻區與儲存機制維持常駐增益。',
    featureDesc: '卡片使用後進入「冷卻區」進行計時；冷卻期間提供常駐護體減傷或增傷 BUFF；注重連動效果。',
    primaryPlaystyle: '冷卻常駐 · 護體減傷 · 經脈循環',
    bgGradient: 'from-emerald-950/80 via-teal-900/40 to-slate-950',
  },
};

export const CHARACTER_IDS: readonly CharacterId[] = ['rage', 'mage', 'qigong'];

