/**
 * 《氣脈》— 卡圖圖騰
 *
 * 每張卡對應一組手繪的 inline SVG 圖騰，不依賴任何外部圖片檔。
 * 好處：離線可跑、體積為零、顏色可繼承卡種色調（用 currentColor）。
 *
 * 涵蓋狂怒、秘法、氣功三大職業專屬卡牌與通用任務卡牌。
 */

function art(inner: string): string {
  return (
    '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
    inner +
    '</svg>'
  );
}

const F = 'fill="currentColor" stroke="none"';

// ─────────────────────────────────────────────
// 【狂怒】卡圖
// ─────────────────────────────────────────────

const RG_XIEFEN = art(`
  <path d="M12 48l16-16M28 48L12 32" />
  <circle cx="44" cy="24" r="12" />
  <path d="M44 16v16M36 24h16" />
  <path d="M38 42l8 8M48 38l6 6" />
`);

const RG_RENQI = art(`
  <circle cx="32" cy="32" r="18" />
  <path d="M22 36h20M24 26h4M36 26h4" />
  <path d="M26 42h12" opacity=".6" />
  <path d="M14 14l6 6M50 14l-6 6" />
`);

const RG_TIAOXIN = art(`
  <path d="M20 44V24a6 6 0 0 1 12 0v20" />
  <path d="M32 30a6 6 0 0 1 12 0v14" />
  <path d="M14 36v8a8 8 0 0 0 16 0" />
  <path d="M44 32v12" />
  <circle cx="46" cy="18" r="3" ${F} />
`);

const RG_WEIDAI = art(`
  <circle cx="32" cy="32" r="20" stroke-dasharray="3 4" />
  <circle cx="24" cy="28" r="3" ${F} />
  <circle cx="40" cy="28" r="3" ${F} />
  <path d="M20 40c4-4 20-4 24 0" />
  <path d="M18 18l8 5M46 18l-8 5" />
`);

const RG_PAOHUA = art(`
  <path d="M14 26h10l16-12v36L24 38H14z" />
  <path d="M46 22a12 12 0 0 1 0 20M52 16a20 20 0 0 1 0 32" />
`);

const RG_XUEQI = art(`
  <path d="M32 10C24 22 18 30 18 38a14 14 0 0 0 28 0c0-8-6-16-14-28z" />
  <path d="M32 46V24M26 32l6-8 6 8" />
`);

const RG_TIZUILIANG = art(`
  <path d="M16 20h32l-6 32H22z" />
  <circle cx="26" cy="32" r="3" ${F} />
  <circle cx="38" cy="32" r="3" ${F} />
  <path d="M28 42h8" />
  <path d="M12 14l8 6M52 14l-8 6" />
`);

const RG_SHENSHENXIAN = art(`
  <path d="M10 32h10l4-12 8 24 6-16 4 8h12" />
  <circle cx="32" cy="20" r="3" ${F} />
  <circle cx="38" cy="44" r="2.5" ${F} />
`);

const RG_EQ_JUFU = art(`
  <path d="M18 12c12 4 18 18 18 18s-6 14-18 18V12z" />
  <path d="M32 10v44" stroke-width="3.5" />
  <path d="M46 20c-8 3-12 10-12 10s4 7 12 10V20z" opacity=".7" />
`);

const RG_EQ_SHIXUE = art(`
  <path d="M18 50L44 14l4 4-26 36z" />
  <path d="M38 14l8 8M24 38l6-6M30 32l6-6" />
  <circle cx="20" cy="48" r="3" ${F} />
`);

const RG_EQ_MIANJU = art(`
  <path d="M14 26c0-8 8-14 18-14s18 6 18 14v16l-8 8-10-4-10 4-8-8z" />
  <path d="M20 28l6 3M44 28l-6 3M24 40h16" />
  <path d="M12 16l8 8M52 16l-8 8" />
`);

const RG_EQ_KUANGGU = art(`
  <path d="M20 18h24v30H20z" rx="4" />
  <path d="M24 14v6M32 12v8M40 14v6" />
  <path d="M20 34h24M20 40h24" opacity=".6" />
`);

