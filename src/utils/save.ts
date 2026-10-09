import { GameState } from '../game/state';
import { refreshStats } from '../game/simulation';
import { SAVE_KEY } from './constants';
import { clamp } from './math';
import { K } from '../world/grid';
import { plantAnchors, plantFootprint } from '../world/buildings';

interface SaveData {
  v: 1;
  money: number;
  tick: number;
  speed: number;
  happiness: number;
  milestones: number[];
  kind: string;
  level: string;
  progress: string;
  variant: string;
  plants: number[]; // [x0, y0, x1, y1, ...] 발전소 앵커
  savedAt: number;
}

const toB64 = (a: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < a.length; i += 0x2000) s += String.fromCharCode(...a.subarray(i, i + 0x2000));
  return btoa(s);
};

const fromB64 = (b64: string, expected: number): Uint8Array => {
  const s = atob(b64);
  if (s.length !== expected) throw new Error('save length mismatch');
  const a = new Uint8Array(expected);
  for (let i = 0; i < expected; i++) a[i] = s.charCodeAt(i);
  return a;
};

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame(s: GameState): boolean {
  try {
    const g = s.grid;
    const progress = new Uint8Array(g.count);
    for (let i = 0; i < g.count; i++) progress[i] = Math.round(clamp(g.progress[i], 0, 1) * 255);
    const plants: number[] = [];
    for (const a of plantAnchors(g)) plants.push(a.x, a.y);
    const data: SaveData = {
      v: 1,
      money: s.money,
      tick: s.tick,
      speed: s.speed,
      happiness: s.happiness,
      milestones: [...s.milestones],
      kind: toB64(g.kind),
      level: toB64(g.level),
      progress: toB64(progress),
      variant: toB64(g.variant),
      plants,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** 저장된 도시를 복원한다. 저장이 없거나 손상되었으면 false (상태는 변경하지 않음) */
export function loadGame(s: GameState): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw) as SaveData;
    if (d.v !== 1) return false;
    const g = s.grid;
    const kind = fromB64(d.kind, g.count);
    const level = fromB64(d.level, g.count);
    const progress = fromB64(d.progress, g.count);
    const variant = fromB64(d.variant, g.count);
    if (!Number.isFinite(d.money) || !Number.isFinite(d.tick)) return false;

    g.clear();
    for (let i = 0; i < g.count; i++) {
      const k = kind[i];
      // 발전소 타일은 앵커 목록으로 복원하므로 건너뜀
      g.kind[i] = k === K.PLANT || k > K.PLANT ? K.EMPTY : k;
      g.level[i] = g.kind[i] >= K.RES ? Math.min(3, level[i]) : 0;
      g.progress[i] = progress[i] / 255;
      g.variant[i] = variant[i];
    }
    for (let n = 0; n + 1 < d.plants.length; n += 2) {
      const ax = d.plants[n];
      const ay = d.plants[n + 1];
      const foot = plantFootprint(ax, ay);
      if (!foot.every((t) => g.inBounds(t.x, t.y))) continue;
      for (const t of foot) {
        const i = g.idx(t.x, t.y);
        g.kind[i] = K.PLANT;
        g.level[i] = 0;
        g.plantOwner[i] = g.idx(ax, ay) + 1;
      }
    }

    s.money = d.money;
    s.tick = Math.max(0, Math.floor(d.tick));
    s.speed = clamp(Math.floor(d.speed), 0, 3);
    s.gameOver = false;
    s.happiness = clamp(d.happiness, 0, 100);
    s.happinessTarget = s.happiness;
    s.milestones = new Set(d.milestones);
    s.markAllDirty();
    s.emit('reset');
    refreshStats(s);
    return true;
  } catch {
    return false;
  }
}
