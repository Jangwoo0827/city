import { ZONES, ZONE_BY_KIND, ZoneId } from '../data/zones';
import { Tile, ZoneKind } from './grid';

export type ZoneType = ZoneId;

export const ZONE_KIND: Record<ZoneType, ZoneKind> = Object.fromEntries(ZONES.map((z) => [z.id, z.kind])) as Record<ZoneType, ZoneKind>;

export const ZONE_NAME: Record<ZoneType, string> = Object.fromEntries(ZONES.map((z) => [z.id, z.name])) as Record<ZoneType, string>;

export function zoneTypeOfKind(kind: number): ZoneType | null {
  return ZONE_BY_KIND[kind]?.id ?? null;
}

/** 두 모서리로 정의되는 사각형 영역의 모든 타일 */
export function rectTiles(a: Tile, b: Tile): Tile[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const out: Tile[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y });
  return out;
}
