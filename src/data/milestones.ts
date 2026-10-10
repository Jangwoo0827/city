// 마일스톤 20단계 (CS2 표를 이 게임 규모로 환산). 수치는 모두 여기서 조정한다.

export interface MilestoneDef {
  level: number;
  name: string;
  /** 도달에 필요한 누적 XP */
  xp: number;
  /** 보상: 현금 */
  money: number;
  /** 보상: 개발 포인트 */
  devPoints: number;
  /** 도달 시 대출 한도 (누적 한도) */
  loanLimit: number;
  /** 새로 열리는 서비스 그룹 안내 (실제 해금은 개발 트리에서) */
  unlocks: string;
}

const NAMES = [
  '아주 작은 부락', '작은 부락', '큰 부락', '아주 큰 부락', '아주 작은 마을',
  '입소문 난 마을', '번화한 마을', '큰 마을', '멋진 마을', '작은 도시',
  '대도시', '큰 대도시', '거대한 도시', '웅장한 도시', '메트로폴리스',
  '번영하는 메트로폴리스', '성황하는 메트로폴리스', '광활한 메트로폴리스', '거대한 메트로폴리스', '광역도시',
];
const XP = [190, 625, 1200, 2100, 3400, 5300, 8000, 11700, 16400, 22400, 29900, 38900, 49700, 62200, 76400, 92400, 109900, 128700, 148200, 169000];
const DEV = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 19, 21, 24, 27];
const LOAN = [10000, 15000, 20000, 25000, 40000, 50000, 60000, 70000, 80000, 90000, 110000, 130000, 150000, 170000, 190000, 210000, 230000, 260000, 300000, 400000];
const UNLOCK_TEXT: Record<number, string> = {
  1: '의료·장례, 폐기물 (예정)',
  2: '교육 (예정)',
  3: '소방, 경찰 (예정)',
  4: '지구 도구, 정책, 대중교통, 공원·오락 (예정)',
  5: '통신 (예정) · 개발 트리 전체 개방',
};

export const MILESTONES_20: MilestoneDef[] = NAMES.map((name, i) => ({
  level: i + 1,
  name,
  xp: XP[i],
  money: 625 * (i + 1),
  devPoints: DEV[i],
  loanLimit: LOAN[i],
  unlocks: UNLOCK_TEXT[i + 1] ?? '보상만',
}));

export const START_LOAN_LIMIT = 5000;
export const START_DEV_POINTS = 1;
export const MAX_MILESTONE = MILESTONES_20.length;

/** 레벨 0(시작)의 이름 */
export const LEVEL0_NAME = '새 정착지';

export const levelName = (level: number): string => (level <= 0 ? LEVEL0_NAME : MILESTONES_20[Math.min(level, MAX_MILESTONE) - 1].name);
