import { Grid } from '../world/grid';
import { START_MONEY } from '../utils/constants';

export interface Stats {
  pop: number;
  workers: number;
  jobsC: number;
  jobsI: number;
  jobs: number;
  buildings: number;
  roads: number;
  plants: number;
  poweredRatio: number;
  demandR: number;
  demandC: number;
  demandI: number;
  income: number;
  expense: number;
}

export type ToastKind = 'info' | 'good' | 'bad';

export interface GameEvents {
  toast: (message: string, kind: ToastKind) => void;
  gameover: () => void;
  reset: () => void;
}

const emptyStats = (): Stats => ({
  pop: 0,
  workers: 0,
  jobsC: 0,
  jobsI: 0,
  jobs: 0,
  buildings: 0,
  roads: 0,
  plants: 0,
  poweredRatio: 1,
  demandR: 0,
  demandC: 0,
  demandI: 0,
  income: 0,
  expense: 0,
});

export class GameState {
  grid = new Grid();
  money = START_MONEY;
  /** 경과 틱 (1틱 = 게임 내 1일) */
  tick = 0;
  /** 0 = 일시정지, 1~3 = 배속 */
  speed = 1;
  gameOver = false;
  happiness = 50;
  stats: Stats = emptyStats();
  milestones = new Set<number>();
  /** 공업 오염도 (타일별 0..1+) */
  pollution = new Float32Array(this.grid.count);

  /** 렌더러가 읽고 지우는 변경 플래그 */
  dirty = { roads: true, zones: true, buildings: true, power: true };

  private listeners: { [K in keyof GameEvents]: GameEvents[K][] } = {
    toast: [],
    gameover: [],
    reset: [],
  };

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
    this.dirty.roads = this.dirty.zones = this.dirty.buildings = this.dirty.power = true;
  }

  /** 새 게임으로 초기화 */
  reset(): void {
    this.grid.clear();
    this.money = START_MONEY;
    this.tick = 0;
    this.speed = 1;
    this.gameOver = false;
    this.happiness = 50;
    this.stats = emptyStats();
    this.milestones.clear();
    this.pollution.fill(0);
    this.markAllDirty();
    this.emit('reset');
  }
}
