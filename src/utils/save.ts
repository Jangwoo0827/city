import { GameState } from '../game/state';
import { refreshStats } from '../game/simulation';
import { LEGACY_GRID_SIZE, LEGACY_OFFSET, SAVE_KEY, SECTION_SIZE, SECTIONS_PER_SIDE, START_SECTIONS } from './constants';
import { clamp } from './math';
import { K } from '../world/grid';
import { facilityFootprint, facilityList } from '../world/buildings';
import { FAC, FACILITIES } from '../data/catalog';
import { MAX_MILESTONE, MILESTONES_20, START_DEV_POINTS, START_LOAN_LIMIT } from '../data/milestones';

/** 저장 포맷 버전 2 */
export interface SaveV2 {
  v: 2;
  money: number;
  tick: number;
  speed: number;
  happiness: number;
  popMilestones: number[];
  xp: number;
  level: number;
  devPoints: number;
  unlocked: string[];
  loan: number;
  loanLimit: number;
  sections: number[];
  groundwater: number;
  waterPollution: number;
  kind: string;
  lvl: string;
  progress: string;
  variant: string;
  roadType: string;
  /** [x, y, 시설 id] 반복 */
  facilities: number[];
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

/** 예전 64×64 레이어를 새 맵 중앙에 놓는다 */
function embedLegacy(src: Uint8Array, size: number): Uint8Array {
  const dst = new Uint8Array(size * size);
  for (let y = 0; y < LEGACY_GRID_SIZE; y++) {
    for (let x = 0; x < LEGACY_GRID_SIZE; x++) {
      dst[(y + LEGACY_OFFSET) * size + x + LEGACY_OFFSET] = src[y * LEGACY_GRID_SIZE + x];
    }
  }
  return dst;
}

/** 저장된 레이어를 현재 맵 크기로 복원 (예전 64×64 저장이면 중앙에 배치) */
function decodeLayer(b64: string, count: number, size: number): { data: Uint8Array; legacy: boolean } {
  const len = atob(b64).length;
  if (len === count) return { data: fromB64(b64, count), legacy: false };
  if (len === LEGACY_GRID_SIZE * LEGACY_GRID_SIZE) return { data: embedLegacy(fromB64(b64, len), size), legacy: true };
  throw new Error('save length mismatch');
}

export function serializeGame(s: GameState): SaveV2 {
  const g = s.grid;
  const progress = new Uint8Array(g.count);
  for (let i = 0; i < g.count; i++) progress[i] = Math.round(clamp(g.progress[i], 0, 1) * 255);
  // 시설 타일은 목록으로만 저장
  const kind = g.kind.slice();
  for (let i = 0; i < g.count; i++) if (kind[i] === K.FAC) kind[i] = K.EMPTY;
  const facilities: number[] = [];
  for (const f of facilityList(g)) facilities.push(f.x, f.y, f.def.id);
  return {
    v: 2,
    money: s.money,
    tick: s.tick,
    speed: s.speed,
    happiness: s.happiness,
    popMilestones: [...s.popMilestones],
    xp: s.xp,
    level: s.level,
    devPoints: s.devPoints,
    unlocked: [...s.unlocked],
    loan: s.loan,
    loanLimit: s.loanLimit,
    sections: [...s.sections],
    groundwater: s.groundwater,
    waterPollution: s.waterPollution,
    kind: toB64(kind),
    lvl: toB64(g.level),
    progress: toB64(progress),
    variant: toB64(g.variant),
    roadType: toB64(g.roadType),
    facilities,
    savedAt: Date.now(),
  };
}

interface SaveV1 {
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
  plants: number[];
}

/** v1(발전소 1종, 구획·진행 없음) → v2 변환 */
function migrateV1(d: SaveV1): SaveV2 {
  const count = LEGACY_GRID_SIZE * LEGACY_GRID_SIZE;
  const level = fromB64(d.level, count);
  const kind = fromB64(d.kind, count);
  const size = LEGACY_GRID_SIZE;
  // 건물이 있는 구획은 모두 열어 준다 (예전 4×4 구획 기준; 로드할 때 새 맵 좌표로 옮겨짐)
  const legacySide = LEGACY_GRID_SIZE / SECTION_SIZE;
  const sections = new Array<number>(legacySide * legacySide).fill(0);
  for (const i of [5, 6, 9, 10]) sections[i] = 1;
  let xp = 0;
  for (let i = 0; i < count; i++) {
    const x = i % size;
    const y = (i / size) | 0;
    if (kind[i] !== K.EMPTY) sections[Math.floor(y / SECTION_SIZE) * legacySide + Math.floor(x / SECTION_SIZE)] = 1;
    if (level[i] > 0) xp += 10 + 20 * level[i];
  }
  // 기존 도시의 규모에 맞는 마일스톤/포인트를 지급 (현금 보상은 제외)
  let lv = 0;
  let dev = START_DEV_POINTS;
  let loanLimit = START_LOAN_LIMIT;
  while (lv < MAX_MILESTONE && xp >= MILESTONES_20[lv].xp) {
    dev += MILESTONES_20[lv].devPoints;
    loanLimit = MILESTONES_20[lv].loanLimit;
    lv++;
  }
  const facilities: number[] = [];
  for (let n = 0; n + 1 < d.plants.length; n += 2) facilities.push(d.plants[n], d.plants[n + 1], FAC.COAL);
  const roadType = new Uint8Array(count);
  return {
    v: 2,
    money: d.money,
    tick: d.tick,
    speed: d.speed,
    happiness: d.happiness,
    popMilestones: d.milestones ?? [],
    xp,
    level: lv,
    devPoints: dev,
    unlocked: facilities.length > 0 ? ['fac_coal'] : [],
    loan: 0,
    loanLimit,
    sections,
    groundwater: 1,
    waterPollution: 0,
    kind: d.kind,
    lvl: d.level,
    progress: d.progress,
    variant: d.variant,
    roadType: toB64(roadType),
    facilities,
    savedAt: Date.now(),
  };
}

/** 저장 데이터를 상태에 적용한다. 실패하면 false (상태는 변경하지 않음) */
export function deserializeGame(s: GameState, raw: unknown): boolean {
  try {
    const g = s.grid;
    let d = raw as SaveV2 | SaveV1;
    if (d.v === 1) d = migrateV1(d);
    if (d.v !== 2) return false;
    const kindL = decodeLayer(d.kind, g.count, g.size);
    const legacy = kindL.legacy;
    const kind = kindL.data;
    const lvl = decodeLayer(d.lvl, g.count, g.size).data;
    const progress = decodeLayer(d.progress, g.count, g.size).data;
    const variant = decodeLayer(d.variant, g.count, g.size).data;
    const roadType = decodeLayer(d.roadType, g.count, g.size).data;
    if (!Number.isFinite(d.money) || !Number.isFinite(d.tick)) return false;

    g.clear();
    for (let i = 0; i < g.count; i++) {
      const k = kind[i];
      g.kind[i] = k >= K.FAC ? K.EMPTY : k;
      g.level[i] = g.kind[i] >= K.RES ? Math.min(3, lvl[i]) : 0;
      g.progress[i] = progress[i] / 255;
      g.variant[i] = variant[i];
      g.roadType[i] = g.kind[i] === K.ROAD ? Math.min(2, roadType[i]) : 0;
    }
    for (let n = 0; n + 2 < d.facilities.length; n += 3) {
      const ax = d.facilities[n] + (legacy ? LEGACY_OFFSET : 0);
      const ay = d.facilities[n + 1] + (legacy ? LEGACY_OFFSET : 0);
      const def = FACILITIES[d.facilities[n + 2]];
      if (!def) continue;
      const foot = facilityFootprint(def, ax, ay);
      if (!foot.every((t) => g.inBounds(t.x, t.y))) continue;
      for (const t of foot) {
        const i = g.idx(t.x, t.y);
        g.kind[i] = K.FAC;
        g.level[i] = 0;
        g.owner[i] = g.idx(ax, ay) + 1;
        g.fac[i] = def.id;
      }
    }

    s.money = d.money;
    s.tick = Math.max(0, Math.floor(d.tick));
    s.speed = clamp(Math.floor(d.speed), 0, 3);
    s.gameOver = false;
    s.happiness = clamp(d.happiness, 0, 100);
    s.happinessTarget = s.happiness;
    s.popMilestones = new Set(d.popMilestones);
    s.xp = d.xp;
    s.level = clamp(Math.floor(d.level), 0, MAX_MILESTONE);
    s.devPoints = d.devPoints;
    s.unlocked = new Set(d.unlocked);
    s.loan = d.loan;
    s.loanLimit = d.loanLimit;
    s.sections.fill(0);
    if (legacy) {
      // 예전 4×4 구획 → 새 8×8 구획 중앙으로 이동
      const legacySide = LEGACY_GRID_SIZE / SECTION_SIZE;
      const so = LEGACY_OFFSET / SECTION_SIZE;
      d.sections.forEach((v, i) => {
        if (!v) return;
        const sx = (i % legacySide) + so;
        const sy = Math.floor(i / legacySide) + so;
        s.sections[sy * SECTIONS_PER_SIDE + sx] = 1;
      });
    } else {
      d.sections.forEach((v, i) => {
        if (i < s.sections.length) s.sections[i] = v ? 1 : 0;
      });
    }
    for (const i of START_SECTIONS) s.sections[i] = 1;
    s.groundwater = clamp(d.groundwater, 0, 1);
    s.waterPollution = clamp(d.waterPollution, 0, 1);
    s.markAllDirty();
    s.emit('reset');
    refreshStats(s);
    return true;
  } catch {
    return false;
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame(s: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeGame(s)));
    return true;
  } catch {
    return false;
  }
}

/** 저장된 도시를 복원한다. 저장이 없거나 손상되었으면 false */
export function loadGame(s: GameState): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    return deserializeGame(s, JSON.parse(raw));
  } catch {
    return false;
  }
}
