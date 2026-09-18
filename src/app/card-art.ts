/**
 * 《氣脈》— 卡圖
 *
 * 每張卡對應一組手繪的 inline SVG 圖騰，不依賴任何外部圖片檔。
 * 好處：離線可跑、體積為零、顏色可繼承卡種色調（用 currentColor）。
 *
 * 風格統一為「墨線＋單色填充」，刻意保持幾何化，讓 32 張卡擺在一起時
 * 仍能一眼分辨，而不是變成一團裝飾。
 */

/** 統一的 SVG 外框設定，所有圖騰共用同一組線寬與端點樣式 */
function art(inner: string): string {
  return (
    '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
    inner +
    '</svg>'
  );
}

/** 實心填充的小工具（省略 stroke） */
const F = 'fill="currentColor" stroke="none"';

// ─────────────────────────────────────────────
// 招式：特技
// ─────────────────────────────────────────────

const BENG = art(`
  <circle cx="36" cy="32" r="13" />
  <path d="M30 26h12M30 32h12M30 38h12" stroke-width="2" />
  <path d="M4 22h14M2 32h12M4 42h14" />
`);

const CHAN = art(`
  <path d="M32 32c0-5 4-9 9-9s9 4 9 9-4 9-9 9" />
  <path d="M32 32c0 8-6 14-14 14S4 40 4 32s6-14 14-14" />
  <path d="M32 32a6 6 0 1 0 6-6" />
  <circle cx="32" cy="32" r="2.5" ${F} />
`);

const TA = art(`
  <path d="M40 14c4 0 6 3 6 7s-2 7-6 7-6-3-6-7 2-7 6-7z" />
  <path d="M30 26c4 0 6 3 6 7s-2 7-6 7-6-3-6-7 2-7 6-7z" opacity=".65" />
  <path d="M20 38c3 0 5 3 5 6s-2 6-5 6-5-3-5-6 2-6 5-6z" opacity=".35" />
  <path d="M8 52h20" opacity=".5" />
`);

const CUN = art(`
  <circle cx="32" cy="32" r="4" ${F} />
  <path d="M32 8v10M32 46v10M8 32h10M46 32h10" />
  <path d="M15 15l7 7M42 42l7 7M49 15l-7 7M22 42l-7 7" opacity=".6" />
  <circle cx="32" cy="32" r="15" stroke-dasharray="3 5" opacity=".8" />
`);

// ─────────────────────────────────────────────
// 招式：密技
// ─────────────────────────────────────────────

const LIE = art(`
  <path d="M22 12v16M28 10v18M34 10v18M40 12v16" />
  <path d="M18 30h28v6a14 14 0 0 1-14 14 14 14 0 0 1-14-14z" />
  <path d="M34 34l-6 9h7l-5 12" stroke-width="2.5" />
`);

const HUI = art(`
  <path d="M14 46a22 22 0 1 1 36 0" />
  <path d="M50 46l-6-4M50 46l6-5" />
  <path d="M26 30c3-4 8-4 11 0s2 9-2 11-9-1-9-6" opacity=".7" />
  <circle cx="32" cy="34" r="3" ${F} />
`);

const SUO = art(`
  <circle cx="20" cy="20" r="6" />
  <circle cx="44" cy="32" r="6" />
  <circle cx="22" cy="46" r="6" />
  <path d="M25 23l14 6M41 37l-14 7" />
  <path d="M32 8v8M52 52h8" opacity=".5" />
`);

// ─────────────────────────────────────────────
// 招式：奧義
// ─────────────────────────────────────────────

const GUAN = art(`
  <path d="M6 32h30" stroke-width="4" />
  <path d="M36 22l22 10-22 10z" ${F} />
  <path d="M14 18l6 10M10 46l10-10" opacity=".6" />
  <circle cx="6" cy="32" r="4" ${F} />
`);

const FEN = art(`
  <path d="M32 56S12 42 12 28a12 12 0 0 1 20-9 12 12 0 0 1 20 9c0 14-20 28-20 28z" />
  <path d="M32 42c-6-6-4-12 0-16 4 4 6 10 0 16z" ${F} opacity=".85" />
  <path d="M24 12c-2-4 0-8 2-10M40 12c2-4 0-8-2-10" opacity=".55" />
`);

// ─────────────────────────────────────────────
// 招式：密奧義
// ─────────────────────────────────────────────

const TIAN = art(`
  <circle cx="32" cy="34" r="20" />
  <path d="M32 8l6 14 15 2-11 10 3 15-13-7-13 7 3-15-11-10 15-2z" opacity=".9" />
  <circle cx="32" cy="34" r="6" ${F} opacity=".8" />
  <path d="M8 14h10M46 14h10M8 56h10M46 56h10" opacity=".5" />
`);

