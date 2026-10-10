import { DEMAND } from '../utils/constants';
import { OFFICE_MIN_COMMERCIAL_JOBS } from '../data/zones';
import { clamp } from '../utils/math';
import { GameState } from './state';

/** (a-b)/(a+b+K) ∈ (-1, 1): 두 양의 균형 정도 */
const balance = (a: number, b: number): number => (a - b) / (a + b + DEMAND.balanceK);

/**
 * RCIO 수요 계산 (각 -1..1)
 *  - 주거: 이 도시 노동력이 채울 수 있는 일자리가 노동력보다 많을수록 ↑ (행복도도 영향)
 *  - 상업: 주민(고객)이 상업 일자리보다 많을수록 ↑, 인구가 없으면 0
 *  - 공업: 노동력이 일자리보다 많을수록 ↑ (일자리 공급원)
 *  - 사무: 고등학교 이상 학력의 노동력이 고급 일자리보다 많을수록 ↑.
 *          상업 일자리가 충분하고 교육받은 시민이 있어야 수요가 생긴다.
 * st.jobs 는 "현재 노동력의 학력으로 채울 수 있는 일자리"이다.
 */
export function computeDemand(s: GameState, skilledWorkers: number, skilledJobs: number): void {
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
  const hasBase = st.jobsC >= OFFICE_MIN_COMMERCIAL_JOBS && s.edu.a2 >= 0.02;
  st.demandO = hasBase ? clamp(DEMAND.weightO * balance(skilledWorkers, skilledJobs), -1, 1) : 0;
}
