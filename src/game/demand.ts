import { DEMAND } from '../utils/constants';
import { clamp } from '../utils/math';
import { GameState } from './state';

/** (a-b)/(a+b+K) ∈ (-1, 1): 두 양의 균형 정도 */
const balance = (a: number, b: number): number => (a - b) / (a + b + DEMAND.balanceK);

/**
 * RCI 수요 계산 (각 -1..1)
 *  - 주거: 일자리가 노동력보다 많을수록 ↑
 *  - 상업: 주민(고객)이 상업 일자리보다 많을수록 ↑, 인구가 없으면 0
 *  - 공업: 노동력이 일자리보다 많을수록 ↑ (일자리 공급원)
 */
export function computeDemand(s: GameState): void {
  const st = s.stats;
  const customers = st.pop * 0.35;
  const happyBonus = (s.happiness - 50) / DEMAND.happyInfluence;

  st.demandR = clamp(DEMAND.baseR + DEMAND.weightR * balance(st.jobs, st.workers) + happyBonus, -1, 1);
  st.demandI = clamp(DEMAND.baseI + DEMAND.weightI * balance(st.workers, st.jobs), -1, 1);
  st.demandC = clamp(
    DEMAND.weightC * balance(customers, st.jobsC) + DEMAND.weightCJobs * balance(st.workers, st.jobs),
    -1,
    1,
  );
}