const RG_EQ_XUEBU = art(`
  <path d="M24 12v24l-8 12h32l2-10-10-4V12z" />
  <path d="M24 24h16M24 32h14" opacity=".6" />
`);

const RG_EQ_XUEJIE = art(`
  <circle cx="32" cy="36" r="14" />
  <path d="M24 24l8-12 8 12z" />
  <circle cx="32" cy="36" r="6" stroke-dasharray="3 3" />
`);

const RG_TECH_NUCE = art(`
  <path d="M18 14l8 36M30 10l4 44M42 12l-2 42M52 18l-8 32" />
`);

const RG_TECH_BENGXUE = art(`
  <circle cx="32" cy="32" r="15" />
  <path d="M32 10v6M32 48v6M10 32h6M48 32h6" />
  <path d="M24 28h16v10H24z" ${F} />
`);

const RG_TECH_KUANGNI = art(`
  <path d="M12 46l20-28 20 28" />
  <path d="M20 46l12-16 12 16" opacity=".6" />
  <path d="M32 10v8M18 20l6 6M46 20l-6 6" />
`);

const RG_TECH_LIEPO = art(`
  <path d="M20 14h24v36H20z" />
  <path d="M14 32l36-12M14 40l36-12" />
  <circle cx="32" cy="32" r="4" ${F} />
`);

const RG_TECH_NUBAOFA = art(`
  <path d="M32 8l5 14h15l-12 9 5 15-13-10-13 10 5-15-12-9h15z" />
  <circle cx="32" cy="32" r="6" ${F} />
`);

const RG_TECH_XIUMIE = art(`
  <path d="M14 14l36 36M50 14L14 50" stroke-width="3" />
  <circle cx="32" cy="32" r="12" stroke-dasharray="4 4" />
`);

const RG_TECH_BAJUAN = art(`
  <circle cx="32" cy="32" r="22" stroke-width="3" />
  <path d="M24 24h16v16H24z" />
  <path d="M16 16l32 32M48 16L16 48" opacity=".5" />
`);

const RG_TECH_NUHAI = art(`
  <path d="M10 44c8-10 14-10 22 0s14 10 22 0" stroke-width="3" />
  <path d="M10 32c8-10 14-10 22 0s14 10 22 0" stroke-width="3" />
  <path d="M10 20c8-10 14-10 22 0s14 10 22 0" stroke-width="3" />
`);

// ─────────────────────────────────────────────
// 【秘法】卡圖
// ─────────────────────────────────────────────

const MG_JULING = art(`
  <circle cx="32" cy="32" r="18" stroke-dasharray="4 4" />
  <circle cx="32" cy="32" r="8" />
  <circle cx="32" cy="32" r="3" ${F} />
  <path d="M32 6v6M32 52v6M6 32h6M52 32h6" />
`);

const MG_TANXUN = art(`
  <path d="M10 32s10-14 22-14 22 14 22 14-10 14-22 14-22-14-22-14z" />
  <circle cx="32" cy="32" r="7" />
  <circle cx="32" cy="32" r="3" ${F} />
`);

const MG_GUOZAI = art(`
  <circle cx="32" cy="32" r="14" />
  <path d="M32 10l4 12 12-4-4 12 12 4-12 4 4 12-12-4-4 12-4-12-12 4 4-12-12-4 12-4-4-12 12 4z" opacity=".7" />
`);

const MG_HUANXING = art(`
  <polygon points="32 12, 50 48, 14 48" />
  <circle cx="32" cy="32" r="5" ${F} />
  <path d="M32 4v8M10 52l6-4M54 52l-6-4" />
`);

const MG_HUIYONG = art(`
  <path d="M32 52c-12 0-20-8-20-20S24 12 32 12s16 6 18 16" />
  <path d="M54 22l-4 6-6-4" />
  <circle cx="32" cy="32" r="6" ${F} />
`);

