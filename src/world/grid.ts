import { GRID_SIZE, SECTION_SIZE, SECTIONS_PER_SIDE } from '../utils/constants';

/** 타일 종류 */
export const K = {
  EMPTY: 0,
  ROAD: 1,
  RES: 2, // 주거 구역
  COM: 3, // 상업 구역
  IND: 4, // 공업 구역
  FAC: 5, // 시설 (발전소·상하수도 등, 크기는 시설 정의에 따름)
  OFF: 6, // 사무 구역
  RESH: 7, // 고밀 주거 구역
  COMH: 8, // 고밀 상업 구역
} as const;
export type Kind = (typeof K)[keyof typeof K];
export type ZoneKind = typeof K.RES | typeof K.COM | typeof K.IND | typeof K.OFF | typeof K.RESH | typeof K.COMH;

/** 구역(건물이 자라는 타일) 종류인가 */
export const isZoneKind = (k: number): k is ZoneKind => k === K.RES || k === K.COM || k === K.IND || k >= K.OFF;

/** 주민이 사는 구역 (저밀·고밀 주거) */
export const isResidentialKind = (k: number): boolean => k === K.RES || k === K.RESH;

/** 지형 */
export const T = { LAND: 0, WATER: 1 } as const;

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

export const sectionIndex = (x: number, y: number): number =>
  Math.floor(y / SECTION_SIZE) * SECTIONS_PER_SIDE + Math.floor(x / SECTION_SIZE);

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
  /** 시설 타일이면 앵커(좌상단) 인덱스+1, 아니면 0 */
  owner = new Int32Array(this.count);
  /** 시설 타일의 시설 종류(FAC id) */
  fac = new Uint8Array(this.count);
  /** 도로 타일의 도로 종류(ROAD_TYPES id) */
  roadType = new Uint8Array(this.count);
  /** 지형 (T.LAND / T.WATER) — 맵 생성 시 채워지고 저장하지 않음 */
  terrain = new Uint8Array(this.count);
  /** 물 타일 근처(수변)인가 — 맵 생성 시 계산, 저장하지 않음 */
  waterNear = new Uint8Array(this.count);
  /** 폐허가 된 건물 (1 = 폐허) */
  abandoned = new Uint8Array(this.count);
  /** 서비스 끊김이 이어진 틱 수 (폐허 판정용, 저장하지 않음) */
  neglect = new Uint8Array(this.count);
  /** 땅값 0..100 (매 틱 계산, 저장하지 않음) */
  landValue = new Float32Array(this.count);

  // ── 매 틱/변경 시 계산되는 값 (저장하지 않음) ──
  /** 전력·상수·하수가 공급되는 타일 (도로/구역/시설) */
  powered = new Uint8Array(this.count);
  watered = new Uint8Array(this.count);
  sewered = new Uint8Array(this.count);
  /** 이 타일(구역)이 접근할 수 있는 가장 가까운 도로 타일 인덱스, 없으면 -1 */
  access = new Int32Array(this.count).fill(-1);

  idx(x: number, y: number): number {
    return y * this.size + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  kindAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.kind[this.idx(x, y)] : -1;
  }

  isWater(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.terrain[this.idx(x, y)] === T.WATER;
  }

  /** 건설 데이터만 비운다 (지형은 유지) */
  clear(): void {
    this.kind.fill(0);
    this.level.fill(0);
    this.progress.fill(0);
    this.variant.fill(0);
    this.owner.fill(0);
    this.fac.fill(0);
    this.roadType.fill(0);
    this.powered.fill(0);
    this.watered.fill(0);
    this.sewered.fill(0);
    this.access.fill(-1);
    this.abandoned.fill(0);
    this.neglect.fill(0);
    this.landValue.fill(0);
  }
}
