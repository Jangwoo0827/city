import { JOBS_PER_LEVEL, POP_PER_LEVEL, TAX_PER_LEVEL } from '../utils/constants';
import { FACILITIES, FacilityDef } from '../data/catalog';
import { Grid, K, Tile } from './grid';

/** 시설 풋프린트 (앵커 = 좌상단) */
export const facilityFootprint = (def: FacilityDef, ax: number, ay: number): Tile[] => {
  const out: Tile[] = [];
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) out.push({ x: ax + dx, y: ay + dy });
  return out;
};

export interface FacilityAt {
  x: number;
  y: number;
  def: FacilityDef;
}

/** 타일이 속한 시설(앵커 좌표 + 정의). 시설이 아니면 null */
export function facilityAt(g: Grid, x: number, y: number): FacilityAt | null {
  if (!g.inBounds(x, y)) return null;
  const i = g.idx(x, y);
  const owner = g.owner[i];
  if (!owner || g.kind[i] !== K.FAC) return null;
  const a = owner - 1;
  const def = FACILITIES[g.fac[a]];
  if (!def) return null;
  return { x: a % g.size, y: Math.floor(a / g.size), def };
}

export function facilityList(g: Grid): FacilityAt[] {
  const out: FacilityAt[] = [];
  for (let i = 0; i < g.count; i++) {
    if (g.kind[i] === K.FAC && g.owner[i] === i + 1) {
      const def = FACILITIES[g.fac[i]];
      if (def) out.push({ x: i % g.size, y: Math.floor(i / g.size), def });
    }
  }
  return out;
}

/** 건물 한 채의 인구 / 일자리 / 기본 세금 */
export function buildingStats(kind: number, level: number): { pop: number; jobs: number; tax: number } {
  if (level <= 0) return { pop: 0, jobs: 0, tax: 0 };
  switch (kind) {
    case K.RES:
      return { pop: POP_PER_LEVEL[level], jobs: 0, tax: TAX_PER_LEVEL.R * level };
    case K.COM:
      return { pop: 0, jobs: JOBS_PER_LEVEL.C[level], tax: TAX_PER_LEVEL.C * level };
    case K.IND:
      return { pop: 0, jobs: JOBS_PER_LEVEL.I[level], tax: TAX_PER_LEVEL.I * level };
    default:
      return { pop: 0, jobs: 0, tax: 0 };
  }
}

export const KIND_NAME: Record<number, string> = {
  [K.EMPTY]: '빈 땅',
  [K.ROAD]: '도로',
  [K.RES]: '주거 구역',
  [K.COM]: '상업 구역',
  [K.IND]: '공업 구역',
  [K.FAC]: '시설',
};

export const BUILDING_NAME: Record<number, string> = {
  [K.RES]: '주택',
  [K.COM]: '상점',
  [K.IND]: '공장',
};
