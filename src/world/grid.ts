import { GRID_SIZE } from '../utils/constants';

/** 타일 종류 */
export const K = {
  EMPTY: 0,
  ROAD: 1,
  RES: 2, // 주거 구역
  COM: 3, // 상업 구역
  IND: 4, // 공업 구역
  PLANT: 5, // 발전소 (2x2)
} as const;
export type Kind = (typeof K)[keyof typeof K];
export type ZoneKind = typeof K.RES | typeof K.COM | typeof K.IND;

export const isZoneKind = (k: number): k is ZoneKind => k === K.RES || k === K.COM || k === K.IND;

/** 4방향: 북(-y) 동(+x) 남(+y) 서(-x) — 비트마스크 1,2,4,8 */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export interface Tile {
  x: number;
  y: number;
}

export class Grid {
  readonly size = GRID_SIZE;
  readonly count = GRID_SIZE * GRID_SIZE;

  kind = new Uint8Array(this.count);
  /** 구역 위 건물 레벨 (0 = 아직 건물 없음) */
  level = new Uint8Array(this.count);
  /** 다음 레벨로의 성장 진행도 0..1 */
  progress = new Float32Array(this.count);
  /** 건물 외형 변주 (색 편차 등) */
  variant = new Uint8Array(this.count);
  /** 전력 공급 여부 (도로·구역·발전소 공통) */
  powered = new Uint8Array(this.count);
  /** 발전소 타일이면 앵커(좌상단) 인덱스+1, 아니면 0 */
  plantOwner = new Int32Array(this.count);

  idx(x: number, y: number): number {
    return y * this.size + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  kindAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.kind[this.idx(x, y)] : -1;
  }

  clear(): void {
    this.kind.fill(0);
    this.level.fill(0);
    this.progress.fill(0);
    this.variant.fill(0);
    this.powered.fill(0);
    this.plantOwner.fill(0);
  }
}
