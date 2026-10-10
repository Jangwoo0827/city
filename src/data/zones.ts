// 구역(건물) 정의 테이블. 구역 종류를 추가하려면 여기에 한 항목을 넣고 모델(render/models.ts)을 만든다.
import { JOBS_PER_LEVEL, POP_PER_LEVEL, TAX_PER_LEVEL } from '../utils/constants';
import { K } from '../world/grid';

export type ZoneId = 'R' | 'RH' | 'C' | 'CH' | 'I' | 'O';

/** 일자리가 요구하는 학력: low = 누구나, skilled = 고등학교 이상, high = 대학교 */
export type JobClass = 'low' | 'skilled' | 'high';

export interface ZoneDef {
  id: ZoneId;
  kind: number;
  name: string;
  /** 건물 이름 (정보 패널) */
  building: string;
  /** 구역 도구의 단축키 (KeyboardEvent.code 의 글자) */
  key: string;
  /** 바닥 표시 색 */
  color: number;
  /** 해금에 필요한 개발 트리 노드 (null = 기본 제공) */
  node: string | null;
  desc: string;
  /** 레벨별 주민 수 (인덱스 = 레벨) */
  pop: number[];
  /** 레벨별 일자리 */
  jobs: number[];
  /** 레벨별 일자리 요구 학력 */
  jobClass: (JobClass | null)[];
  /** 건물 레벨 1당 일 세금 (행복도·땅값 보정 전) */
  tax: number;
  /** 레벨당 전력/수도 사용량 (하수 = 수도 × 비율) */
  power: number;
  water: number;
  /** 해당 레벨이 되기 위한 최소 땅값 (인덱스 = 레벨) */
  minLandValue: number[];
  /** 해당 레벨이 되기 위한 시민 학력 조건 (level: 2 = 고등학교 이수율, 3 = 대학교 이수율) */
  minEdu: ({ level: 2 | 3; share: number } | null)[];
}

export const ZONES: ZoneDef[] = [
  {
    id: 'R', kind: K.RES, name: '주거', building: '주택', key: 'R', color: 0x4caf50, node: null,
    desc: '저밀도 주택 · 낮고 아늑함',
    pop: POP_PER_LEVEL, jobs: [0, 0, 0, 0], jobClass: [null, null, null, null],
    tax: TAX_PER_LEVEL.R, power: 0.1, water: 0.5,
    minLandValue: [0, 0, 30, 40], minEdu: [null, null, null, null],
  },
  {
    id: 'RH', kind: K.RESH, name: '고밀 주거', building: '아파트', key: 'T', color: 0x2e7d32, node: 'zone_rh',
    desc: '고층 아파트 · 땅값이 높아야 지어짐',
    pop: [0, 24, 55, 110], jobs: [0, 0, 0, 0], jobClass: [null, null, null, null],
    tax: TAX_PER_LEVEL.R * 2.7, power: 0.4, water: 2.0,
    minLandValue: [0, 45, 58, 70], minEdu: [null, null, null, null],
  },
  {
    id: 'C', kind: K.COM, name: '상업', building: '상점', key: 'C', color: 0x2f80ed, node: null,
    desc: '저밀도 상업 · 누구나 일할 수 있음',
    pop: [0, 0, 0, 0], jobs: JOBS_PER_LEVEL.C, jobClass: [null, 'low', 'low', 'low'],
    tax: TAX_PER_LEVEL.C, power: 0.2, water: 0.5,
    minLandValue: [0, 0, 30, 40], minEdu: [null, null, null, null],
  },
  {
    id: 'CH', kind: K.COMH, name: '고밀 상업', building: '쇼핑몰', key: 'B', color: 0xc2569a, node: 'zone_ch',
    desc: '대형 쇼핑몰 · 고등학교 이상 일자리',
    pop: [0, 0, 0, 0], jobs: [0, 14, 32, 60], jobClass: [null, 'skilled', 'skilled', 'skilled'],
    tax: TAX_PER_LEVEL.C * 2.4, power: 0.5, water: 1.5,
    minLandValue: [0, 45, 58, 70], minEdu: [null, null, null, null],
  },
  {
    id: 'I', kind: K.IND, name: '공업', building: '공장', key: 'I', color: 0xf2c94c, node: null,
    desc: '공장 · 일자리가 많지만 오염을 일으킴',
    pop: [0, 0, 0, 0], jobs: JOBS_PER_LEVEL.I, jobClass: [null, 'low', 'low', 'low'],
    tax: TAX_PER_LEVEL.I, power: 0.3, water: 1.0,
    minLandValue: [0, 0, 0, 0], minEdu: [null, null, null, null],
  },
  {
    id: 'O', kind: K.OFF, name: '사무', building: '오피스', key: 'O', color: 0x9b6bd6, node: 'zone_office',
    desc: '사무실 · 고학력 시민이 필요하고, 상업 구역이 있어야 지어짐',
    pop: [0, 0, 0, 0], jobs: [0, 10, 28, 55], jobClass: [null, 'skilled', 'high', 'high'],
    tax: TAX_PER_LEVEL.C * 2.0, power: 0.3, water: 0.6,
    minLandValue: [0, 38, 50, 62],
    minEdu: [null, { level: 2, share: 0.05 }, { level: 3, share: 0.04 }, { level: 3, share: 0.12 }],
  },
];

export const ZONE_BY_ID: Record<ZoneId, ZoneDef> = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<ZoneId, ZoneDef>;
export const ZONE_BY_KIND: Record<number, ZoneDef> = Object.fromEntries(ZONES.map((z) => [z.kind, z]));

/** 사무 구역은 상업 일자리가 이만큼 있어야 지어진다 */
export const OFFICE_MIN_COMMERCIAL_JOBS = 8;
