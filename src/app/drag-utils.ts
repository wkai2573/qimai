/**
 * 拖曳手勢的判定邏輯。
 *
 * 抽成純函式的原因跟手牌排版一樣：這些計算要看 DOM 幾何，jsdom 量不到，
 * 但「門檻比較」與「範圍判定」本身是純數學，獨立出來就能測邊界值。
 */

/** 指標位移超過這個距離才算「拖曳」，否則視為單純點擊 */
export const DRAG_THRESHOLD = 6;

/** 放置判定的外擴範圍，讓玩家不必精準命中目標 */
export const DROP_PADDING = 28;

export interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * 從起點移動到 (x, y) 是否已構成拖曳。
 * 用「大於」而非「大於等於」——剛好壓在門檻上通常只是手指抖動。
 */
export function isDragGesture(
  startX: number,
  startY: number,
  x: number,
  y: number,
  threshold: number = DRAG_THRESHOLD,
): boolean {
  return Math.hypot(x - startX, y - startY) > threshold;
}

/** 指標是否落在放置區內。pad 讓判定範圍略大於實際元素，拖放手感較好 */
export function isInsideDropZone(
  x: number,
  y: number,
  rect: RectLike,
  padding: number = DROP_PADDING,
): boolean {
  return (
    x >= rect.left - padding &&
    x <= rect.right + padding &&
    y >= rect.top - padding &&
    y <= rect.bottom + padding
  );
}
