import { DIRS, K, isZoneKind } from '../world/grid';
import { GameState } from './state';

/**
 * 전력 전파: 발전소에 붙은 도로에서 시작해 도로망을 따라 BFS.
 * 전력이 닿은 도로(또는 발전소)에 인접한 구역 타일이 전력을 공급받는다.
 */
export function computePower(s: GameState): void {
  const g = s.grid;
  g.powered.fill(0);
  const queue: number[] = [];

  const pushRoad = (x: number, y: number): void => {
    if (!g.inBounds(x, y)) return;
    const i = g.idx(x, y);
    if (g.kind[i] === K.ROAD && !g.powered[i]) {
      g.powered[i] = 1;
      queue.push(i);
    }
  };

  // 발전소 타일 자신과, 그 둘레의 도로를 시작점으로
  for (let i = 0; i < g.count; i++) {
    if (g.kind[i] !== K.PLANT) continue;
    g.powered[i] = 1;
    const x = i % g.size;
    const y = (i / g.size) | 0;
    for (const [dx, dy] of DIRS) pushRoad(x + dx, y + dy);
  }

  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % g.size;
    const y = (i / g.size) | 0;
    for (const [dx, dy] of DIRS) pushRoad(x + dx, y + dy);
  }

  // 구역: 전력이 닿은 도로(또는 발전소)에 인접하면 전력 공급
  for (let i = 0; i < g.count; i++) {
    if (!isZoneKind(g.kind[i])) continue;
    const x = i % g.size;
    const y = (i / g.size) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!g.inBounds(nx, ny)) continue;
      const ni = g.idx(nx, ny);
      if (g.powered[ni] && (g.kind[ni] === K.ROAD || g.kind[ni] === K.PLANT)) {
        g.powered[i] = 1;
        break;
      }
    }
  }
}