const WU = art(`
  <path d="M32 32a4 4 0 1 0 4-4" />
  <path d="M32 32a10 10 0 1 1 10 10" />
  <path d="M32 32a17 17 0 1 0 17 17" />
  <path d="M32 32a24 24 0 1 1 24 24" opacity=".7" />
  <circle cx="32" cy="32" r="3" ${F} />
`);

// ─────────────────────────────────────────────
// 裝備
// ─────────────────────────────────────────────

const DUANYUE = art(`
  <path d="M10 54L44 20l6 6L16 60z" ${F} opacity=".9" />
  <path d="M44 20l6-8 8 8-8 6z" />
  <path d="M18 46l6 6" opacity=".6" />
  <path d="M6 58l6-6" />
`);

const CHANQI = art(`
  <path d="M18 26v-6a10 10 0 0 1 20 0v6" />
  <path d="M14 26h28v22a8 8 0 0 1-8 8h-12a8 8 0 0 1-8-8z" />
  <path d="M24 34v10M32 32v14M40 34v10" opacity=".6" />
`);

const JINGXIN = art(`
  <path d="M10 44l6-22 16-8 16 8 6 22z" />
  <path d="M32 14v30" opacity=".5" />
  <circle cx="32" cy="30" r="5" />
  <path d="M6 50h52" />
`);

const XUANTIE = art(`
  <path d="M12 24c0-6 6-10 20-10s20 4 20 10v14c0 8-8 14-20 14s-20-6-20-14z" />
  <path d="M20 28h8M36 28h8" stroke-width="3" />
  <path d="M26 42c4 3 8 3 12 0" />
  <path d="M22 22l-4-8M42 22l4-8" opacity=".6" />
`);

const HUKOU = art(`
  <path d="M16 34V22a8 8 0 0 1 16 0v12" />
  <path d="M32 34V20a6 6 0 0 1 12 0v14" />
  <path d="M16 34h28v10a10 10 0 0 1-10 10H26a10 10 0 0 1-10-10z" />
  <path d="M16 38c-6 2-8 8-4 12" opacity=".6" />
`);

const TAYUN = art(`
  <path d="M22 10h16v10l6 12v18a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6V32l6-12z" />
  <path d="M16 40h32" />
  <path d="M26 22h12" opacity=".6" />
  <path d="M8 30c4-3 8-3 12 0M44 30c4-3 8-3 12 0" opacity=".5" />
`);

const JUQI = art(`
  <circle cx="32" cy="34" r="18" />
  <circle cx="32" cy="34" r="10" opacity=".6" />
  <circle cx="32" cy="34" r="4" ${F} />
  <path d="M32 8v6M32 54v6M6 34h6M52 34h6" opacity=".55" />
`);

const HUXIN = art(`
  <circle cx="32" cy="32" r="20" />
  <circle cx="32" cy="32" r="12" opacity=".7" />
  <path d="M32 20v24M20 32h24" opacity=".45" />
  <path d="M32 12l3 5h-6z" ${F} opacity=".8" />
`);

// ─────────────────────────────────────────────
// 行動
// ─────────────────────────────────────────────

const NING = art(`
  <path d="M6 32c8-12 18-18 26-18s18 6 26 18c-8 12-18 18-26 18S14 44 6 32z" />
  <circle cx="32" cy="32" r="7" />
  <circle cx="32" cy="32" r="2.5" ${F} />
  <path d="M32 6v4M32 54v4" opacity=".5" />
`);

const TUNA = art(`
  <path d="M22 14a20 20 0 1 0 20 0" />
  <path d="M22 14l-6 6M22 14l6 6" />
  <path d="M32 52c-6 0-10-4-10-9s4-9 10-9 10 4 10 9-4 9-10 9z" opacity=".5" />
`);

const XUNXI = art(`
  <circle cx="28" cy="28" r="16" />
  <path d="M40 40l16 16" stroke-width="4" />
  <path d="M22 24h12M22 32h8" opacity=".6" />
`);

const SHIYI = art(`
  <path d="M20 30V16a5 5 0 0 1 10 0v12" />
  <path d="M30 28V14a5 5 0 0 1 10 0v14" />
  <path d="M40 30v-8a5 5 0 0 1 10 0v18a16 16 0 0 1-16 16h-6a14 14 0 0 1-14-14v-8a5 5 0 0 1 10 0" />
`);

const SANSHOU = art(`
  <path d="M14 8h14v20H14z" />
  <path d="M36 8h14v20H36z" opacity=".7" />
  <path d="M14 36h14v20H14z" opacity=".7" />
  <path d="M36 36h14v20H36z" opacity=".45" />
  <path d="M6 32h52" opacity=".3" stroke-dasharray="3 4" />
`);

// ─────────────────────────────────────────────
// 事件
// ─────────────────────────────────────────────