const MG_HUDUN = art(`
  <polygon points="32 10, 52 20, 52 44, 32 54, 12 44, 12 20" />
  <polygon points="32 18, 44 24, 44 40, 32 46, 20 40, 20 24" opacity=".6" />
`);

const MG_GONGMING = art(`
  <circle cx="24" cy="32" r="14" />
  <circle cx="40" cy="32" r="14" />
  <circle cx="32" cy="32" r="4" ${F} />
`);

const MG_EQ_FAZHANG = art(`
  <path d="M20 54L44 18" stroke-width="3" />
  <circle cx="46" cy="16" r="6" />
  <circle cx="46" cy="16" r="2.5" ${F} />
  <path d="M40 10l12 12" />
`);

const MG_EQ_MIEZHANG = art(`
  <path d="M16 48L48 16" stroke-width="3.5" />
  <polygon points="48 8, 56 16, 48 24, 40 16" ${F} />
  <polygon points="16 40, 24 48, 16 56, 8 48" ${F} />
`);

const MG_EQ_FAPAO = art(`
  <path d="M20 14h24l6 14-8 4-4 22H26L22 32l-8-4z" />
  <circle cx="32" cy="22" r="3" ${F} />
`);

const MG_EQ_BAOZHU = art(`
  <circle cx="32" cy="30" r="12" />
  <circle cx="32" cy="30" r="5" ${F} />
  <path d="M20 48h24M24 54h16M28 42v6M36 42v6" />
`);

const MG_EQ_FAXUE = art(`
  <path d="M22 14v22l-6 12h32l2-8-12-6V14z" />
  <path d="M12 26l8 4-4 8M10 20l12 6" opacity=".7" />
`);

const MG_EQ_HUFU = art(`
  <rect x="20" y="16" width="24" height="34" rx="4" />
  <path d="M32 10v6M28 26l4-4 4 4v14l-4 4-4-4z" />
  <circle cx="32" cy="33" r="2.5" ${F} />
`);

const MG_TECH_FEIDAN = art(`
  <path d="M14 22c8-2 16 0 24 8M20 42c8-2 16 0 24-8M10 32c12-3 24 0 34 10" stroke-width="3" />
  <circle cx="48" cy="22" r="3" ${F} />
  <circle cx="48" cy="42" r="3" ${F} />
`);

const MG_TECH_BINGZHI = art(`
  <path d="M32 10L42 32l-10 22-10-22z" />
  <path d="M10 32l22-10 22 10-22 10z" opacity=".6" />
  <circle cx="32" cy="32" r="3" ${F} />
`);

const MG_TECH_SHANDIAN = art(`
  <polygon points="34 8, 18 32, 32 32, 26 56, 48 26, 34 26" />
`);

const MG_TECH_HUOQIU = art(`
  <circle cx="32" cy="34" r="12" />
  <path d="M32 10c-6 8-12 14-12 24a12 12 0 0 0 24 0c0-10-6-16-12-24z" opacity=".7" />
  <circle cx="32" cy="36" r="5" ${F} />
`);

const MG_TECH_YUNSHI = art(`
  <circle cx="42" cy="22" r="10" ${F} />
  <path d="M42 22L14 50M36 16L10 42M48 28L22 54" stroke-width="3" />
`);

const MG_TECH_JIGUANG = art(`
  <rect x="6" y="26" width="52" height="12" rx="6" />
  <path d="M6 32h52" stroke-width="4" stroke="white" />
  <circle cx="16" cy="32" r="8" opacity=".5" />
  <circle cx="48" cy="32" r="8" opacity=".5" />
`);

const MG_TECH_XINGYUN = art(`
  <ellipse cx="32" cy="32" rx="22" ry="10" transform="rotate(-30 32 32)" />
  <circle cx="32" cy="32" r="6" ${F} />
  <circle cx="16" cy="20" r="3" ${F} />
  <circle cx="48" cy="44" r="3" ${F} />
`);

