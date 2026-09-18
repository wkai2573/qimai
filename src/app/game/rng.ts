/**
 * 可重現的偽隨機數產生器（mulberry32）。
 *
 * 為什麼不用 Math.random()：
 *   1. 同一組 seed + 同一串操作 → 完全相同的對局，可重播、可除錯
 *   2. 單元測試能寫死 seed，結果穩定，不會隨機失敗
 *   3. 日後做連線對戰時，伺服器只要把 seed 發給雙方，兩邊洗牌結果一致，
 *      不需要傳送整副牌組的順序（防作弊的基礎）
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // 確保是 32 位元無號整數，且避開 0
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** 回傳 [0, 1) 的浮點數 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 回傳 [0, maxExclusive) 的整數 */
  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  /** 回傳 [min, max] 的整數（含兩端） */
  range(min: number, max: number): number {
    if (max <= min) return min;
    return min + this.int(max - min + 1);
  }

  /** Fisher–Yates 洗牌。回傳新陣列，不修改來源 */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /** 隨機取一個元素，空陣列回傳 undefined */
  pick<T>(items: readonly T[]): T | undefined {
    return items.length === 0 ? undefined : items[this.int(items.length)];
  }

  /** 目前內部狀態，可用於存檔或快照 */
  snapshot(): number {
    return this.state;
  }
}

/**
 * 由字串產生穩定的 seed（例如玩家輸入的對局代碼）。
 * 使用 FNV-1a 雜湊，同樣的字串永遠得到同樣的數字。
 */
export function seedFromString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
