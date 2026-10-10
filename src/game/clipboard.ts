import { FACILITIES, ROAD_TYPES } from '../data/catalog';
import { K, Tile, isZoneKind } from '../world/grid';
import { facilityFootprint } from '../world/buildings';
import { ZoneType, zoneTypeOfKind } from '../world/zones';
import { GameState } from './state';
import { ToolOptions, ActionResult, Preview, PreviewTile, commitTile, finishEdit, planFacility, planRoad, planZone } from './actions';

/**
 * 복사·붙여넣기: 영역의 도로(종류 포함)·구역(종류만, 건물은 제외)·시설을 복사해
 * 다른 곳에 비용을 내고 다시 설치한다. 붙여넣기 위치는 클립보드의 중앙을 커서에 맞춘다.
 */

export interface ClipItem {
  dx: number;
  dy: number;
  type: 'road' | 'zone' | 'fac';
  roadType?: number;
  zone?: ZoneType;
  fac?: number;
}

export interface Clip {
  w: number;
  h: number;
  items: ClipItem[];
  /** 붙여넣을 도로로 구역 접근이 가능해지는 칸 (클립보드 좌표 + REACH_PAD 여백) */
  reach: Uint8Array;
}

const REACH_PAD = 6;

const ORDER: Record<ClipItem['type'], number> = { road: 0, zone: 1, fac: 2 };

function buildReach(w: number, h: number, items: ClipItem[]): Uint8Array {
  const rw = w + 2 * REACH_PAD;
  const rh = h + 2 * REACH_PAD;
  const reach = new Uint8Array(rw * rh);
  for (const it of items) {
    if (it.type !== 'road') continue;
    const depth = ROAD_TYPES[it.roadType ?? 0]?.depth ?? 4;
    for (let oy = -depth; oy <= depth; oy++) {
      const rem = depth - Math.abs(oy);
      for (let ox = -rem; ox <= rem; ox++) {
        const x = it.dx + ox + REACH_PAD;
        const y = it.dy + oy + REACH_PAD;
        if (x >= 0 && y >= 0 && x < rw && y < rh) reach[y * rw + x] = 1;
      }
    }
  }
  return reach;
}

function makeClip(w: number, h: number, items: ClipItem[]): Clip {
  items.sort((a, b) => ORDER[a.type] - ORDER[b.type]);
  return { w, h, items, reach: buildReach(w, h, items) };
}

/** 두 모서리로 정한 영역을 복사한다. 복사할 것이 없으면 null */
export function copyArea(s: GameState, a: Tile, b: Tile): Clip | null {
  const g = s.grid;
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const items: ClipItem[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!g.inBounds(x, y)) continue;
      const i = g.idx(x, y);
      const k = g.kind[i];
      if (k === K.ROAD) {
        items.push({ dx: x - x0, dy: y - y0, type: 'road', roadType: g.roadType[i] });
      } else if (isZoneKind(k)) {
        const zone = zoneTypeOfKind(k);
        if (zone) items.push({ dx: x - x0, dy: y - y0, type: 'zone', zone });
      } else if (k === K.FAC && g.owner[i] === i + 1) {
        const def = FACILITIES[g.fac[i]];
        // 영역 안에 통째로 들어오는 시설만
        if (def && x + def.w - 1 <= x1 && y + def.h - 1 <= y1) items.push({ dx: x - x0, dy: y - y0, type: 'fac', fac: def.id });
      }
    }
  }
  if (items.length === 0) return null;
  return makeClip(x1 - x0 + 1, y1 - y0 + 1, items);
}

/** 시계 방향 90° 회전 (시설은 모두 정사각형이라 앵커만 옮기면 된다) */
export function rotateClip(c: Clip): Clip {
  const items = c.items.map((it): ClipItem => {
    const size = it.type === 'fac' ? FACILITIES[it.fac!].h : 1;
    return { ...it, dx: c.h - 1 - (it.dy + size - 1), dy: it.dx };
  });
  return makeClip(c.h, c.w, items);
}

/** 커서(hover)가 클립보드 중앙에 오도록 한 좌상단 원점 */
export const pasteOrigin = (c: Clip, hover: Tile): Tile => ({ x: hover.x - Math.floor(c.w / 2), y: hover.y - Math.floor(c.h / 2) });

