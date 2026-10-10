import { FAC, FACILITIES, FacilityCategory, SEWAGE_RATIO } from '../data/catalog';
import { ZONE_BY_KIND } from '../data/zones';
import { GROUNDWATER, WATER_POLLUTION } from '../utils/constants';
import { DIRS, K, isZoneKind } from '../world/grid';
import { facilityFootprint, facilityList } from '../world/buildings';
import { GameState } from './state';

/** 구역 타일의 카테고리별 사용량 (건물이 없으면 레벨 1 기준 = 성장 여유 확인용) */
export const powerUse = (kind: number, level: number): number => (ZONE_BY_KIND[kind]?.power ?? 0) * level;
export const waterUse = (kind: number, level: number): number => (ZONE_BY_KIND[kind]?.water ?? 0) * level;
export const sewageUse = (kind: number, level: number): number => waterUse(kind, level) * SEWAGE_RATIO;

/** 시설의 현재 유효 용량 */
export function effectiveCapacity(s: GameState, facId: number): number {
  const def = FACILITIES[facId];
  switch (facId) {
    case FAC.PUMP:
      return def.capacity * (1 - WATER_POLLUTION.intakePenalty * s.waterPollution);
    case FAC.WELL:
      return s.groundwater > GROUNDWATER.minToRun ? def.capacity : 0;
    default:
      return def.capacity;
  }
}

const CATEGORIES: FacilityCategory[] = ['power', 'water', 'sewage'];

/**
 * 전력·상수도·하수 네트워크 계산.
 * 도로 = 배선/배관. 시설에 붙은 도로에서 BFS 로 거리를 구하고, 같은 도로망(컴포넌트) 안에서
 * 용량이 허락하는 만큼 **발전/급수 시설에서 가까운 구역부터** 공급한다 (모자라면 말단부터 끊김).
 */
