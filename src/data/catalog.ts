// 도로 / 시설 정의 테이블. 새 콘텐츠는 여기에 한 줄 추가하고 모델(render/models.ts)만 만들면 된다.

export interface RoadTypeDef {
  id: number;
  name: string;
  /** 칸당 건설비 */
  cost: number;
  /** 칸당 일 유지비 */
  upkeep: number;
  /** 도로에서 구역·건물이 붙을 수 있는 최대 거리(칸) */
  depth: number;
  /** 차도 반폭 (렌더링, 타일 단위) */
  halfWidth: number;
  /** 해금에 필요한 개발 트리 노드 (null = 기본 제공) */
  node: string | null;
  desc: string;
}

export const ROAD_TYPES: RoadTypeDef[] = [
  { id: 0, name: '소형 도로', cost: 12, upkeep: 0.08, depth: 4, halfWidth: 0.3, node: null, desc: '왕복 2차로 · 구역은 양옆 4칸까지' },
  { id: 1, name: '중형 도로', cost: 18, upkeep: 0.2, depth: 4, halfWidth: 0.36, node: 'road_medium', desc: '왕복 4차로 · 전송 한도·교통 용량 ↑' },
  { id: 2, name: '대형 도로', cost: 24, upkeep: 0.25, depth: 6, halfWidth: 0.43, node: 'road_large', desc: '왕복 6차로 · 구역은 양옆 6칸까지' },
];

export type FacilityCategory = 'power' | 'water' | 'sewage' | 'health' | 'police' | 'fire' | 'park';

/** 반경(커버리지)을 가지는 서비스 카테고리 */
export type ServiceCategory = 'health' | 'police' | 'fire' | 'park';
export const SERVICE_CATEGORIES: ServiceCategory[] = ['health', 'police', 'fire', 'park'];
export const isServiceCategory = (c: FacilityCategory): c is ServiceCategory => (SERVICE_CATEGORIES as string[]).includes(c);

export const FAC = {
  WIND: 1,
  COAL: 2,
  PUMP: 3,
  TOWER: 4,
  WELL: 5,
  OUTLET: 6,
  TREATMENT: 7,
  CLINIC: 8,
  HOSPITAL: 9,
  POLICE: 10,
  FIRE: 11,
  PARK_S: 12,
  PARK_L: 13,
} as const;

export interface FacilityDef {
  id: number;
  name: string;
  icon: string;
  category: FacilityCategory;
  w: number;
  h: number;
  cost: number;
  /** 일 유지비 */
  upkeep: number;
  /** 공급 용량 (전력 P / 상수 / 하수 처리량 — 카테고리 단위) */
  capacity: number;
  /** 물 타일에 인접해야 하는 시설 */
  needsWater: boolean;
  /** 서비스 반경(칸). 0이면 도로망 시설 */
  radius?: number;
  /** 해금에 필요한 개발 트리 노드 (null = 기본 제공) */
  node: string | null;
  desc: string;
}

