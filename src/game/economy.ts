import { TAX_HAPPY_MULT, TAX_PER_LEVEL, UPKEEP } from '../utils/constants';
import { lerp } from '../utils/math';
import { K } from '../world/grid';
import { GameState } from './state';

/** 행복도에 따른 세수 배율 */
export const taxMultiplier = (happiness: number): number =>
  lerp(TAX_HAPPY_MULT.min, TAX_HAPPY_MULT.max, happiness / 100);

/** 이번 틱의 수입(전력이 공급되는 건물만 납세)과 유지비 */
export function computeEconomy(s: GameState): { income: number; expense: number } {
  const g = s.grid;
  let weighted = 0;
  for (let i = 0; i < g.count; i++) {
    const lv = g.level[i];
    if (lv === 0 || !g.powered[i]) continue;
    const k = g.kind[i];
    const rate = k === K.RES ? TAX_PER_LEVEL.R : k === K.COM ? TAX_PER_LEVEL.C : k === K.IND ? TAX_PER_LEVEL.I : 0;
    weighted += lv * rate;
  }
  const income = weighted * taxMultiplier(s.happiness);
  const expense = s.stats.roads * UPKEEP.road + s.stats.plants * UPKEEP.plant;
  return { income, expense };
}
