import { BRIDGE, COST, REFUND, XP_AWARD } from '../utils/constants';
import { ZONE_BY_ID } from '../data/zones';
import { FACILITIES, ROAD_TYPES } from '../data/catalog';
import { DIRS, Grid, K, Tile, isZoneKind } from '../world/grid';
import { straightLine } from '../world/roads';
import { ZONE_KIND, ZONE_NAME, ZoneType, rectTiles } from '../world/zones';
import { facilityAt, facilityFootprint } from '../world/buildings';
import { GameState } from './state';
import { refreshStats } from './simulation';
import { awardXp, isUnlocked } from './progression';

export type Tool = 'road' | 'zone' | 'facility' | 'demolish' | 'select';

/** 도구 사용 시 선택된 세부 옵션 */
export interface ToolOptions {
  zone: ZoneType;
  facility: number;
  roadType: number;
}

export interface PreviewTile extends Tile {
  ok: boolean;
}

export interface Preview {
  tiles: PreviewTile[];
  /** 실제로 청구될 비용 */
  cost: number;
  label: string;
  /** 선택 도구처럼 초록/빨강 대신 중립색으로 표시 */
  neutral: boolean;
  affordable: boolean;
}

interface Plan {
  tiles: PreviewTile[];
  /** 새로 설치(비용 발생)되는 타일 */
  placeable: Tile[];
  /** placeable 항목별 비용 */
  costs: number[];
  /** 잠겨서 사용할 수 없는 이유 */
  blocked?: string;
}

function planRoad(s: GameState, type: number, a: Tile, b: Tile): Plan {
  const g = s.grid;
  const def = ROAD_TYPES[type];
  const tiles: PreviewTile[] = [];
  const placeable: Tile[] = [];
  const costs: number[] = [];
  if (!isUnlocked(s, def.node)) return { tiles: [], placeable, costs, blocked: `${def.name}은(는) 개발 트리에서 해금해야 합니다` };
  for (const t of straightLine(a, b)) {
    if (!g.inBounds(t.x, t.y)) continue;
    const i = g.idx(t.x, t.y);
    const k = g.kind[i];
    const open = s.isUnlockedAt(t.x, t.y);
    // 물 위에는 다리를 놓을 수 있다 (건설비 ×BRIDGE.costMult)
    const mult = g.isWater(t.x, t.y) ? BRIDGE.costMult : 1;
    if (!open) tiles.push({ ...t, ok: false });
    else if (k === K.ROAD) {
      const cur = g.roadType[i];
      tiles.push({ ...t, ok: true });
      if (type > cur) {
        placeable.push(t);
        costs.push(Math.round((def.cost - ROAD_TYPES[cur].cost) * mult));
      }
    } else if (k === K.EMPTY) {
      tiles.push({ ...t, ok: true });
      placeable.push(t);
      costs.push(Math.round(def.cost * mult));
    } else tiles.push({ ...t, ok: false });
  }
  return { tiles, placeable, costs };
}

function planZone(s: GameState, zone: ZoneType, a: Tile, b: Tile): Plan {
  const g = s.grid;
  const kind = ZONE_KIND[zone];
  const zdef = ZONE_BY_ID[zone];
  const tiles: PreviewTile[] = [];
  const placeable: Tile[] = [];
  const costs: number[] = [];
  if (!isUnlocked(s, zdef.node)) return { tiles: [], placeable, costs, blocked: `${zdef.name} 구역은 개발 트리에서 해금해야 합니다` };
  for (const t of rectTiles(a, b)) {
    if (!g.inBounds(t.x, t.y)) continue;
    const i = g.idx(t.x, t.y);
    const k = g.kind[i];
    const free = k === K.EMPTY || (isZoneKind(k) && g.level[i] === 0);
    const ok = free && s.isUnlockedAt(t.x, t.y) && !g.isWater(t.x, t.y) && g.access[i] >= 0;
    tiles.push({ ...t, ok });
    if (ok && k !== kind) {
      placeable.push(t);
      costs.push(COST.zone);
    }
  }
  return { tiles, placeable, costs };
}