interface PasteOp {
  type: ClipItem['type'];
  tile: Tile;
  cost: number;
  roadType?: number;
  zone?: ZoneType;
  fac?: number;
}

interface PastePlan {
  tiles: PreviewTile[];
  ops: PasteOp[];
  cost: number;
}

function planPaste(s: GameState, clip: Clip, hover: Tile): PastePlan {
  const g = s.grid;
  const o = pasteOrigin(clip, hover);
  const rw = clip.w + 2 * REACH_PAD;
  const reachAt = (x: number, y: number): boolean => {
    const rx = x - o.x + REACH_PAD;
    const ry = y - o.y + REACH_PAD;
    return rx >= 0 && ry >= 0 && rx < rw && ry < clip.h + 2 * REACH_PAD && clip.reach[ry * rw + rx] === 1;
  };
  const tiles: PreviewTile[] = [];
  const ops: PasteOp[] = [];
  let cost = 0;
  for (const it of clip.items) {
    const t = { x: o.x + it.dx, y: o.y + it.dy };
    const foot = it.type === 'fac' ? facilityFootprint(FACILITIES[it.fac!], t.x, t.y) : [t];
    if (!g.inBounds(t.x, t.y)) continue;
    const plan =
      it.type === 'road'
        ? planRoad(s, it.roadType ?? 0, t, t)
        : it.type === 'zone'
          ? planZone(s, it.zone!, t, t, reachAt)
          : planFacility(s, it.fac!, t, t);
    if (plan.blocked || plan.tiles.length === 0) {
      // 해금되지 않은 항목: 빨간 칸으로만 표시
      for (const f of foot) if (g.inBounds(f.x, f.y)) tiles.push({ ...f, ok: false });
      continue;
    }
    tiles.push(...plan.tiles);
    if (plan.placeable.length > 0) {
      ops.push({ type: it.type, tile: plan.placeable[0], cost: plan.costs[0], roadType: it.roadType, zone: it.zone, fac: it.fac });
      cost += plan.costs[0];
    }
  }
  return { tiles, ops, cost };
}

/** 붙여넣기 미리보기 */
export function previewPaste(s: GameState, clip: Clip, hover: Tile): Preview {
  const plan = planPaste(s, clip, hover);
  const affordable = plan.cost <= s.money;
  const bad = plan.tiles.filter((t) => !t.ok).length;
  let label = `붙여넣기 ${plan.ops.length}개 · ₩${plan.cost.toLocaleString('ko-KR')}`;
  if (bad > 0) label += ` (${bad}칸 불가)`;
  if (!affordable && plan.ops.length > 0) label += ' (자금 부족)';
  if (plan.ops.length === 0) label = '붙여넣을 수 있는 곳이 없습니다';
  return {
    tiles: plan.tiles.map((t) => (affordable ? t : { ...t, ok: false })),
    cost: plan.cost,
    label,
    neutral: false,
    affordable,
  };
}

/** 붙여넣기 실행: 도로 → 구역 → 시설 순서로 설치한다 */
export function applyPaste(s: GameState, clip: Clip, hover: Tile): ActionResult {
  if (s.gameOver) return { ok: false, placed: 0 };
  const plan = planPaste(s, clip, hover);
  if (plan.ops.length === 0) return { ok: false, placed: 0, message: '여기에는 붙여넣을 수 없습니다' };
  let placed = 0;
  let xp = 0;
  let broke = false;
  for (const op of plan.ops) {
    if (op.cost > 0 && s.money < op.cost) {
      broke = true;
      break;
    }
    const o: ToolOptions = {
      zone: op.zone ?? 'R',
      facility: op.fac ?? 1,
      roadType: op.roadType ?? 0,
      terrain: 'dig',
      width: 1,
    };
    xp += commitTile(s, op.type === 'fac' ? 'facility' : op.type, o, op.tile);
    s.money -= op.cost;
    placed++;
  }
  if (placed > 0) finishEdit(s, xp);
  if (broke) s.toast('자금이 부족해 일부만 붙여넣었습니다', 'bad');
  return { ok: placed > 0, placed };
}
