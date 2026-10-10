import { LOAN, TAX_HAPPY_MULT } from '../utils/constants';
import { ZONE_BY_KIND } from '../data/zones';
import { landTaxMultiplier } from './landvalue';
import { lerp } from '../utils/math';
import { GameState } from './state';

/** 행복도에 따른 세수 배율 */
export const taxMultiplier = (happiness: number): number =>
  lerp(TAX_HAPPY_MULT.min, TAX_HAPPY_MULT.max, happiness / 100);

/**
 * 이번 틱의 수입(전력·수도·하수가 모두 공급되는 건물만 납세)과 지출
 * (도로·시설 유지비 + 대출 이자). 유지비 집계는 refreshStats 에서 stats 에 채운다.
 */
export function computeEconomy(s: GameState): { income: number; expense: number } {
  const g = s.grid;
  let weighted = 0;
  for (let i = 0; i < g.count; i++) {
    const lv = g.level[i];
    if (lv === 0 || g.abandoned[i] || !g.powered[i] || !g.watered[i] || !g.sewered[i]) continue;
    const def = ZONE_BY_KIND[g.kind[i]];
    if (!def) continue;
    weighted += lv * def.tax * landTaxMultiplier(g.landValue[i]);
  }
  const income = weighted * taxMultiplier(s.happiness);
  const interest = s.loan * LOAN.interestPerDay;
  s.stats.interest = interest;
  const expense = s.stats.upkeepRoads + s.stats.upkeepFacilities + interest;
  return { income, expense };
}
