/**
 * 手牌排版計算。
 *
 * 抽成純函式的原因：這段邏輯要讀 DOM 寬度，而 jsdom 的 clientWidth 永遠是 0，
 * 沒辦法在測試裡驗證。把「數學」獨立出來後，就能用各種螢幕寬度、手牌張數直接測。
 */

/** 卡牌 md 尺寸的寬度（px），量不到實際值時的後備 */
export const DEFAULT_CARD_WIDTH = 104;

/** 寬度充裕時，卡牌之間保留的間隔 */
export const IDEAL_GAP = 6;

/** 重疊上限：最多讓後一張蓋住前一張的這個比例 */
const MAX_OVERLAP_RATIO = 0.6;

/**
 * 計算手牌之間的間距。
 *
 *   回傳正值 → 正常間隔（寬度夠）
 *   回傳負值 → 互相重疊（寬度不足，負得越多疊得越兇）
 *
 * 重疊有上限（卡寬的 60%），避免牌一多就被壓成一條線。
 */
export function computeHandSpacing(
  cardCount: number,
  cardWidth: number,
  containerWidth: number,
  idealGap: number = IDEAL_GAP,
): number {
  if (cardCount <= 1) return 0;
  if (cardWidth <= 0 || containerWidth <= 0) return idealGap;

  const needed = cardCount * cardWidth + (cardCount - 1) * idealGap;
  if (needed <= containerWidth) return idealGap;

  // 空間不足：算出每張卡實際分得到的寬度，與卡寬的差額就是負 margin
  const perCard = (containerWidth - cardWidth) / (cardCount - 1);
  const raw = perCard - cardWidth;
  const minSpacing = -cardWidth * MAX_OVERLAP_RATIO;

  // 已經撞到重疊上限時，用 ceil 往「不那麼負」的方向取整，
  // 否則 floor 會把值推到上限之外（-62.4 → -63）。
  if (raw <= minSpacing) return Math.ceil(minSpacing);

  // 還沒撞到上限時，用 floor 確保整排寬度不會超出容器
  return Math.floor(raw);
}

/** 依間距回傳整排手牌實際佔用的寬度（給需要判斷是否溢出的地方用） */
export function handRowWidth(cardCount: number, cardWidth: number, spacing: number): number {
  if (cardCount <= 0) return 0;
  return cardCount * cardWidth + (cardCount - 1) * spacing;
}
