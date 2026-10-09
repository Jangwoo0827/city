import { K, Tile, ZoneKind } from './grid';

export type ZoneType = 'R' | 'C' | 'I';

export const ZONE_KIND: Record<ZoneType, ZoneKind> = { R: K.RES, C: K.COM, I: K.IND };

export const ZONE_NAME: Record<ZoneType, string> = { R: '주거', C: '상업', I: '공업' };

export function zoneTypeOfKind(kind: number): ZoneType | null {
  if (kind === K.RES) return 'R';
  if (kind === K.COM) return 'C';
  if (kind === K.IND) return 'I';
  return null;
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