/** 시설이 놓일 수 있는지 (풋프린트 전체) + 물 인접 조건 */
export function canPlaceFacility(s: GameState, facId: number, at: Tile): boolean {
  const g = s.grid;
  const def = FACILITIES[facId];
  const foot = facilityFootprint(def, at.x, at.y);
  const free = foot.every(
    (t) => g.inBounds(t.x, t.y) && g.kind[g.idx(t.x, t.y)] === K.EMPTY && s.isUnlockedAt(t.x, t.y) && !g.isWater(t.x, t.y),
  );
  if (!free) return false;
  if (def.needsWater) {
    return foot.some((t) => DIRS.some(([dx, dy]) => g.isWater(t.x + dx, t.y + dy)));
  }
  return true;
}

function planFacility(s: GameState, facId: number, at: Tile): Plan {
  const def = FACILITIES[facId];
  if (!isUnlocked(s, def.node)) return { tiles: [], placeable: [], costs: [], blocked: `${def.name}은(는) 개발 트리에서 해금해야 합니다` };
  const g = s.grid;
  const ok = canPlaceFacility(s, facId, at);
  const foot = facilityFootprint(def, at.x, at.y).filter((t) => g.inBounds(t.x, t.y));
  return {
    tiles: foot.map((t) => ({ ...t, ok })),
    placeable: ok ? [at] : [],
    costs: ok ? [def.cost] : [],
  };
}

/** 철거: 비용은 음수(= 환급). 시설은 통째로 한 번만 환급한다. */
function planDemolish(s: GameState, a: Tile, b: Tile): Plan {
  const g = s.grid;
  const tiles: PreviewTile[] = [];
  const placeable: Tile[] = [];
  const costs: number[] = [];
  const seenFacilities = new Set<number>();
  for (const t of rectTiles(a, b)) {
    if (!g.inBounds(t.x, t.y)) continue;
    const i = g.idx(t.x, t.y);
    const k = g.kind[i];
    const ok = k !== K.EMPTY && s.isUnlockedAt(t.x, t.y);
    tiles.push({ ...t, ok });
    if (!ok) continue;
    let refund = 0;
    if (k === K.ROAD) refund = ROAD_TYPES[g.roadType[i]].cost * REFUND.rate * (g.isWater(t.x, t.y) ? BRIDGE.costMult : 1);
    else if (isZoneKind(k)) refund = COST.zone * REFUND.rate + g.level[i] * REFUND.perBuildingLevel;
    else if (k === K.FAC) {
      const owner = g.owner[i];
      if (!seenFacilities.has(owner)) {
        seenFacilities.add(owner);
        refund = (FACILITIES[g.fac[owner - 1]]?.cost ?? 0) * REFUND.rate;
      }
    }
    placeable.push(t);
    costs.push(-Math.round(refund));
  }
  return { tiles, placeable, costs };
}

function makePlan(s: GameState, tool: Tool, o: ToolOptions, a: Tile, b: Tile): Plan {
  switch (tool) {
    case 'road':
      return planRoad(s, o.roadType, a, b);
    case 'zone':
      return planZone(s, o.zone, a, b);
    case 'facility':
      return planFacility(s, o.facility, b);
    case 'demolish':
      return planDemolish(s, a, b);
    default:
      return { tiles: s.grid.inBounds(b.x, b.y) ? [{ ...b, ok: true }] : [], placeable: [], costs: [] };
  }
}

const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);

/** 호버/드래그 중 보여줄 미리보기 */
export function previewAction(s: GameState, tool: Tool, o: ToolOptions, a: Tile, b: Tile): Preview {
  const plan = makePlan(s, tool, o, a, b);
  const cost = sum(plan.costs);
  const affordable = cost <= 0 || cost <= s.money;
  const n = plan.placeable.length;
  let label = '';
  if (plan.blocked) label = plan.blocked;
  else {
    switch (tool) {
      case 'road': {
        const bridges = plan.placeable.filter((t) => s.grid.isWater(t.x, t.y)).length;
        label = n > 0 ? `${ROAD_TYPES[o.roadType].name} ${n}칸` : ROAD_TYPES[o.roadType].name;
        if (bridges > 0) label += ` (다리 ${bridges}칸 ×${BRIDGE.costMult})`;
        break;
      }
      case 'zone': {
        const d = ROAD_TYPES[0].depth;
        label = n > 0 ? `${ZONE_NAME[o.zone]} 구역 ${n}칸` : `${ZONE_NAME[o.zone]} 구역 (도로에서 ${d}칸 이내 · 물 위 불가)`;
        break;
      }
      case 'facility': {
        const def = FACILITIES[o.facility];
        label = def.name;
        if (n === 0 && def.needsWater) label += ' (물 타일에 붙여서 설치)';
        break;
      }
      case 'demolish':
        label = n > 0 ? `철거 ${n}칸 · 환급 +₩${(-cost).toLocaleString('ko-KR')}` : '철거';
        break;
      default:
        label = '';
    }
    if (tool !== 'select' && tool !== 'demolish' && n > 0) label += ` · ₩${cost.toLocaleString('ko-KR')}`;
    if (tool !== 'select' && !affordable && n > 0) label += ' (자금 부족)';
  }
  return {
    tiles: plan.tiles.map((t) => (affordable && !plan.blocked ? t : { ...t, ok: false })),
    cost,
    label,
    neutral: tool === 'select',
    affordable,
  };
}

