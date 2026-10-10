import { GRID_SIZE } from '../utils/constants';
import { Grid, T } from './grid';

/**
 * 기본 맵 지형 (결정적 생성):
 *  - 시작 구역(중앙 32×32)의 북서쪽에 작은 호수 → 초반 취수장 설치용 수원
 *  - 동쪽 구획을 흐르는 강
 *  - 남서쪽 구획의 연못
 */
export function generateTerrain(g: Grid): void {
  g.terrain.fill(T.LAND);
  const set = (x: number, y: number): void => {
    if (g.inBounds(x, y)) g.terrain[g.idx(x, y)] = T.WATER;
  };

  // 호수 (중심 (22,21), 타원)
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const dx = (x - 22) / 3.6;
      const dy = (y - 21) / 2.6;
      if (dx * dx + dy * dy <= 1) set(x, y);
    }
  }

  // 강: 위에서 아래로 사행 (x ≈ 53 ± 3), 폭 3
  for (let y = 0; y < GRID_SIZE; y++) {
    const cx = Math.round(53 + 3 * Math.sin(y / 7));
    for (let w = -1; w <= 1; w++) set(cx + w, y);
  }

  // 남서 연못
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const dx = (x - 8) / 3.2;
      const dy = (y - 55) / 2.4;
      if (dx * dx + dy * dy <= 1) set(x, y);
    }
  }
}