const MG_TECH_YANMIE = art(`
  <circle cx="32" cy="32" r="22" />
  <circle cx="32" cy="32" r="14" stroke-dasharray="3 3" />
  <circle cx="32" cy="32" r="7" ${F} />
  <path d="M12 12l8 8M52 12l-8 8M12 52l8-8M52 52l-8-8" />
`);

// ─────────────────────────────────────────────
// 【氣功】卡圖
// ─────────────────────────────────────────────

const QG_TIAOXI = art(`
  <circle cx="32" cy="32" r="18" />
  <path d="M32 14a9 9 0 0 0 0 18 9 9 0 0 1 0 18" stroke-width="2.5" />
  <circle cx="32" cy="23" r="2.5" ${F} />
  <circle cx="32" cy="41" r="2.5" fill="none" stroke="currentColor" stroke-width="2" />
`);

const QG_JINZHONG = art(`
  <path d="M32 10a4 4 0 0 1 4 4v2c10 2 16 10 16 22v6l4 4H8l4-4v-6c0-12 6-20 16-22v-2a4 4 0 0 1 4-4z" />
  <path d="M22 36h20M20 44h24" opacity=".6" />
`);

const QG_CHANGHONG = art(`
  <path d="M10 46C18 20 46 20 54 46" stroke-width="3" />
  <path d="M16 46C22 28 42 28 48 46" stroke-width="2" opacity=".6" />
  <circle cx="32" cy="18" r="4" ${F} />
`);

const QG_TONGMAI = art(`
  <path d="M32 10v44" stroke-width="3" />
  <circle cx="32" cy="18" r="3" ${F} />
  <circle cx="32" cy="28" r="4" ${F} />
  <circle cx="32" cy="38" r="3" ${F} />
  <path d="M20 28h24M24 18h16M24 38h16" opacity=".6" />
`);

const QG_HUAJIN = art(`
  <circle cx="32" cy="32" r="18" stroke-dasharray="6 4" />
  <path d="M24 24c6-4 14 0 16 8s-4 12-12 12" />
  <path d="M24 40l4 4 4-4" />
`);

const QG_TAIJI = art(`
  <circle cx="32" cy="32" r="20" />
  <path d="M32 12a10 10 0 0 0 0 20 10 10 0 0 1 0 20" stroke-width="2.5" />
  <circle cx="32" cy="22" r="3" ${F} />
  <circle cx="32" cy="42" r="3" />
`);

const QG_SHOUYI = art(`
  <circle cx="32" cy="32" r="16" />
  <circle cx="32" cy="32" r="6" ${F} />
  <path d="M32 8v8M32 48v8M8 32h8M48 32h8" opacity=".6" />
`);

const QG_EQ_XUANPAO = art(`
  <path d="M22 14h20l8 12-6 6-4-4v22H24V28l-4 4-6-6z" />
  <circle cx="32" cy="24" r="3" ${F} />
`);

const QG_EQ_LINGPEI = art(`
  <circle cx="32" cy="28" r="12" />
  <circle cx="32" cy="28" r="4" ${F} />
  <path d="M32 10v6M32 40v14M26 48h12" />
`);

const QG_EQ_ZHITAO = art(`
  <rect x="22" y="16" width="20" height="34" rx="6" />
  <path d="M26 26h12M26 34h12" opacity=".6" />
  <circle cx="32" cy="20" r="2.5" ${F} />
`);

const QG_EQ_DAOLU = art(`
  <path d="M20 14v22l-6 12h34l2-8-12-6V14z" />
  <path d="M24 38c4-4 10-4 14 0" opacity=".6" />
`);

const QG_EQ_YINYANG = art(`
  <circle cx="32" cy="32" r="16" stroke-width="3" />
  <path d="M32 16a8 8 0 0 0 0 16 8 8 0 0 1 0 16" />
  <circle cx="32" cy="24" r="2" ${F} />
`);

const QG_EQ_FUCHEN = art(`
  <path d="M20 52l12-16" stroke-width="3" />
  <path d="M32 36c4-12 16-18 22-22-2 10-6 18-14 24" />
  <path d="M32 36c10-6 18-6 24-2-8 8-14 10-22 6" opacity=".7" />
`);

