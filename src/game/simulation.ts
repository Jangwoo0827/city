import {
  BANKRUPT_LIMIT,
  GROWTH,
  HAPPINESS,
  MAX_LEVEL,
  MILESTONES,
  WORKER_RATIO,
} from '../utils/constants';
import { clamp, lerp } from '../utils/math';
import { K, isZoneKind } from '../world/grid';
import { hasAdjacentRoad } from '../world/roads';
import { buildingStats } from '../world/buildings';
import { GameState } from './state';
import { computePower } from './power';
import { computeDemand } from './demand';
import { computeEconomy } from './economy';

/** 공업 건물이 주변 타일에 퍼뜨리는 오염도 맵 */
function computePollution(s: GameState): void {
  const g = s.grid;
  const p = s.pollution;
  p.fill(0);
  const R = HAPPINESS.pollutionRadius;
  for (let i = 0; i < g.count; i++) {
    if (g.kind[i] !== K.IND || g.level[i] === 0) continue;
    const x = i % g.size;
    const y = (i / g.size) | 0;
    const strength = 0.25 + 0.15 * g.level[i];
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!g.inBounds(nx, ny)) continue;
        const d = Math.hypot(dx, dy);
        if (d > R + 0.5) continue;
        p[g.idx(nx, ny)] += strength * (1 - d / (R + 1));
      }
    }
  }
}

/** 인구/일자리/전력/수요/행복도 목표치 등 집계 */
export function refreshStats(s: GameState): void {
  if (s.dirty.power) {
    s.dirty.power = false;
    computePower(s);
  }
  computePollution(s);

  const g = s.grid;
  const st = s.stats;
  let pop = 0;
  let jobsC = 0;
  let jobsI = 0;
  let buildings = 0;
  let poweredBuildings = 0;
  let roads = 0;
  let plants = 0;
  let resLevels = 0;
  let pollutedLevels = 0;

  for (let i = 0; i < g.count; i++) {
    const k = g.kind[i];
    if (k === K.ROAD) roads++;
    else if (k === K.PLANT) {
      if (g.plantOwner[i] === i + 1) plants++;
    } else if (isZoneKind(k) && g.level[i] > 0) {
      buildings++;
      if (g.powered[i]) poweredBuildings++;
      const b = buildingStats(k, g.level[i]);
      pop += b.pop;
      if (k === K.COM) jobsC += b.jobs;
      else if (k === K.IND) jobsI += b.jobs;
      if (k === K.RES) {
        resLevels += g.level[i];
        pollutedLevels += g.level[i] * Math.min(1, s.pollution[i]);
      }
    }
  }

  st.pop = pop;
  st.workers = Math.round(pop * WORKER_RATIO);
  st.jobsC = jobsC;
  st.jobsI = jobsI;
  st.jobs = jobsC + jobsI;
  st.buildings = buildings;
  st.roads = roads;
  st.plants = plants;
  st.poweredRatio = buildings > 0 ? poweredBuildings / buildings : 1;

  // 행복도 목표치
  const polluted = resLevels > 0 ? pollutedLevels / resLevels : 0;
  const unemployment = st.workers > 0 ? Math.max(0, st.workers - st.jobs) / st.workers : 0;
  const surplus = st.jobs > st.workers ? Math.min(1, (st.jobs - st.workers) / Math.max(1, st.jobs)) : 0;
  s.happinessTarget = clamp(
    HAPPINESS.base -
      HAPPINESS.noPowerPenalty * (1 - st.poweredRatio) -
      HAPPINESS.pollutionPenalty * polluted -
      HAPPINESS.unemploymentPenalty * unemployment +
      HAPPINESS.jobSurplusBonus * surplus,
    0,
    100,
  );

  computeDemand(s);
  const eco = computeEconomy(s);
  st.income = eco.income;
  st.expense = eco.expense;
}

/** 구역 타일마다 건물 생성/성장 */
function grow(s: GameState): void {
  const g = s.grid;
  const st = s.stats;
  const spawned = { [K.RES]: 0, [K.COM]: 0, [K.IND]: 0 } as Record<number, number>;
  const demandOf: Record<number, number> = { [K.RES]: st.demandR, [K.COM]: st.demandC, [K.IND]: st.demandI };
  let changed = false;

  // 타일 순서 편향을 없애기 위해 무작위 시작점 + 서로소 보폭으로 순회
  const start = Math.floor(Math.random() * g.count);
  const step = 2477;
  for (let n = 0; n < g.count; n++) {
    const i = (start + n * step) % g.count;
    const k = g.kind[i];
    if (!isZoneKind(k) || !g.powered[i]) continue;
    const x = i % g.size;
    const y = (i / g.size) | 0;
    if (!hasAdjacentRoad(g, x, y)) continue;
    const d = demandOf[k];
    const lv = g.level[i];

    if (lv === 0) {
      if (d > 0 && spawned[k] < GROWTH.maxSpawnPerTick && Math.random() < GROWTH.spawnChance * d) {
        g.level[i] = 1;
        g.progress[i] = 0;
        g.variant[i] = Math.floor(Math.random() * 256);
        spawned[k]++;
        changed = true;
      }
    } else if (lv < MAX_LEVEL && d > GROWTH.minDemandForLevel[lv + 1]) {
      g.progress[i] += GROWTH.levelBase + GROWTH.levelPerDemand * d;
      if (g.progress[i] >= 1) {
        g.level[i] = lv + 1;
        g.progress[i] = 0;
        changed = true;
      }
    }
  }
  if (changed) s.dirty.buildings = true;
}

/** 1틱(게임 내 하루) 진행 */
export function tick(s: GameState): void {
  if (s.gameOver) return;
  s.tick++;

  refreshStats(s);
  grow(s);

  // 행복도는 목표치를 향해 서서히 이동
  s.happiness = lerp(s.happiness, s.happinessTarget, HAPPINESS.smoothing);

  // 경제
  const eco = computeEconomy(s);
  s.money += eco.income - eco.expense;
  s.stats.income = eco.income;
  s.stats.expense = eco.expense;

  // 인구 마일스톤 (grow 직후 집계 반영)
  refreshStats(s);
  for (const m of MILESTONES) {
    if (s.stats.pop >= m && !s.milestones.has(m)) {
      s.milestones.add(m);
      s.toast(`🎉 인구 ${m.toLocaleString('ko-KR')}명 달성!`, 'good');
    }
  }

  if (s.money < BANKRUPT_LIMIT) {
    s.gameOver = true;
    s.speed = 0;
    s.emit('gameover');
  }
}
