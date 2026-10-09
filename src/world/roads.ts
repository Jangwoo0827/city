import { DIRS, Grid, K, Tile } from './grid';

export const isRoad = (g: Grid, x: number, y: number): boolean => g.kindAt(x, y) === K.ROAD;

/** 이웃 도로 비트마스크: 북1 동2 남4 서8 */
export function roadMask(g: Grid, x: number, y: number): number {
  let m = 0;
  for (let d = 0; d < 4; d++) {
    if (isRoad(g, x + DIRS[d][0], y + DIRS[d][1])) m |= 1 << d;
  }
  return m;
}

export function hasAdjacentRoad(g: Grid, x: number, y: number): boolean {
  for (let d = 0; d < 4; d++) {
    if (isRoad(g, x + DIRS[d][0], y + DIRS[d][1])) return true;
  }
  return false;
}

/** 드래그 시작~끝을 주축 기준 직선 타일 목록으로 변환 */
export function straightLine(a: Tile, b: Tile): Tile[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const out: Tile[] = [];
  if (Math.abs(dx) >= Math.abs(dy)) {
    const s = dx >= 0 ? 1 : -1;
    for (let i = 0; i <= Math.abs(dx); i++) out.push({ x: a.x + i * s, y: a.y });
  } else {
    const s = dy >= 0 ? 1 : -1;
    for (let i = 0; i <= Math.abs(dy); i++) out.push({ x: a.x, y: a.y + i * s });
  }
  return out;
}
