import { COST } from '../utils/constants';
import { Grid, K, Tile, isZoneKind } from '../world/grid';
import { hasAdjacentRoad, straightLine } from '../world/roads';
import { ZONE_KIND, ZONE_NAME, ZoneType, rectTiles } from '../world/zones';
import { plantAnchorAt, plantFootprint } from '../world/buildings';
import { GameState } from './state';
import { refreshStats } from './simulation';

export type Tool = 'road' | 'zone' | 'plant' | 'demolish' | 'select';

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
  costPer: number;
}

function planRoad(g: Grid, a: Tile, b: Tile): Plan {
  const tiles: PreviewTile[] = [];
  const placeable: Tile[] = [];
  for (const t of straightLine(a, b)) {
    if (!g.inBounds(t.x, t.y)) continue;
    const k = g.kind[g.idx(t.x, t.y)];
    if (k === K.ROAD) tiles.push({ ...t, ok: true });
    else if (k === K.EMPTY) {
      tiles.push({ ...t, ok: true });
      placeable.push(t);
    } else tiles.push({ ...t, ok: false });
  }
  return { tiles, placeable, costPer: COST.road };
}

function planZone(g: Grid, zone: ZoneType, a: Tile, b: Tile): Plan {
  const kind = ZONE_KIND[zone];
  const tiles: PreviewTile[] = [];
  const placeable: Tile[] = [];
  for (const t of rectTiles(a, b)) {
    if (!g.inBounds(t.x, t.y)) continue;
    const i = g.idx(t.x, t.y);
    const k = g.kind[i];
    const free = k === K.EMPTY || (isZoneKind(k) && g.level[i] === 0);
    const ok = free && hasAdjacentRoad(g, t.x, t.y);
    tiles.push({ ...t, ok });
    if (ok && k !== kind) placeable.push(t);
  }
  return { tiles, placeable, costPer: COST.zone };
}

function planPlant(g: Grid, at: Tile): Plan {
  const foot = plantFootprint(at.x, at.y);
  const ok = foot.every((t) => g.inBounds(t.x, t.y) && g.kind[g.idx(t.x, t.y)] === K.EMPTY);
  return {
    tiles: foot.filter((t) => g.inBounds(t.x, t.y)).map((t) => ({ ...t, ok })),
    placeable: ok ? [at] : [],
    costPer: COST.plant,
  };
}

function planDemolish(g: Grid, a: Tile, b: Tile): Plan {
  const tiles: PreviewTile[] = [];
  const placeable: Tile[] = [];
  for (const t of rectTiles(a, b)) {
    if (!g.inBounds(t.x, t.y)) continue;
    const ok = g.kind[g.idx(t.x, t.y)] !== K.EMPTY;
    tiles.push({ ...t, ok });
    if (ok) placeable.push(t);
  }
  return { tiles, placeable, costPer: COST.demolish };
}

function makePlan(s: GameState, tool: Tool, zone: ZoneType, a: Tile, b: Tile): Plan {
  const g = s.grid;
  switch (tool) {
    case 'road':
      return planRoad(g, a, b);
    case 'zone':
      return planZone(g, zone, a, b);
    case 'plant':
      return planPlant(g, b);
    case 'demolish':
      return planDemolish(g, a, b);
    default:
      return { tiles: g.inBounds(b.x, b.y) ? [{ ...b, ok: true }] : [], placeable: [], costPer: 0 };
  }
}

/** 호버/드래그 중 보여줄 미리보기 */
export function previewAction(s: GameState, tool: Tool, zone: ZoneType, a: Tile, b: Tile): Preview {
  const plan = makePlan(s, tool, zone, a, b);
  const cost = plan.placeable.length * plan.costPer;
  const affordable = cost <= s.money;
  let label = '';
  const n = plan.placeable.length;
  switch (tool) {
    case 'road':
      label = n > 0 ? `도로 ${n}칸` : '도로';
      break;
    case 'zone':
      label = n > 0 ? `${ZONE_NAME[zone]} 구역 ${n}칸` : `${ZONE_NAME[zone]} 구역 (도로 옆만 가능)`;
      break;
    case 'plant':
      label = '발전소';
      break;
    case 'demolish':
      label = n > 0 ? `철거 ${n}칸` : '철거';
      break;
    default:
      label = '';
  }
  if (tool !== 'select' && tool !== 'demolish' && n > 0) label += ` · ₩${cost.toLocaleString('ko-KR')}`;
  if (tool !== 'select' && !affordable && n > 0) label += ' (자금 부족)';
  return {
    tiles: plan.tiles.map((t) => (affordable ? t : { ...t, ok: false })),
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
export function applyAction(s: GameState, tool: Tool, zone: ZoneType, a: Tile, b: Tile): ActionResult {
  if (s.gameOver) return { ok: false, placed: 0 };
  const g = s.grid;
  const plan = makePlan(s, tool, zone, a, b);
  if (tool === 'select') return { ok: true, placed: 0 };
  if (plan.placeable.length === 0) {
    return { ok: false, placed: 0, message: tool === 'plant' ? '여기에는 발전소를 지을 수 없습니다' : undefined };
  }

  let placed = 0;
  let broke = false;
  for (const t of plan.placeable) {
    if (s.money < plan.costPer) {
      broke = true;
      break;
    }
    const i = g.idx(t.x, t.y);
    switch (tool) {
      case 'road':
        g.kind[i] = K.ROAD;
        break;
      case 'zone':
        g.kind[i] = ZONE_KIND[zone];
        g.level[i] = 0;
        g.progress[i] = 0;
        break;
      case 'plant': {
        for (const f of plantFootprint(t.x, t.y)) {
          const fi = g.idx(f.x, f.y);
          g.kind[fi] = K.PLANT;
          g.plantOwner[fi] = i + 1;
        }
        break;
      }
      case 'demolish':
        demolishTile(g, t.x, t.y);
        break;
    }
    s.money -= plan.costPer;
    placed++;
  }

  if (placed > 0) {
    s.dirty.roads = s.dirty.zones = s.dirty.buildings = s.dirty.power = true;
    refreshStats(s);
  }
  if (broke) s.toast('자금이 부족합니다', 'bad');
  return { ok: placed > 0, placed };
}

/** 한 타일(발전소는 통째로)을 비운다. 환급 없음. */
export function demolishTile(g: Grid, x: number, y: number): void {
  const anchor = plantAnchorAt(g, x, y);
  if (anchor) {
    for (const f of plantFootprint(anchor.x, anchor.y)) {
      const fi = g.idx(f.x, f.y);
      g.kind[fi] = K.EMPTY;
      g.plantOwner[fi] = 0;
      g.powered[fi] = 0;
    }
    return;
  }
  const i = g.idx(x, y);
  g.kind[i] = K.EMPTY;
  g.level[i] = 0;
  g.progress[i] = 0;
  g.powered[i] = 0;
}