export interface ActionResult {
  ok: boolean;
  placed: number;
  message?: string;
}

/** 도구를 실제로 적용한다. (select 는 호출 측에서 처리) */
export function applyAction(s: GameState, tool: Tool, o: ToolOptions, a: Tile, b: Tile): ActionResult {
  if (s.gameOver) return { ok: false, placed: 0 };
  const g = s.grid;
  if (tool === 'select') return { ok: true, placed: 0 };
  const plan = makePlan(s, tool, o, a, b);
  if (plan.blocked) return { ok: false, placed: 0, message: plan.blocked };
  if (plan.placeable.length === 0) {
    return { ok: false, placed: 0, message: tool === 'facility' ? '여기에는 설치할 수 없습니다' : undefined };
  }

  let placed = 0;
  let broke = false;
  let xp = 0;
  for (let n = 0; n < plan.placeable.length; n++) {
    const t = plan.placeable[n];
    const cost = plan.costs[n];
    if (cost > 0 && s.money < cost) {
      broke = true;
      break;
    }
    const i = g.idx(t.x, t.y);
    // 이미 같은 시설의 다른 칸을 철거하며 사라진 타일은 건너뜀
    if (tool === 'demolish' && g.kind[i] === K.EMPTY) continue;
    switch (tool) {
      case 'road':
        if (g.kind[i] !== K.ROAD) xp += XP_AWARD.road;
        g.kind[i] = K.ROAD;
        g.roadType[i] = o.roadType;
        break;
      case 'zone':
        g.kind[i] = ZONE_KIND[o.zone];
        g.level[i] = 0;
        g.progress[i] = 0;
        g.abandoned[i] = 0;
        g.neglect[i] = 0;
        break;
      case 'facility': {
        const def = FACILITIES[o.facility];
        for (const f of facilityFootprint(def, t.x, t.y)) {
          const fi = g.idx(f.x, f.y);
          g.kind[fi] = K.FAC;
          g.owner[fi] = i + 1;
          g.fac[fi] = o.facility;
        }
        xp += XP_AWARD.facility;
        break;
      }
      case 'demolish':
        demolishTile(g, t.x, t.y);
        break;
    }
    s.money -= cost;
    placed++;
  }

  if (placed > 0) {
    s.dirty.roads = s.dirty.zones = s.dirty.buildings = s.dirty.net = true;
    refreshStats(s);
    awardXp(s, xp);
  }
  if (broke) s.toast('자금이 부족합니다', 'bad');
  return { ok: placed > 0, placed };
}

/** 한 타일(시설은 통째로)을 비운다. 환급 없음. */
export function demolishTile(g: Grid, x: number, y: number): void {
  const fac = facilityAt(g, x, y);
  if (fac) {
    for (const f of facilityFootprint(fac.def, fac.x, fac.y)) {
      const fi = g.idx(f.x, f.y);
      g.kind[fi] = K.EMPTY;
      g.owner[fi] = 0;
      g.fac[fi] = 0;
      g.powered[fi] = g.watered[fi] = g.sewered[fi] = 0;
    }
    return;
  }
  const i = g.idx(x, y);
  g.kind[i] = K.EMPTY;
  g.level[i] = 0;
  g.progress[i] = 0;
  g.abandoned[i] = 0;
  g.neglect[i] = 0;
  g.roadType[i] = 0;
  g.powered[i] = g.watered[i] = g.sewered[i] = 0;
}
