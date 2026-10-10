import { ROAD_TYPES } from '../data/catalog';
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

/** 구역·건물이 접근할 수 있는 도로가 (깊이 이내에) 있는가 */
export const hasAccess = (g: Grid, x: number, y: number): boolean => g.access[g.idx(x, y)] >= 0;

/**
 * 각 타일이 접근할 수 있는 가장 가까운 도로(맨해튼 거리 ≤ 도로 종류의 구역 깊이)를 계산한다.
 * 도로가 바뀔 때만 다시 호출하면 된다.
 */
export function computeAccess(g: Grid): void {
  g.access.fill(-1);
  const best = new Uint8Array(g.count).fill(255);
  for (let i = 0; i < g.count; i++) {
    if (g.kind[i] !== K.ROAD) continue;
    const depth = ROAD_TYPES[g.roadType[i]]?.depth ?? 4;
    const rx = i % g.size;
    const ry = (i / g.size) | 0;
    for (let dy = -depth; dy <= depth; dy++) {
      const y = ry + dy;
      if (y < 0 || y >= g.size) continue;
      const rem = depth - Math.abs(dy);
      for (let dx = -rem; dx <= rem; dx++) {
        const x = rx + dx;
        if (x < 0 || x >= g.size) continue;
        const t = y * g.size + x;
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < best[t]) {
          best[t] = d;
          g.access[t] = i;
        }
      }
    }
  }
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