const QG_TECH_TUISHOU = art(`
  <path d="M18 36c4-8 12-12 20-8s10 14 4 20" />
  <path d="M46 28c-4 8-12 12-20 8s-10-14-4-20" opacity=".7" />
  <circle cx="32" cy="32" r="3" ${F} />
`);

const QG_TECH_CHUANYUN = art(`
  <path d="M14 46C24 34 32 14 32 14s8 20 18 32" stroke-width="3" />
  <path d="M22 36h20M26 44h12" opacity=".6" />
`);

const QG_TECH_BENGSHAN = art(`
  <polygon points="32 14, 48 48, 16 48" stroke-width="2.5" />
  <path d="M32 24l-4 8 8 6-4 10" stroke-width="2" />
`);

const QG_TECH_QIXUAN = art(`
  <path d="M32 14c10 0 18 8 18 18s-8 18-18 18-18-8-18-18" />
  <path d="M32 20c6 0 12 6 12 12s-6 12-12 12-12-6-12-12" opacity=".6" />
  <circle cx="32" cy="32" r="3" ${F} />
`);

const QG_TECH_HUNYUAN = art(`
  <circle cx="32" cy="32" r="18" />
  <circle cx="32" cy="32" r="10" stroke-dasharray="4 4" />
  <circle cx="32" cy="32" r="4" ${F} />
`);

const QG_TECH_ZHENTIAN = art(`
  <circle cx="32" cy="32" r="22" stroke-dasharray="5 5" />
  <circle cx="32" cy="32" r="14" />
  <path d="M14 32h36M32 14v36" />
`);

const QG_TECH_JIUXIAO = art(`
  <path d="M16 50V22l8-8 8 8v28M32 50V14l8-6 8 6v36" stroke-width="2.5" />
  <circle cx="24" cy="18" r="2" ${F} />
  <circle cx="40" cy="12" r="2" ${F} />
`);

const QG_TECH_JINGANG = art(`
  <circle cx="32" cy="32" r="22" stroke-width="3" />
  <polygon points="32 16, 46 44, 18 44" />
  <circle cx="32" cy="32" r="5" ${F} />
`);

// ─────────────────────────────────────────────
// 【共通】任務卡圖
// ─────────────────────────────────────────────

const Q_FIRST = art(`
  <circle cx="32" cy="32" r="18" stroke-dasharray="3 4" />
  <polygon points="32 18, 42 40, 22 40" ${F} />
`);

const Q_COMBO = art(`
  <polygon points="32 10, 38 24, 52 24, 40 34, 44 48, 32 38, 20 48, 24 34, 12 24, 26 24" />
  <circle cx="32" cy="30" r="3" ${F} />
`);

const Q_READY = art(`
  <path d="M16 48c0-18 16-32 32-32" stroke-width="3" />
  <path d="M22 48c0-12 12-24 24-24" opacity=".6" />
  <circle cx="44" cy="20" r="4" ${F} />
`);

const Q_SURGE = art(`
  <path d="M12 40c6-8 12-8 18 0s12 8 18 0" stroke-width="3" />
  <path d="M12 26c6-8 12-8 18 0s12 8 18 0" stroke-width="3" />
  <circle cx="46" cy="18" r="3" ${F} />
`);

const Q_MASTER = art(`
  <polygon points="14 44, 20 20, 32 34, 44 20, 50 44" stroke-width="2.5" />
  <circle cx="20" cy="18" r="2.5" ${F} />
  <circle cx="32" cy="30" r="2.5" ${F} />
  <circle cx="44" cy="18" r="2.5" ${F} />
`);

// ─────────────────────────────────────────────
// 卡圖字典
// ─────────────────────────────────────────────

