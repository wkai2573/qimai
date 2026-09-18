import { describe, expect, it } from 'vitest';

import { DRAG_THRESHOLD, isDragGesture, isInsideDropZone } from './drag-utils';

describe('拖曳手勢判定', () => {
  it('完全沒移動不算拖曳', () => {
    expect(isDragGesture(100, 100, 100, 100)).toBe(false);
  });

  it('手指抖動的微小位移仍視為點擊', () => {
    // 位移 3px、4px → 距離 5px，在門檻內
    expect(isDragGesture(100, 100, 103, 104)).toBe(false);
  });

  it('剛好等於門檻不算拖曳（避免誤判）', () => {
    expect(isDragGesture(0, 0, DRAG_THRESHOLD, 0)).toBe(false);
  });

  it('些微超過門檻就算拖曳', () => {
    expect(isDragGesture(0, 0, DRAG_THRESHOLD + 0.5, 0)).toBe(true);
  });

  it('斜向移動以實際距離判斷，不是只看單軸', () => {
    // 各軸只移動 5px 都小於門檻，但直線距離 7.07px 已超過
    expect(isDragGesture(0, 0, 5, 5)).toBe(true);
  });

  it('往反方向拖曳同樣成立', () => {
    expect(isDragGesture(100, 100, 80, 100)).toBe(true);
  });

  it('可以自訂門檻', () => {
    expect(isDragGesture(0, 0, 10, 0, 20)).toBe(false);
    expect(isDragGesture(0, 0, 10, 0, 5)).toBe(true);
  });
});

describe('放置區判定', () => {
  const rect = { left: 100, right: 300, top: 200, bottom: 260 };

  it('正中央算在區內', () => {
    expect(isInsideDropZone(200, 230, rect)).toBe(true);
  });

  it('四邊外擴範圍內仍算命中', () => {
    expect(isInsideDropZone(95, 230, rect)).toBe(true); // 左邊外 5px
    expect(isInsideDropZone(305, 230, rect)).toBe(true); // 右邊外 5px
    expect(isInsideDropZone(200, 190, rect)).toBe(true); // 上方外 10px
    expect(isInsideDropZone(200, 280, rect)).toBe(true); // 下方外 20px
  });

  it('超出外擴範圍就不算命中', () => {
    expect(isInsideDropZone(200, 100, rect)).toBe(false); // 上方太遠
    expect(isInsideDropZone(500, 230, rect)).toBe(false); // 右方太遠
    expect(isInsideDropZone(50, 230, rect)).toBe(false); // 左方太遠
  });

  it('剛好在外擴邊界上算命中', () => {
    expect(isInsideDropZone(72, 230, rect)).toBe(true); // left - 28
    expect(isInsideDropZone(71, 230, rect)).toBe(false);
  });

  it('可以自訂外擴範圍', () => {
    expect(isInsideDropZone(95, 230, rect, 0)).toBe(false);
    expect(isInsideDropZone(95, 230, rect, 10)).toBe(true);
  });
});