const QISHI = art(`
  <path d="M18 56c0-14 6-22 14-30" stroke-width="4" />
  <path d="M32 26c0-8 6-14 14-16-2 10-6 16-14 16z" ${F} opacity=".8" />
  <path d="M32 40c0-8 6-14 14-16-2 10-6 16-14 16z" ${F} opacity=".6" />
  <path d="M12 56h20M10 46c4-2 8-2 12 0" opacity=".5" />
`);

const TIEBI = art(`
  <path d="M32 8l20 8v18c0 12-9 20-20 24-11-4-20-12-20-24V16z" />
  <path d="M32 16v26" opacity=".5" />
  <path d="M22 30h20" opacity=".5" />
`);

const POJUN = art(`
  <path d="M32 6l7 16 17 2-13 12 4 17-15-9-15 9 4-17-13-12 17-2z" opacity=".85" />
  <path d="M32 18l-4 10 6 4-3 9" stroke-width="2" />
  <path d="M6 58h52" opacity=".4" />
`);

// ─────────────────────────────────────────────
// 任務
// ─────────────────────────────────────────────

const Q_SHISHI = art(`
  <circle cx="32" cy="32" r="22" />
  <circle cx="32" cy="32" r="13" opacity=".7" />
  <circle cx="32" cy="32" r="4" ${F} />
  <path d="M44 20l-8 8" opacity=".5" />
`);

const Q_LIANJI = art(`
  <rect x="8" y="24" width="18" height="16" rx="4" />
  <rect x="38" y="24" width="18" height="16" rx="4" />
  <path d="M26 32h12" stroke-width="4" />
  <path d="M32 30v4" opacity=".6" />
  <path d="M17 20v-8M47 20v-8" opacity=".5" />
`);

const Q_XUSHI = art(`
  <path d="M14 6v52" stroke-width="3" />
  <path d="M14 14c14-8 22 8 36 0v20c-14 8-22-8-36 0z" opacity=".85" />
  <path d="M52 34l8 6-8 6" opacity=".6" />
`);

const Q_NUQI = art(`
  <path d="M32 58V30" stroke-width="4" />
  <path d="M22 30c0-10 4-16 10-24 6 8 10 14 10 24a10 10 0 0 1-20 0z" ${F} opacity=".75" />
  <path d="M12 48c4-4 8-4 12 0M40 48c4-4 8-4 12 0" opacity=".5" />
`);

const Q_DACHENG = art(`
  <path d="M6 54l18-26 12 14 22-30" />
  <path d="M50 12h8v8" />
  <circle cx="50" cy="12" r="4" ${F} />
  <path d="M4 58h56" opacity=".5" />
`);

// ─────────────────────────────────────────────
// 對外
// ─────────────────────────────────────────────

const ART_BY_ID: Record<string, string> = {
  // 招式
  trick_beng: BENG,
  trick_chan: CHAN,
  trick_ta: TA,
  trick_cun: CUN,
  secret_lie: LIE,
  secret_hui: HUI,
  secret_suo: SUO,
  ult_guan: GUAN,
  ult_fen: FEN,
  hidden_tian: TIAN,
  hidden_wu: WU,

  // 裝備
  eq_duanyue: DUANYUE,
  eq_chanqi: CHANQI,
  eq_jingxin: JINGXIN,
  eq_xuantie: XUANTIE,
  eq_hukou: HUKOU,
  eq_tayun: TAYUN,
  eq_juqi: JUQI,
  eq_huxin: HUXIN,

  // 行動
  act_ning: NING,
  act_tuna: TUNA,
  act_xunxi: XUNXI,
  act_shiyi: SHIYI,
  act_sanshou: SANSHOU,

  // 事件
  ev_qishi: QISHI,
  ev_tiebi: TIEBI,
  ev_pojun: POJUN,

  // 任務
  q_shishi: Q_SHISHI,
  q_lianji: Q_LIANJI,
  q_xushi: Q_XUSHI,
  q_nuqi: Q_NUQI,
  q_dacheng: Q_DACHENG,
};

/** 未知卡片的備援圖騰：一個簡單的圓形氣紋 */
const FALLBACK = art(`
  <circle cx="32" cy="32" r="22" stroke-dasharray="4 6" />
  <circle cx="32" cy="32" r="8" />
  <circle cx="32" cy="32" r="2.5" ${F} />
`);

export function cardArt(defId: string): string {
  return ART_BY_ID[defId] ?? FALLBACK;
}

/** 卡片背面的圖騰（對手的牌組與手牌用） */
export const CARD_BACK = art(`
  <circle cx="32" cy="32" r="20" />
  <circle cx="32" cy="32" r="13" stroke-dasharray="3 5" opacity=".8" />
  <path d="M32 16c6 6 10 10 10 16a10 10 0 0 1-20 0c0-6 4-10 10-16z" ${F} opacity=".8" />
`);
