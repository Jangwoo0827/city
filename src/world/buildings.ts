import { FACILITIES, FacilityDef } from '../data/catalog';
import { JobClass, ZONES, ZONE_BY_KIND } from '../data/zones';
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
  const def = ZONE_BY_KIND[kind];
  if (level <= 0 || !def) return { pop: 0, jobs: 0, tax: 0 };
  return { pop: def.pop[level], jobs: def.jobs[level], tax: def.tax * level };
}

/** 건물 일자리가 요구하는 학력 등급 (일자리가 없으면 null) */
export function jobClassOf(kind: number, level: number): JobClass | null {
  return ZONE_BY_KIND[kind]?.jobClass[level] ?? null;
}

export const KIND_NAME: Record<number, string> = {
  [K.EMPTY]: '빈 땅',
  [K.ROAD]: '도로',
  [K.FAC]: '시설',
  ...Object.fromEntries(ZONES.map((z) => [z.kind, `${z.name} 구역`])),
};

export const BUILDING_NAME: Record<number, string> = Object.fromEntries(ZONES.map((z) => [z.kind, z.building]));
