import { LAND_VALUE } from '../utils/constants';
import { clamp } from '../utils/math';
import { T } from '../world/grid';
import { GameState } from './state';

/**
 * 땅값(0..100) 계산: 기본값 + 도로 가까움 + 공원·서비스·학교 커버리지 + 물가 − 공업 오염.
 * 건물 레벨 상한(레벨마다 필요한 땅값), 고밀도 건물, 세수에 반영된다.
 * (오염 맵이 먼저 계산되어 있어야 한다.)
 */
export function computeLandValue(s: GameState): void {
  const g = s.grid;
  const L = LAND_VALUE;
  const c = s.cov;
  for (let i = 0; i < g.count; i++) {
    if (g.terrain[i] === T.WATER) {
      g.landValue[i] = 0;
      continue;
    }
    let v = L.base;
    const r = g.access[i];
    if (r >= 0) {
      const d = Math.abs((r % g.size) - (i % g.size)) + Math.abs(((r / g.size) | 0) - ((i / g.size) | 0));
      v += Math.max(0, L.road - 2 * d);
    }
    v +=
      L.park * c.park[i] +
      L.health * c.health[i] +
      L.police * c.police[i] +
      L.fire * c.fire[i] +
      L.edu1 * c.edu1[i] +
      L.edu2 * c.edu2[i];
    if (g.waterNear[i]) v += L.waterfront;
    v -= L.pollution * Math.min(1, s.pollution[i]);
    g.landValue[i] = clamp(v, 0, 100);
  }
}

/** 땅값에 따른 세수 배율 */
export const landTaxMultiplier = (value: number): number =>
  LAND_VALUE.taxMult.min + (LAND_VALUE.taxMult.max - LAND_VALUE.taxMult.min) * (value / 100);
