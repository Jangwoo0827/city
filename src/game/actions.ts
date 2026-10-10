import { BRIDGE, COST, REFUND, TERRAIN, XP_AWARD } from '../utils/constants';
import { recomputeWaterNear } from '../world/terrain';
import { ZONE_BY_ID } from '../data/zones';
import { FACILITIES, ROAD_TYPES } from '../data/catalog';
import { DIRS, Grid, K, T, Tile, isZoneKind } from '../world/grid';
import { straightLine } from '../world/roads';
import { ZONE_KIND, ZONE_NAME, ZoneType, rectTiles } from '../world/zones';
import { facilityAt, facilityFootprint } from '../world/buildings';
import { GameState } from './state';
import { refreshStats } from './simulation';
import { awardXp, isUnlocked } from './progression';

export type Tool = 'road' | 'zone' | 'facility' | 'terrain' | 'demolish' | 'select' | 'copy';

/** 지형 편집 방식: dig = 물 만들기(강·호수), fill = 땅 메우기 */
export type TerrainMode = 'dig' | 'fill';

/** 도구 사용 시 선택된 세부 옵션 */
export interface ToolOptions {
  zone: ZoneType;
  facility: number;
  roadType: number;
  terrain: TerrainMode;
  /** 물 파기 브러시 폭(칸) */
  width: number;
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

export interface Plan {
  tiles: PreviewTile[];
  /** 새로 설치(비용 발생)되는 타일 */
  placeable: Tile[];
  /** placeable 항목별 비용 */
  costs: number[];
  /** 잠겨서 사용할 수 없는 이유 */
  blocked?: string;
}

export function planRoad(s: GameState, type: number, a: Tile, b: Tile): Plan {
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

/** assumeAccess: 아직 설치되지 않았지만 곧 설치될 도로(붙여넣기)까지 고려한 도로 접근 판정 */
export function planZone(s: GameState, zone: ZoneType, a: Tile, b: Tile, assumeAccess?: (x: number, y: number) => boolean): Plan {
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
    const ok = free && s.isUnlockedAt(t.x, t.y) && !g.isWater(t.x, t.y) && (g.access[i] >= 0 || (assumeAccess?.(t.x, t.y) ?? false));
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

/**
 * 시설 배치: 드래그한 사각형을 시설 크기(w×h) 격자로 채운다.
 * 한 번 클릭하면(영역이 1칸) 그 칸에 하나, 드래그하면 영역 안에 들어가는 만큼 한꺼번에 깐다.
 * 각 시설은 독립적으로 설치 가능 여부(빈 땅·물 인접 조건 등)를 판정한다.
 */
export function planFacility(s: GameState, facId: number, a: Tile, b: Tile): Plan {
  const def = FACILITIES[facId];
  if (!isUnlocked(s, def.node)) return { tiles: [], placeable: [], costs: [], blocked: `${def.name}은(는) 개발 트리에서 해금해야 합니다` };
  const g = s.grid;
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const nx = Math.max(1, Math.floor((Math.abs(b.x - a.x) + 1) / def.w));
  const ny = Math.max(1, Math.floor((Math.abs(b.y - a.y) + 1) / def.h));
  const tiles: PreviewTile[] = [];
  const placeable: Tile[] = [];
  const costs: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const at = { x: x0 + i * def.w, y: y0 + j * def.h };
      const ok = canPlaceFacility(s, facId, at);
      for (const t of facilityFootprint(def, at.x, at.y)) if (g.inBounds(t.x, t.y)) tiles.push({ ...t, ok });
      if (ok) {
        placeable.push(at);
        costs.push(def.cost);
      }
    }
  }
  return { tiles, placeable, costs };
}

/**
 * 지형 편집.
 *  - dig(물 만들기): 드래그한 직선을 폭 width 로 파서 강·호수를 만든다. 빈 땅만 가능.
 *  - fill(메우기): 드래그한 사각형의 물을 메워 땅으로 만든다. 다리·건물이 없는 빈 물 타일만 가능.
 */
function planTerrain(s: GameState, mode: TerrainMode, width: number, a: Tile, b: Tile): Plan {
  const g = s.grid;
  const tiles: PreviewTile[] = [];
  const placeable: Tile[] = [];
  const costs: number[] = [];
  const seen = new Set<number>();
  let area: Tile[];
  if (mode === 'dig') {
    const line = straightLine(a, b);
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const half = Math.floor(Math.max(1, width) / 2);
    area = [];
    for (const t of line) {
      for (let k = -half; k <= half; k++) area.push(horizontal ? { x: t.x, y: t.y + k } : { x: t.x + k, y: t.y });
    }
  } else {
    area = rectTiles(a, b);
  }
  for (const t of area) {
    if (!g.inBounds(t.x, t.y)) continue;
    const i = g.idx(t.x, t.y);
    if (seen.has(i)) continue;
    seen.add(i);
    const unlocked = s.isUnlockedAt(t.x, t.y);
    const empty = g.kind[i] === K.EMPTY;
    const ok = unlocked && empty && (mode === 'dig' ? g.terrain[i] === T.LAND : g.terrain[i] === T.WATER);
    tiles.push({ ...t, ok });
    if (ok) {
      placeable.push(t);
      costs.push(mode === 'dig' ? TERRAIN.digCost : TERRAIN.fillCost);
    }
  }
  return { tiles, placeable, costs };
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
      return planFacility(s, o.facility, a, b);
    case 'terrain':
      return planTerrain(s, o.terrain, o.width, a, b);
    case 'copy': // 복사할 영역 선택 (미리보기만)
      return { tiles: rectTiles(a, b).filter((t) => s.grid.inBounds(t.x, t.y)).map((t) => ({ ...t, ok: true })), placeable: [], costs: [] };
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
        label = n > 1 ? `${def.name} ${n}기` : def.name;
        if (n === 0 && def.needsWater) label += ' (물 타일에 붙여서 설치)';
        break;
      }
      case 'copy':
        label = `복사 영역 ${Math.abs(b.x - a.x) + 1}×${Math.abs(b.y - a.y) + 1}칸`;
        break;
      case 'terrain':
        label = o.terrain === 'dig' ? (n > 0 ? `물 만들기 ${n}칸` : '물 만들기 (빈 땅에만)') : n > 0 ? `땅 메우기 ${n}칸` : '땅 메우기 (빈 물 타일에만)';
        break;
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
    neutral: tool === 'select' || tool === 'copy',
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
  if (tool === 'select' || tool === 'copy') return { ok: true, placed: 0 };
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
      case 'zone':
      case 'facility':
        xp += commitTile(s, tool, o, t);
        break;
      case 'terrain':
        g.terrain[i] = o.terrain === 'dig' ? T.WATER : T.LAND;
        break;
      case 'demolish':
        demolishTile(g, t.x, t.y);
        break;
    }
    s.money -= cost;
    placed++;
  }

  if (placed > 0) {
    if (tool === 'terrain') {
      recomputeWaterNear(g);
      s.dirty.terrain = true;
    }
    s.dirty.roads = s.dirty.zones = s.dirty.buildings = s.dirty.net = true;
    refreshStats(s);
    awardXp(s, xp);
  }
  if (broke) s.toast('자금이 부족합니다', 'bad');
  return { ok: placed > 0, placed };
}