export function computeNetworks(s: GameState): void {
  const g = s.grid;
  const n = g.count;
  const size = g.size;
  g.powered.fill(0);
  g.watered.fill(0);
  g.sewered.fill(0);

  // 1) 도로망 컴포넌트
  const comp = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let nComp = 0;
  for (let i = 0; i < n; i++) {
    if (g.kind[i] !== K.ROAD || comp[i] >= 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    comp[i] = nComp;
    while (head < tail) {
      const c = queue[head++];
      const cx = c % size;
      const cy = (c / size) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const ni = ny * size + nx;
        if (g.kind[ni] === K.ROAD && comp[ni] < 0) {
          comp[ni] = nComp;
          queue[tail++] = ni;
        }
      }
    }
    nComp++;
  }

  const facs = facilityList(g);
  const st = s.stats;

  // 구역 타일 목록 (건물 여부와 무관, 접근 가능한 것만)
  const zoneTiles: number[] = [];
  for (let i = 0; i < n; i++) if (isZoneKind(g.kind[i]) && g.access[i] >= 0) zoneTiles.push(i);

  const treatmentCap = { total: 0 };
  let sewageFlow = 0;

  for (const cat of CATEGORIES) {
    const out = cat === 'power' ? g.powered : cat === 'water' ? g.watered : g.sewered;
    const dist = new Int32Array(n).fill(-1);
    const capByComp = new Float64Array(Math.max(1, nComp));
    let head = 0;
    let tail = 0;
    let supply = 0;

    for (const f of facs) {
      if (f.def.category !== cat) continue;
      const cap = effectiveCapacity(s, f.def.id);
      supply += cap;
      let comp0 = -1;
      for (const t of facilityFootprint(f.def, f.x, f.y)) {
        for (const [dx, dy] of DIRS) {
          const nx = t.x + dx;
          const ny = t.y + dy;
          if (!g.inBounds(nx, ny)) continue;
          const ni = ny * size + nx;
          if (g.kind[ni] !== K.ROAD) continue;
          if (dist[ni] < 0) {
            dist[ni] = 0;
            queue[tail++] = ni;
          }
          if (comp0 < 0) comp0 = comp[ni];
        }
      }
      if (comp0 >= 0) {
        capByComp[comp0] += cap;
        if (cat === 'sewage' && f.def.id === FAC.TREATMENT) treatmentCap.total += cap;
      }
      // 시설 타일 자체의 연결 표시 (오버레이용)
      for (const t of facilityFootprint(f.def, f.x, f.y)) out[t.y * size + t.x] = comp0 >= 0 ? 1 : 0;
    }

    // 도로 BFS 거리
    while (head < tail) {
      const c = queue[head++];
      const cx = c % size;
      const cy = (c / size) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const ni = ny * size + nx;
        if (g.kind[ni] === K.ROAD && dist[ni] < 0) {
          dist[ni] = dist[c] + 1;
          queue[tail++] = ni;
        }
      }
    }

    // 도로 타일 통전 표시 (오버레이용)
    for (let i = 0; i < n; i++) if (g.kind[i] === K.ROAD && dist[i] >= 0 && capByComp[comp[i]] > 0) out[i] = 1;

    // 공급 순서: 컴포넌트 → 시설에서의 거리 → 인덱스
    const keys: number[] = [];
    for (const i of zoneTiles) {
      const r = g.access[i];
      if (dist[r] < 0) continue;
      keys.push((comp[r] * n + dist[r]) * n + i);
    }
    const sorted = Float64Array.from(keys).sort();
    const remaining = capByComp.slice();
    let demand = 0;
    let served = 0;
    let builtServed = 0;
    for (let k = 0; k < sorted.length; k++) {
      const key = sorted[k];
      const i = key % n;
      const c = Math.floor(key / n / n);
      const kind = g.kind[i];
      const lv = g.level[i];
      let use: number;
      if (cat === 'power') use = powerUse(kind, Math.max(1, lv));
      else if (cat === 'water') use = waterUse(kind, Math.max(1, lv));
      else use = g.watered[i] || lv === 0 ? sewageUse(kind, Math.max(1, lv)) : 0;
      // 빈 구역·폐허는 용량이 남아 있을 때만 "공급 가능"으로 표시하고 용량을 소비하지 않는다
      if (remaining[c] >= use) {
        out[i] = 1;
        if (lv > 0 && !g.abandoned[i]) {
          remaining[c] -= use;
          served += use;
          builtServed++;
        }
      }
    }
    void builtServed;

    // 요구량(접근 가능 여부와 무관한 모든 건물)
    for (let i = 0; i < n; i++) {
      const lv = g.level[i];
      if (lv === 0 || !isZoneKind(g.kind[i]) || g.abandoned[i]) continue;
      if (cat === 'power') demand += powerUse(g.kind[i], lv);
      else if (cat === 'water') demand += waterUse(g.kind[i], lv);
      else if (g.watered[i]) demand += sewageUse(g.kind[i], lv);
    }

    if (cat === 'power') {
      st.powerSupply = supply;
      st.powerDemand = demand;
    } else if (cat === 'water') {
      st.waterSupply = supply;
      st.waterDemand = demand;
    } else {
      st.sewageCap = supply;
      st.sewageDemand = demand;
      sewageFlow = served;
    }
  }

  st.sewageUntreated = Math.max(0, sewageFlow - treatmentCap.total);
}

/** 틱마다: 지하수 소모/회복, 수질 오염 증감 */
export function updateEnvironment(s: GameState): void {
  const st = s.stats;
  const facs = facilityList(s.grid);
  let wellCap = 0;
  for (const f of facs) if (f.def.id === FAC.WELL) wellCap += f.def.capacity;

  // 우물이 담당하는 물 사용 비율만큼 지하수 소모
  let wellShare = 0;
  if (wellCap > 0 && st.waterSupply > 0) {
    wellShare = Math.min(1, wellCap / st.waterSupply) * Math.min(1, st.waterDemand / st.waterSupply);
  }
  s.groundwater = Math.min(1, Math.max(0, s.groundwater - GROUNDWATER.drain * wellShare + GROUNDWATER.regen));

  // 무처리 하수 → 수질 오염
  s.waterPollution = Math.min(1, Math.max(0, s.waterPollution + WATER_POLLUTION.risePerFlow * st.sewageUntreated - WATER_POLLUTION.decay));
}
