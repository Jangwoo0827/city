import { GRID_SIZE, LEGACY_OFFSET } from '../utils/constants';
import { Grid, T } from './grid';

/**
 * 기본 맵 지형 (결정적 생성).
 * 예전 64×64 맵의 지형은 중앙(LEGACY_OFFSET)에 그대로 유지해 옛 저장과 호환되고,
 * 바깥에는 새 호수·강·연못을 추가한다.
 */
export function generateTerrain(g: Grid): void {
  g.terrain.fill(T.LAND);
  const O = LEGACY_OFFSET;
  const set = (x: number, y: number): void => {
    if (g.inBounds(x, y)) g.terrain[g.idx(x, y)] = T.WATER;
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number): void => {
    for (let y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx) - 1; x <= cx + rx + 1; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) set(x, y);
      }
    }
  };
  /** 위에서 아래로 사행하는 강 (폭 = 2*half+1) */
  const river = (cx: number, amp: number, period: number, half: number, y0 = 0, y1 = GRID_SIZE - 1, phase0 = 0): void => {
    for (let y = y0; y <= y1; y++) {
      const x = Math.round(cx + amp * Math.sin((y - phase0) / period));
      for (let w = -half; w <= half; w++) set(x + w, y);
    }
  };

  // ── 기존 64×64 지형 (중앙) ──
  ellipse(O + 22, O + 21, 3.6, 2.6); // 시작 구역 북서쪽 호수
  river(O + 53, 3, 7, 1, O, O + 63, O); // 동쪽 구획 강
  ellipse(O + 8, O + 55, 3.2, 2.4); // 남서 연못

  // ── 새로 열리는 바깥 지형 ──
  river(14, 4, 9, 1); // 서쪽 가장자리 강
  river(GRID_SIZE - 12, 3, 11, 1); // 동쪽 가장자리 강
  ellipse(22, 20, 7, 5); // 북서 큰 호수
  ellipse(GRID_SIZE - 26, 22, 6, 4); // 북동 호수
  ellipse(26, GRID_SIZE - 24, 8, 5); // 남서 호수
  ellipse(GRID_SIZE - 30, GRID_SIZE - 26, 5, 4); // 남동 호수
  ellipse(GRID_SIZE / 2, 10, 4, 3); // 북쪽 연못
  ellipse(GRID_SIZE / 2 + 4, GRID_SIZE - 10, 4, 3); // 남쪽 연못

  recomputeWaterNear(g);
}

/** 수변(물에서 3칸 이내) 표시 — 땅값 보너스용. 지형이 바뀔 때마다 다시 계산한다 */
export function recomputeWaterNear(g: Grid): void {
  g.waterNear.fill(0);
  for (let y = 0; y < g.size; y++) {
    for (let x = 0; x < g.size; x++) {
      if (g.terrain[g.idx(x, y)] !== T.WATER) continue;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 3 || !g.inBounds(x + dx, y + dy)) continue;
          g.waterNear[g.idx(x + dx, y + dy)] = 1;
        }
      }
    }
  }
}
