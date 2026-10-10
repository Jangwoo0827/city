import {
  ABANDON,
  BANKRUPT_LIMIT,
  BRIDGE,
  EDU,
  GROWTH,
  HAPPINESS,
  MAX_LEVEL,
  MILESTONES,
  WATER_POLLUTION,
  WORKER_RATIO,
  XP_AWARD,
} from '../utils/constants';
import { ROAD_TYPES } from '../data/catalog';
import { ZONE_BY_KIND, ZoneDef } from '../data/zones';
import { clamp, lerp } from '../utils/math';
import { K, T, isResidentialKind, isZoneKind } from '../world/grid';
import { computeAccess } from '../world/roads';
import { buildingStats, facilityList, jobClassOf } from '../world/buildings';
import { GameState } from './state';
import { computeNetworks, updateEnvironment } from './network';
import { computeCoverage } from './coverage';
import { computeLandValue } from './landvalue';
import { updateFires } from './events';
import { computeDemand } from './demand';
import { computeEconomy } from './economy';
import { awardXp } from './progression';

/** 공업 건물이 주변 타일에 퍼뜨리는 오염도 맵 */
function computePollution(s: GameState): void {
  const g = s.grid;
  const p = s.pollution;
  p.fill(0);
  const R = HAPPINESS.pollutionRadius;
  for (let i = 0; i < g.count; i++) {
    if (g.kind[i] !== K.IND || g.level[i] === 0 || g.abandoned[i]) continue;
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

/** 인구/일자리/공급/수요/행복도 목표치 등 집계 */
export function refreshStats(s: GameState): void {
  const g = s.grid;
  const st = s.stats;
  if (s.dirty.net) {
    s.dirty.net = false;
    computeAccess(g);
  }
  computeNetworks(s);
  computeCoverage(s);
  computePollution(s);
  computeLandValue(s);

  let pop = 0;
  let jobsC = 0;
  let jobsI = 0;
  let jobsLow = 0;
  let jobsSkilled = 0;
  let jobsHigh = 0;
  let buildings = 0;
  let abandoned = 0;
  let poweredB = 0;
  let wateredB = 0;
  let sewagedB = 0;
  let roads = 0;
  let upkeepRoads = 0;
  let resLevels = 0;
  let pollutedLevels = 0;
  let landSum = 0;
  // 서비스 커버리지 가중 평균용 (의료·경찰·소방·교육은 주민 수, 공원은 건물 레벨)
  let popW = 0;
  let covH = 0;
  let covP = 0;
  let covF = 0;
  let covE1 = 0;
  let covE2 = 0;
  let covE3 = 0;
  let parkW = 0;
  let covPk = 0;

  for (let i = 0; i < g.count; i++) {
    const k = g.kind[i];
    if (k === K.ROAD) {
      roads++;
      const mult = g.terrain[i] === T.WATER ? BRIDGE.upkeepMult : 1;
      upkeepRoads += (ROAD_TYPES[g.roadType[i]]?.upkeep ?? 0.2) * mult;
    } else if (isZoneKind(k) && g.level[i] > 0) {
      if (g.abandoned[i]) {
        abandoned++;
        continue;
      }
      buildings++;
      if (g.powered[i]) poweredB++;
      if (g.watered[i]) wateredB++;
      if (g.sewered[i]) sewagedB++;
      landSum += g.landValue[i];
      const b = buildingStats(k, g.level[i]);
      pop += b.pop;
      if (b.jobs > 0) {
        if (k === K.COM || k === K.COMH) jobsC += b.jobs;
        else if (k === K.IND) jobsI += b.jobs;
        const jc = jobClassOf(k, g.level[i]);
        if (jc === 'skilled') jobsSkilled += b.jobs;
        else if (jc === 'high') jobsHigh += b.jobs;
        else jobsLow += b.jobs;
      }
      parkW += g.level[i];
      covPk += g.level[i] * s.cov.park[i];
      if (isResidentialKind(k)) {
        popW += b.pop;
        covH += b.pop * s.cov.health[i];
        covP += b.pop * s.cov.police[i];
        covF += b.pop * s.cov.fire[i];
        covE1 += b.pop * s.cov.edu1[i];
        covE2 += b.pop * s.cov.edu2[i];
        covE3 += b.pop * s.cov.edu3[i];
        resLevels += g.level[i];
        pollutedLevels += g.level[i] * Math.min(1, s.pollution[i]);
      }
    }
  }

  const facs = facilityList(g);
  let upkeepFac = 0;
  for (const f of facs) upkeepFac += f.def.upkeep;

  // 노동력과 학력별 일자리 매칭
  const workers = Math.round(pop * WORKER_RATIO);
  const skilledW = workers * s.edu.a2; // 고등학교 이상
  const highW = workers * s.edu.a3; // 대학교
  const filledHigh = Math.min(jobsHigh, highW);
  const filledSkilled = Math.min(jobsSkilled, Math.max(0, skilledW - filledHigh));
  const filledLow = Math.min(jobsLow, Math.max(0, workers - filledHigh - filledSkilled));
  const jobsFilled = filledHigh + filledSkilled + filledLow;
  const jobsAvail = jobsLow + Math.min(jobsSkilled + jobsHigh, skilledW);

  st.pop = pop;
  st.workers = workers;
  st.jobsC = jobsC;
  st.jobsI = jobsI;
  st.jobsTotal = jobsLow + jobsSkilled + jobsHigh;
  st.jobsFilled = jobsFilled;
  st.jobs = jobsAvail;
  st.buildings = buildings;
  st.abandoned = abandoned;
  st.landValue = buildings > 0 ? landSum / buildings : 0;
  st.roads = roads;
  st.facilities = facs.length;
  st.upkeepRoads = upkeepRoads;
  st.upkeepFacilities = upkeepFac;
  st.covHealth = popW > 0 ? covH / popW : 0;
  st.covPolice = popW > 0 ? covP / popW : 0;
  st.covFire = popW > 0 ? covF / popW : 0;
  st.covEdu1 = popW > 0 ? covE1 / popW : 0;
  st.covEdu2 = popW > 0 ? covE2 / popW : 0;
  st.covEdu3 = popW > 0 ? covE3 / popW : 0;
  st.covPark = parkW > 0 ? covPk / parkW : 0;
  st.poweredRatio = buildings > 0 ? poweredB / buildings : 1;
  st.wateredRatio = buildings > 0 ? wateredB / buildings : 1;
  st.sewagedRatio = buildings > 0 ? sewagedB / buildings : 1;

  // 행복도 목표치
  const polluted = resLevels > 0 ? pollutedLevels / resLevels : 0;
  const unemployment = workers > 0 ? Math.max(0, workers - jobsFilled) / workers : 0;
  const surplus = jobsAvail > workers ? Math.min(1, (jobsAvail - workers) / Math.max(1, jobsAvail)) : 0;
  const crimeScale = clamp((pop - HAPPINESS.crimeStartPop) / HAPPINESS.crimeRamp, 0, 1);
  const abandonedShare = buildings + abandoned > 0 ? abandoned / (buildings + abandoned) : 0;
  s.happinessTarget = clamp(
    HAPPINESS.base +
      HAPPINESS.healthBonus * st.covHealth +
      HAPPINESS.parkBonus * st.covPark +
      EDU.happyBonus * s.edu.a2 -
      HAPPINESS.crimePenalty * crimeScale * (1 - st.covPolice) -
      HAPPINESS.abandonedPenalty * abandonedShare -
      HAPPINESS.noPowerPenalty * (1 - st.poweredRatio) -
      HAPPINESS.noWaterPenalty * (1 - st.wateredRatio) -
      HAPPINESS.noSewagePenalty * (1 - st.sewagedRatio) -
      WATER_POLLUTION.happyPenalty * s.waterPollution -
      HAPPINESS.pollutionPenalty * polluted -
      HAPPINESS.unemploymentPenalty * unemployment +
      HAPPINESS.jobSurplusBonus * surplus,
    0,
    100,
  );

  computeDemand(s, skilledW, jobsSkilled + jobsHigh);
  const eco = computeEconomy(s);
  st.income = eco.income;
  st.expense = eco.expense;
}

/** 시민의 교육 이수율이 학교 커버리지를 향해 서서히 변한다 (a3 ≤ a2 ≤ a1) */
function updateEducation(s: GameState): void {
  const st = s.stats;
  const e = s.edu;
  const k = EDU.smoothing;
  e.a1 += (st.covEdu1 - e.a1) * k;
  e.a2 += (Math.min(st.covEdu2, e.a1) - e.a2) * k;
  e.a3 += (Math.min(st.covEdu3, e.a2) - e.a3) * k;
}

/** 이 구역 정의의 건물이 해당 레벨이 될 수 있는 학력·땅값 조건을 만족하는가 */
export function meetsRequirements(s: GameState, def: ZoneDef, level: number, landValue: number): boolean {
  if (landValue < def.minLandValue[level]) return false;
  const e = def.minEdu[level];
  if (e && (e.level === 2 ? s.edu.a2 : s.edu.a3) < e.share) return false;
  return true;
}

/** 구역 타일마다 건물 생성/성장. 얻은 XP 를 돌려준다. */
function grow(s: GameState): number {
  const g = s.grid;
  const st = s.stats;
  const demandOf = (def: ZoneDef): number =>
    def.kind === K.RES || def.kind === K.RESH
      ? st.demandR
      : def.kind === K.COM || def.kind === K.COMH
        ? st.demandC
        : def.kind === K.IND
          ? st.demandI
          : st.demandO;
  const spawned: Record<number, number> = {};
  let changed = false;
  let xp = 0;

  // 타일 순서 편향을 없애기 위해 무작위 시작점 + 서로소 보폭으로 순회
  const start = Math.floor(Math.random() * g.count);
  const step = 2477;
  for (let n = 0; n < g.count; n++) {
    const i = (start + n * step) % g.count;
    const k = g.kind[i];
    if (!isZoneKind(k) || g.abandoned[i]) continue;
    // 도로 접근 + 전력 + 수도 + 하수가 모두 있어야 성장
    if (g.access[i] < 0 || !g.powered[i] || !g.watered[i] || !g.sewered[i]) continue;
    const def = ZONE_BY_KIND[k];
    const d = demandOf(def);
    const lv = g.level[i];
    const land = g.landValue[i];

    if (lv === 0) {
      if (
        d > 0 &&
        (spawned[k] ?? 0) < GROWTH.maxSpawnPerTick &&
        meetsRequirements(s, def, 1, land) &&
        Math.random() < GROWTH.spawnChance * d
      ) {
        g.level[i] = 1;
        g.progress[i] = 0;
        g.variant[i] = Math.floor(Math.random() * 256);
        spawned[k] = (spawned[k] ?? 0) + 1;
        changed = true;
        xp += XP_AWARD.building;
      }
    } else if (lv < MAX_LEVEL && d > GROWTH.minDemandForLevel[lv + 1] && meetsRequirements(s, def, lv + 1, land)) {
      g.progress[i] += GROWTH.levelBase + GROWTH.levelPerDemand * d;
      if (g.progress[i] >= 1) {
        g.level[i] = lv + 1;
        g.progress[i] = 0;
        changed = true;
        xp += XP_AWARD.levelUp * (lv + 1);
      }
    }
  }
  if (changed) s.dirty.buildings = true;
  return xp;
}

/**
 * 폐허: 도로 접근·전력·수도·하수 중 하나가 ABANDON.ticks 동안 끊긴 건물은 폐허가 된다.
 * 폐허는 주민·일자리·세금이 없고 어둡게 보이며, 조건이 회복되면 서서히 되살아난다.
 */
function updateAbandonment(s: GameState): void {
  const g = s.grid;
  let newly = 0;
  let changed = false;
  for (let i = 0; i < g.count; i++) {
    if (!isZoneKind(g.kind[i]) || g.level[i] === 0) {
      if (g.neglect[i] !== 0) g.neglect[i] = 0;
      if (g.abandoned[i]) g.abandoned[i] = 0;
      continue;
    }
    const ok = g.access[i] >= 0 && g.powered[i] === 1 && g.watered[i] === 1 && g.sewered[i] === 1;
    if (!ok) {
      if (g.neglect[i] < 255) g.neglect[i]++;
      if (g.neglect[i] >= ABANDON.ticks && !g.abandoned[i]) {
        g.abandoned[i] = 1;
        newly++;
        changed = true;
      }
    } else if (g.neglect[i] > 0) {
      g.neglect[i] = Math.max(0, g.neglect[i] - ABANDON.recoverPerTick);
      if (g.neglect[i] === 0 && g.abandoned[i]) {
        g.abandoned[i] = 0;
        changed = true;
      }
    }
  }
  if (changed) s.dirty.buildings = true;
  if (newly > 0 && s.tick - s.lastAbandonToast >= ABANDON.toastCooldown) {
    s.lastAbandonToast = s.tick;
    s.toast(`🏚️ 건물 ${newly}채가 폐허가 되었습니다. 도로 접근·전력·상수도·하수를 확인하세요`, 'bad');
  }
}

/** 1틱(게임 내 하루) 진행 */
export function tick(s: GameState): void {
  if (s.gameOver) return;
  s.tick++;

  refreshStats(s);
  const xp = grow(s);
  updateEnvironment(s);
  if (s.waterPollution > 0.3 && !s.waterWarned) {
    s.waterWarned = true;
    s.toast('⚠️ 수질이 오염되고 있습니다. 폐수 처리장을 지으세요 (개발 트리)', 'bad');
  } else if (s.waterPollution < 0.1) s.waterWarned = false;
  updateFires(s);
  updateEducation(s);
  updateAbandonment(s);

  // 행복도는 목표치를 향해 서서히 이동
  s.happiness = lerp(s.happiness, s.happinessTarget, HAPPINESS.smoothing);

  // 경제
  const eco = computeEconomy(s);
  s.money += eco.income - eco.expense;
  s.stats.income = eco.income;
  s.stats.expense = eco.expense;

  // grow 직후 집계 반영
  refreshStats(s);

  // XP: 건물 생성/성장 + 인구 비례
  awardXp(s, xp + (s.stats.pop / 100) * XP_AWARD.per100Pop);

  // 인구 알림
  for (const m of MILESTONES) {
    if (s.stats.pop >= m && !s.popMilestones.has(m)) {
      s.popMilestones.add(m);
      s.toast(`🎉 인구 ${m.toLocaleString('ko-KR')}명 달성!`, 'good');
    }
  }

  if (s.money < BANKRUPT_LIMIT) {
    s.gameOver = true;
    s.speed = 0;
    s.emit('gameover');
  }
}