/**
 * 도로·구역·시설 한 칸(시설은 한 기)을 실제로 설치한다. 비용·검증은 호출 측(계획 단계)에서 끝난 상태.
 * 얻는 XP 를 돌려준다. (도구 적용과 붙여넣기가 함께 쓴다)
 */
export function commitTile(s: GameState, tool: 'road' | 'zone' | 'facility', o: ToolOptions, t: Tile): number {
  const g = s.grid;
  const i = g.idx(t.x, t.y);
  if (tool === 'road') {
    const xp = g.kind[i] !== K.ROAD ? XP_AWARD.road : 0;
    g.kind[i] = K.ROAD;
    g.roadType[i] = o.roadType;
    return xp;
  }
  if (tool === 'zone') {
    g.kind[i] = ZONE_KIND[o.zone];
    g.level[i] = 0;
    g.progress[i] = 0;
    g.abandoned[i] = 0;
    g.neglect[i] = 0;
    return 0;
  }
  const def = FACILITIES[o.facility];
  for (const f of facilityFootprint(def, t.x, t.y)) {
    const fi = g.idx(f.x, f.y);
    g.kind[fi] = K.FAC;
    g.owner[fi] = i + 1;
    g.fac[fi] = o.facility;
  }
  return XP_AWARD.facility;
}

/** 편집 후 공통 마무리: 변경 플래그, 통계 재계산, XP */
export function finishEdit(s: GameState, xp: number): void {
  s.dirty.roads = s.dirty.zones = s.dirty.buildings = s.dirty.net = true;
  refreshStats(s);
  awardXp(s, xp);
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
