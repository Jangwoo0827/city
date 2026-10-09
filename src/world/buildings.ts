import { JOBS_PER_LEVEL, POP_PER_LEVEL, TAX_PER_LEVEL } from '../utils/constants';
import { Grid, K, Tile } from './grid';

export const PLANT_SIZE = 2;

export const plantFootprint = (ax: number, ay: number): Tile[] => {
  const out: Tile[] = [];
  for (let dy = 0; dy < PLANT_SIZE; dy++) for (let dx = 0; dx < PLANT_SIZE; dx++) out.push({ x: ax + dx, y: ay + dy });
  return out;
};

/** 타일이 속한 발전소의 앵커(좌상단) 좌표. 발전소가 아니면 null */
export function plantAnchorAt(g: Grid, x: number, y: number): Tile | null {
  if (!g.inBounds(x, y)) return null;
  const owner = g.plantOwner[g.idx(x, y)];
  if (!owner) return null;
  const i = owner - 1;
  return { x: i % g.size, y: Math.floor(i / g.size) };
}

export function plantAnchors(g: Grid): Tile[] {
  const out: Tile[] = [];
  for (let i = 0; i < g.count; i++) {
    if (g.plantOwner[i] === i + 1) out.push({ x: i % g.size, y: Math.floor(i / g.size) });
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
  [K.PLANT]: '발전소',
};

export const BUILDING_NAME: Record<number, string> = {
  [K.RES]: '주택',
  [K.COM]: '상점',
  [K.IND]: '공장',
};
