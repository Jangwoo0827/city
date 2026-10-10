import { SERVICE_CATEGORIES, isServiceCategory } from '../data/catalog';
import { K } from '../world/grid';
import { buildingStats, facilityList } from '../world/buildings';
import { GameState } from './state';

/** 반경 안쪽 절반은 100%, 바깥쪽 절반에서 서서히 줄어든다 */
export function falloff(d: number, radius: number): number {
  const half = radius * 0.5;
  if (d <= half) return 1;
  return Math.max(0, 1 - (d - half) / (half + 1));
}

/**
 * 서비스 커버리지 계산 (진료소·병원·경찰서·소방서·공원).
 * 시설마다 반경 안의 타일에 거리 감쇠된 값을 기록하고, 여러 시설이 겹치면 가장 높은 값을 쓴다.
 * 수용량이 있는 시설(의료)은 반경 안의 주민 수가 수용량보다 많으면 효율이 떨어진다.
 */
export function computeCoverage(s: GameState): void {
  const g = s.grid;
  for (const c of SERVICE_CATEGORIES) s.cov[c].fill(0);
  s.serviceLoad.clear();

  for (const f of facilityList(g)) {
    const def = f.def;
    const r = def.radius ?? 0;
    if (r <= 0 || !isServiceCategory(def.category)) continue;
    const cx = f.x + (def.w - 1) / 2;
    const cy = f.y + (def.h - 1) / 2;
    const x0 = Math.max(0, Math.floor(cx - r - 1));
    const x1 = Math.min(g.size - 1, Math.ceil(cx + r + 1));
    const y0 = Math.max(0, Math.floor(cy - r - 1));
    const y1 = Math.min(g.size - 1, Math.ceil(cy + r + 1));

    // 이용 인구 (주거 건물의 주민 수)
    let pop = 0;
    if (def.capacity > 0) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = g.idx(x, y);
          if (g.kind[i] !== K.RES || g.level[i] === 0) continue;
          if (Math.hypot(x - cx, y - cy) <= r + 1) pop += buildingStats(K.RES, g.level[i]).pop;
        }
      }
    }
    const eff = def.capacity > 0 ? Math.min(1, def.capacity / Math.max(pop, 1)) : 1;
    s.serviceLoad.set(g.idx(f.x, f.y), { pop, eff });

    const arr = s.cov[def.category];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r + 1) continue;
        const v = falloff(d, r) * eff;
        const i = g.idx(x, y);
        if (v > arr[i]) arr[i] = v;
      }
    }
  }
}
