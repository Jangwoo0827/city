// 개발 트리: 마일스톤 보상인 개발 포인트로 개별 건물/도구를 해금한다.

export interface DevNode {
  id: string;
  name: string;
  group: string;
  /** 필요한 개발 포인트 */
  cost: number;
  /** 구매 가능한 최소 마일스톤 단계 */
  level: number;
  desc: string;
}

export const DEV_NODES: DevNode[] = [
  { id: 'fac_coal', name: '석탄 발전소', group: '전력', cost: 1, level: 0, desc: '용량 80의 대형 발전소. 풍력보다 용량 대비 훨씬 저렴하지만 오염이 있습니다.' },
  { id: 'road_medium', name: '중형 도로 (4차로)', group: '도로', cost: 1, level: 1, desc: '유지비는 높지만 교통·전송 용량이 큰 4차로 도로.' },
  { id: 'fac_tower', name: '급수탑', group: '상수도', cost: 1, level: 1, desc: '수원이 없는 곳에도 설치할 수 있는 급수 시설.' },
  { id: 'fac_well', name: '지하수 우물', group: '상수도', cost: 1, level: 1, desc: '저렴하지만 지하수가 고갈되면 가동할 수 없습니다.' },
  { id: 'fac_treatment', name: '폐수 처리장', group: '하수', cost: 2, level: 1, desc: '하수를 정화해 수질 오염을 막습니다.' },
  { id: 'fac_clinic', name: '진료소', group: '의료', cost: 1, level: 1, desc: '반경 14칸·환자 120명(주민 약 1,500명) 수용의 작은 의료 시설. 주민 건강과 행복을 올립니다.' },
  { id: 'fac_hospital', name: '병원', group: '의료', cost: 2, level: 2, desc: '반경 24칸·환자 600명(주민 약 7,500명) 수용의 대형 의료 시설.' },
  { id: 'fac_fire', name: '소방서', group: '소방·경찰', cost: 2, level: 3, desc: '화재를 진압합니다. 소방서가 없으면 불난 건물이 전소됩니다.' },
  { id: 'fac_police', name: '경찰서', group: '소방·경찰', cost: 2, level: 3, desc: '범죄를 줄입니다. 인구가 늘수록 범죄 페널티가 커집니다.' },
  { id: 'fac_park_s', name: '소공원', group: '공원', cost: 1, level: 4, desc: '1×1 작은 공원. 주변 행복도를 올립니다.' },
  { id: 'fac_park_l', name: '대공원', group: '공원', cost: 2, level: 4, desc: '2×2 큰 공원. 넓은 범위의 행복도를 올립니다.' },
  { id: 'road_large', name: '대형 도로 (6차로)', group: '도로', cost: 2, level: 3, desc: '구역을 양옆 6칸까지 지정할 수 있는 간선 도로.' },
];

export const DEV_NODE_MAP: Record<string, DevNode> = Object.fromEntries(DEV_NODES.map((n) => [n.id, n]));