export const ART_BY_ID: Record<string, string> = {
  // 狂怒
  rg_xiefen: RG_XIEFEN,
  rg_renqi: RG_RENQI,
  rg_tiaoxin: RG_TIAOXIN,
  rg_weidai: RG_WEIDAI,
  rg_paohua: RG_PAOHUA,
  rg_xueqi: RG_XUEQI,
  rg_tizuiliang: RG_TIZUILIANG,
  rg_shenshenxian: RG_SHENSHENXIAN,
  rg_eq_jufu: RG_EQ_JUFU,
  rg_eq_shixue: RG_EQ_SHIXUE,
  rg_eq_mianju: RG_EQ_MIANJU,
  rg_eq_kuanggu: RG_EQ_KUANGGU,
  rg_eq_xuebu: RG_EQ_XUEBU,
  rg_eq_xuejie: RG_EQ_XUEJIE,
  rg_tech_nuce: RG_TECH_NUCE,
  rg_tech_bengxue: RG_TECH_BENGXUE,
  rg_tech_kuangni: RG_TECH_KUANGNI,
  rg_tech_liepo: RG_TECH_LIEPO,
  rg_tech_nubaofa: RG_TECH_NUBAOFA,
  rg_tech_xiumie: RG_TECH_XIUMIE,
  rg_tech_bajuan: RG_TECH_BAJUAN,
  rg_tech_nuhai: RG_TECH_NUHAI,

  // 秘法
  mg_juling: MG_JULING,
  mg_tanxun: MG_TANXUN,
  mg_guozai: MG_GUOZAI,
  mg_huanxing: MG_HUANXING,
  mg_huiyong: MG_HUIYONG,
  mg_hudun: MG_HUDUN,
  mg_gongming: MG_GONGMING,
  mg_eq_fazhang: MG_EQ_FAZHANG,
  mg_eq_miezhang: MG_EQ_MIEZHANG,
  mg_eq_fapao: MG_EQ_FAPAO,
  mg_eq_baozhu: MG_EQ_BAOZHU,
  mg_eq_faxue: MG_EQ_FAXUE,
  mg_eq_hufu: MG_EQ_HUFU,
  mg_tech_feidan: MG_TECH_FEIDAN,
  mg_tech_bingzhi: MG_TECH_BINGZHI,
  mg_tech_shandian: MG_TECH_SHANDIAN,
  mg_tech_huoqiu: MG_TECH_HUOQIU,
  mg_tech_yunshi: MG_TECH_YUNSHI,
  mg_tech_jiguang: MG_TECH_JIGUANG,
  mg_tech_xingyun: MG_TECH_XINGYUN,
  mg_tech_yanmie: MG_TECH_YANMIE,

  // 氣功
  qg_tiaoxi: QG_TIAOXI,
  qg_jinzhong: QG_JINZHONG,
  qg_changhong: QG_CHANGHONG,
  qg_tongmai: QG_TONGMAI,
  qg_huajin: QG_HUAJIN,
  qg_taiji: QG_TAIJI,
  qg_shouyi: QG_SHOUYI,
  qg_eq_xuanpao: QG_EQ_XUANPAO,
  qg_eq_lingpei: QG_EQ_LINGPEI,
  qg_eq_zhitao: QG_EQ_ZHITAO,
  qg_eq_daolu: QG_EQ_DAOLU,
  qg_eq_yinyang: QG_EQ_YINYANG,
  qg_eq_fuchen: QG_EQ_FUCHEN,
  qg_tech_tuishou: QG_TECH_TUISHOU,
  qg_tech_chuanyun: QG_TECH_CHUANYUN,
  qg_tech_bengshan: QG_TECH_BENGSHAN,
  qg_tech_qixuan: QG_TECH_QIXUAN,
  qg_tech_hunyuan: QG_TECH_HUNYUAN,
  qg_tech_zhentian: QG_TECH_ZHENTIAN,
  qg_tech_jiuxiao: QG_TECH_JIUXIAO,
  qg_tech_jingang: QG_TECH_JINGANG,

  // 任務
  qst_first: Q_FIRST,
  qst_combo: Q_COMBO,
  qst_ready: Q_READY,
  qst_surge: Q_SURGE,
  qst_master: Q_MASTER,
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
