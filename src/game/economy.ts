import { LOAN, TAX_HAPPY_MULT, TAX_PER_LEVEL } from '../utils/constants';
import { lerp } from '../utils/math';
import { K } from '../world/grid';
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
    if (lv === 0 || !g.powered[i] || !g.watered[i] || !g.sewered[i]) continue;
    const k = g.kind[i];
    const rate = k === K.RES ? TAX_PER_LEVEL.R : k === K.COM ? TAX_PER_LEVEL.C : k === K.IND ? TAX_PER_LEVEL.I : 0;
    weighted += lv * rate;
  }
  const income = weighted * taxMultiplier(s.happiness);
  const interest = s.loan * LOAN.interestPerDay;
  s.stats.interest = interest;
  const expense = s.stats.upkeepRoads + s.stats.upkeepFacilities + interest;
  return { income, expense };
}
