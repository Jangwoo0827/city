// 모든 밸런스 수치는 이 파일에서 조정한다.

export const GRID_SIZE = 64;

// ── 경제 ──────────────────────────────────────────────
export const START_MONEY = 20000;
export const BANKRUPT_LIMIT = -5000;

/** 설치 비용 (타일당 / 건물당) */
export const COST = {
  road: 12,
  zone: 6,
  plant: 3000,
  demolish: 0, // 철거는 무료, 환급도 없음
};

/** 틱(1초)마다 나가는 유지비 */
export const UPKEEP = {
  road: 0.2, // 도로 타일당
  plant: 12, // 발전소당
};

/** 건물 레벨 1당, 틱마다 들어오는 세금 (행복도 보정 전) */
export const TAX_PER_LEVEL = { R: 0.25, C: 0.45, I: 0.5 };
/** 행복도에 따른 세수 배율: lerp(min, max, happiness/100) */
export const TAX_HAPPY_MULT = { min: 0.5, max: 1.5 };

// ── 시뮬레이션 ─────────────────────────────────────────
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const MAX_LEVEL = 3;

/** 레벨별 주거 인구 (인덱스 = 레벨) */
export const POP_PER_LEVEL = [0, 6, 14, 28];
/** 레벨별 일자리 */
export const JOBS_PER_LEVEL = {
  C: [0, 4, 9, 16],
  I: [0, 6, 13, 24],
};
/** 인구 중 취업 가능한(노동) 비율 */
export const WORKER_RATIO = 0.55;
/** 주민 중 상업 시설을 이용하는 비율 (상업 수요 계산용) */
export const SHOPPER_RATIO = 0.35;

export const DEMAND = {
  baseR: 0.35,
  baseI: 0.25,
  /** 균형 계산 시 분모 보정값 (작을수록 민감) */
  balanceK: 12,
  weightR: 1.0,
  weightI: 0.9,
  weightC: 1.1,
  weightCJobs: 0.2,
  happyInfluence: 150, // (행복도-50)/이 값 이 주거 수요에 더해짐
};

export const GROWTH = {
  /** 빈 구역 타일이 한 틱에 건물로 바뀔 확률 = spawnChance * 수요 */
  spawnChance: 0.05,
  maxSpawnPerTick: 3,
  /** 레벨업 진행도 증가량/틱 = base + perDemand * 수요 (1.0 도달 시 레벨업) */
  levelBase: 0.012,
  levelPerDemand: 0.04,
  /** 해당 레벨로 올라가기 위한 최소 수요 */
  minDemandForLevel: [0, 0, 0.05, 0.15],
};

export const HAPPINESS = {
  base: 62,
  noPowerPenalty: 35,
  pollutionPenalty: 30,
  unemploymentPenalty: 28,
  jobSurplusBonus: 10,
  /** 목표치를 향해 틱마다 이동하는 비율 */
  smoothing: 0.1,
  pollutionRadius: 3,
};

export const MILESTONES = [100, 500, 2000];

// ── 저장 ──────────────────────────────────────────────
export const SAVE_KEY = 'mini-city-save-v1';
export const AUTOSAVE_SECONDS = 30;

// ── 카메라 ─────────────────────────────────────────────
export const CAMERA = {
  yawDeg: 45,
  pitchDeg: 35,
  /** zoom=1 일 때 화면 세로가 담는 월드 길이 */
  baseView: 34,
  minZoom: 0.45,
  maxZoom: 3.5,
  distance: 160,
  rotateDamping: 9,
  panKeySpeed: 22,
};

// ── 연출 ──────────────────────────────────────────────
export const DAY_LENGTH_SECONDS = 120;
export const MAX_CARS = 60;
/** 도로 타일 몇 칸당 자동차 1대 */
export const ROAD_TILES_PER_CAR = 3;
export const CAR_SPEED = 1.8; // 타일/초
export const BUILD_ANIM_SECONDS = 0.9;

export const COLORS = {
  sky: 0x8ecae6,
  skyNight: 0x0a1230,
  ground: 0x86c46a,
  groundOuter: 0x6fae58,
  zone: { R: 0x4caf50, C: 0x2f80ed, I: 0xf2c94c },
  okTile: 0x39d353,
  badTile: 0xf0443a,
};
