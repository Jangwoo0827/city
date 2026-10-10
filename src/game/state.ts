import { Grid } from '../world/grid';
import { generateTerrain } from '../world/terrain';
import { START_MONEY, START_SECTIONS, SECTIONS_PER_SIDE } from '../utils/constants';
import { START_DEV_POINTS, START_LOAN_LIMIT } from '../data/milestones';

export interface Stats {
  pop: number;
  workers: number;
  jobsC: number;
  jobsI: number;
  jobs: number;
  buildings: number;
  roads: number;
  facilities: number;
  /** 전력·상수·하수가 공급되는 건물 비율 */
  poweredRatio: number;
  wateredRatio: number;
  sewagedRatio: number;
  powerSupply: number;
  powerDemand: number;
  waterSupply: number;
  waterDemand: number;
  sewageCap: number;
  sewageDemand: number;
  /** 무처리 방류되는 하수량 */
  sewageUntreated: number;
  demandR: number;
  demandC: number;
  demandI: number;
  income: number;
  expense: number;
  /** 지출 내역 */
  upkeepRoads: number;
  upkeepFacilities: number;
  interest: number;
}

export type ToastKind = 'info' | 'good' | 'bad';

export interface GameEvents {
  toast: (message: string, kind: ToastKind) => void;
  gameover: () => void;
  reset: () => void;
  levelup: (level: number) => void;
}

export const emptyStats = (): Stats => ({
  pop: 0,
  workers: 0,
  jobsC: 0,
  jobsI: 0,
  jobs: 0,
  buildings: 0,
  roads: 0,
  facilities: 0,
  poweredRatio: 1,
  wateredRatio: 1,
  sewagedRatio: 1,
  powerSupply: 0,
  powerDemand: 0,
  waterSupply: 0,
  waterDemand: 0,
  sewageCap: 0,
  sewageDemand: 0,
  sewageUntreated: 0,
  demandR: 0,
  demandC: 0,
  demandI: 0,
  income: 0,
  expense: 0,
  upkeepRoads: 0,
  upkeepFacilities: 0,
  interest: 0,
});

export const DEFAULT_UNLOCKED = (): Set<string> => new Set<string>();

export class GameState {
  grid = new Grid();
  money = START_MONEY;
  /** 경과 틱 (1틱 = 게임 내 1일) */
  tick = 0;
  /** 0 = 일시정지, 1~3 = 배속 */
  speed = 1;
  gameOver = false;
  happiness = 50;
  happinessTarget = 50;
  stats: Stats = emptyStats();
  /** 공업 오염도 (타일별 0..1+) */
  pollution = new Float32Array(this.grid.count);

  /** 인구 100/500/2000 알림을 이미 띄운 목록 */
  popMilestones = new Set<number>();

  // ── 진행 ──
  xp = 0;
  /** 달성한 마일스톤 단계 (0 = 시작) */
  level = 0;
  devPoints = START_DEV_POINTS;
  /** 구매한 개발 트리 노드 */
  unlocked = DEFAULT_UNLOCKED();
  loan = 0;
  loanLimit = START_LOAN_LIMIT;
  /** 구획(16×16칸) 해금 여부, 4×4 */
  sections = new Uint8Array(SECTIONS_PER_SIDE * SECTIONS_PER_SIDE);

  // ── 상하수도 환경 ──
  /** 지하수 저장량 0..1 */
  groundwater = 1;
  /** 수질 오염도 0..1 */
  waterPollution = 0;
  /** 수질 경고를 이미 띄웠는지 (저장하지 않음) */
  waterWarned = false;

  /** 렌더러/시뮬레이션이 읽고 지우는 변경 플래그 */
  dirty = { roads: true, zones: true, buildings: true, net: true, sections: true };

  private listeners: { [K in keyof GameEvents]: GameEvents[K][] } = {
    toast: [],
    gameover: [],
    reset: [],
    levelup: [],
  };

  constructor() {
    generateTerrain(this.grid);
    this.resetSections();
  }

  on<K extends keyof GameEvents>(ev: K, cb: GameEvents[K]): void {
    this.listeners[ev].push(cb);
  }

  emit<K extends keyof GameEvents>(ev: K, ...args: Parameters<GameEvents[K]>): void {
    for (const cb of this.listeners[ev]) (cb as (...a: unknown[]) => void)(...args);
  }

  toast(message: string, kind: ToastKind = 'info'): void {
    this.emit('toast', message, kind);
  }

  markAllDirty(): void {
    this.dirty.roads = this.dirty.zones = this.dirty.buildings = this.dirty.net = this.dirty.sections = true;
  }

  resetSections(): void {
    this.sections.fill(0);
    for (const i of START_SECTIONS) this.sections[i] = 1;
  }

  /** 해당 타일이 해금된 구획 안에 있는가 */
  isUnlockedAt(x: number, y: number): boolean {
    if (!this.grid.inBounds(x, y)) return false;
    const sx = Math.floor(x / 16);
    const sy = Math.floor(y / 16);
    return this.sections[sy * SECTIONS_PER_SIDE + sx] === 1;
  }

  /** 새 게임으로 초기화 */
  reset(): void {
    this.grid.clear();
    generateTerrain(this.grid);
    this.money = START_MONEY;
    this.tick = 0;
    this.speed = 1;
    this.gameOver = false;
    this.happiness = 50;
    this.happinessTarget = 50;
    this.stats = emptyStats();
    this.pollution.fill(0);
    this.popMilestones.clear();
    this.xp = 0;
    this.level = 0;
    this.devPoints = START_DEV_POINTS;
    this.unlocked = DEFAULT_UNLOCKED();
    this.loan = 0;
    this.loanLimit = START_LOAN_LIMIT;
    this.groundwater = 1;
    this.waterPollution = 0;
    this.resetSections();
    this.markAllDirty();
    this.emit('reset');
  }
}