export const FACILITIES: Record<number, FacilityDef> = {
  [FAC.WIND]: {
    id: FAC.WIND, name: '풍력 터빈', icon: '🌬️', category: 'power', w: 1, h: 1,
    cost: 600, upkeep: 2, capacity: 8, needsWater: false, node: null,
    desc: '친환경 · 작은 용량',
  },
  [FAC.COAL]: {
    id: FAC.COAL, name: '석탄 발전소', icon: '🏭', category: 'power', w: 2, h: 2,
    cost: 1500, upkeep: 8, capacity: 80, needsWater: false, node: 'fac_coal',
    desc: '대용량 · 오염 유발',
  },
  [FAC.PUMP]: {
    id: FAC.PUMP, name: '취수장', icon: '🚰', category: 'water', w: 1, h: 1,
    cost: 800, upkeep: 4, capacity: 160, needsWater: true, node: null,
    desc: '물 타일에 인접해야 함 · 하수로 오염되면 용량 감소',
  },
  [FAC.TOWER]: {
    id: FAC.TOWER, name: '급수탑', icon: '🗼', category: 'water', w: 2, h: 2,
    cost: 1500, upkeep: 8, capacity: 60, needsWater: false, node: 'fac_tower',
    desc: '수원 없이 설치 가능 · 유지비 높음',
  },
  [FAC.WELL]: {
    id: FAC.WELL, name: '지하수 우물', icon: '⛲', category: 'water', w: 1, h: 1,
    cost: 1000, upkeep: 6, capacity: 30, needsWater: false, node: 'fac_well',
    desc: '지하수 고갈 시 가동 불가 (서서히 회복)',
  },
  [FAC.OUTLET]: {
    id: FAC.OUTLET, name: '하수 배출구', icon: '🕳️', category: 'sewage', w: 1, h: 1,
    cost: 600, upkeep: 4, capacity: 100, needsWater: true, node: null,
    desc: '물 타일에 인접 · 무처리 방류로 수질 오염',
  },
  [FAC.TREATMENT]: {
    id: FAC.TREATMENT, name: '폐수 처리장', icon: '♻️', category: 'sewage', w: 2, h: 2,
    cost: 6000, upkeep: 15, capacity: 150, needsWater: false, node: 'fac_treatment',
    desc: '하수를 정화 처리 · 오염 없음',
  },
  [FAC.CLINIC]: {
    id: FAC.CLINIC, name: '진료소', icon: '🏥', category: 'health', w: 2, h: 2,
    cost: 1200, upkeep: 3, capacity: 120, needsWater: false, radius: 14, node: 'fac_clinic',
    desc: '반경 14칸 · 환자 120명 수용(주민 약 1,500명) · 건강·행복 ↑',
  },
  [FAC.HOSPITAL]: {
    id: FAC.HOSPITAL, name: '병원', icon: '⚕️', category: 'health', w: 3, h: 3,
    cost: 6000, upkeep: 12, capacity: 3000, needsWater: false, radius: 24, node: 'fac_hospital',
    desc: '반경 24칸 · 환자 3,000명 수용(주민 약 37,500명) · 넓은 지역 의료',
  },
  [FAC.POLICE]: {
    id: FAC.POLICE, name: '경찰서', icon: '👮', category: 'police', w: 2, h: 2,
    cost: 1800, upkeep: 4, capacity: 0, needsWater: false, radius: 16, node: 'fac_police',
    desc: '반경 16칸 · 범죄 감소 (인구가 많을수록 필요)',
  },
  [FAC.FIRE]: {
    id: FAC.FIRE, name: '소방서', icon: '🚒', category: 'fire', w: 2, h: 2,
    cost: 1600, upkeep: 4, capacity: 0, needsWater: false, radius: 18, node: 'fac_fire',
    desc: '반경 18칸 · 화재를 진압해 건물 소실을 막음',
  },
  [FAC.PARK_S]: {
    id: FAC.PARK_S, name: '소공원', icon: '🌳', category: 'park', w: 1, h: 1,
    cost: 300, upkeep: 1, capacity: 0, needsWater: false, radius: 7, node: 'fac_park_s',
    desc: '반경 7칸 · 행복도 ↑ (가장 저렴한 행복 수단)',
  },
  [FAC.PARK_L]: {
    id: FAC.PARK_L, name: '대공원', icon: '🏞️', category: 'park', w: 2, h: 2,
    cost: 1000, upkeep: 2, capacity: 0, needsWater: false, radius: 12, node: 'fac_park_l',
    desc: '반경 12칸 · 행복도 ↑↑',
  },
};

export const FACILITY_LIST: FacilityDef[] = Object.values(FACILITIES);

/** 전력/상수/하수 사용량 (건물 레벨당) */
export const POWER_USE = { R: 0.1, C: 0.2, I: 0.3 };
export const WATER_USE = { R: 0.5, C: 0.5, I: 1.0 };
export const SEWAGE_RATIO = 0.8;
