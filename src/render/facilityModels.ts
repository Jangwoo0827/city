import * as THREE from 'three';
import { FAC } from '../data/catalog';
import { box, boxOnGround, cylinder, facadeWindows, merge, pyramidRoof, windowQuad } from './geometry';
import type { BuildingModel } from './models';

/** 풍력 터빈 (1×1, 원점 = 타일 중심) */
function wind(): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(cylinder(0.11, 0.06, 0, 0, 0, 0x9aa1a8, 10));
  parts.push(cylinder(0.05, 0.95, 0, 0.06, 0, 0xf1f3f5, 10, 0.03));
  parts.push(boxOnGround(0.09, 0.09, 0.16, 0, 1.0, 0.03, 0xdfe3e7));
  // 날개 3개 (정지 상태 모양)
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3 + 0.4;
    const g = new THREE.BoxGeometry(0.03, 0.42, 0.012);
    g.translate(0, 0.21, 0);
    g.rotateZ(a);
    g.translate(0, 1.045, 0.11);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3).fill(0.93);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  return { body: merge(parts), windows: null };
}

/** 석탄 발전소 (2×2) */
function coal(): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(1.86, 0.08, 1.86, 0, 0.04, 0, 0x8d949c));
  parts.push(boxOnGround(1.0, 0.62, 0.7, -0.45, 0.08, -0.5, 0xc7ccd3));
  parts.push(boxOnGround(1.04, 0.05, 0.74, -0.45, 0.7, -0.5, 0x5f6670));
  parts.push(cylinder(0.3, 0.9, 0.5, 0.08, 0.35, 0xe9ecef, 14, 0.2));
  parts.push(cylinder(0.2, 0.04, 0.5, 0.98, 0.35, 0x8d949c, 14));
  parts.push(cylinder(0.075, 0.5, -0.65, 0.08, 0.45, 0xd9534f, 10, 0.065));
  parts.push(cylinder(0.065, 0.45, -0.65, 0.58, 0.45, 0xf4f4f4, 10, 0.055));
  parts.push(cylinder(0.055, 0.35, -0.65, 1.03, 0.45, 0xd9534f, 10, 0.045));
  parts.push(boxOnGround(0.3, 0.2, 0.3, 0.35, 0.08, -0.55, 0x4d5560));
  parts.push(boxOnGround(0.2, 0.28, 0.2, -0.2, 0.08, 0.5, 0x4d5560));
  const win: THREE.BufferGeometry[] = [];
  for (let c = 0; c < 4; c++) win.push(windowQuad(0.16, 0.12, -0.8 + c * 0.24, 0.4, -0.5 + 0.35 + 0.004, 0));
  return { body: merge(parts), windows: merge(win) };
}

/** 취수장 (1×1) */
function pump(): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(boxOnGround(0.62, 0.05, 0.62, 0, 0, 0, 0x8d949c));
  parts.push(boxOnGround(0.42, 0.32, 0.36, -0.05, 0.05, 0.05, 0x5b8fb9));
  parts.push(pyramidRoof(0.5, 0.44, 0.14, -0.05, 0.37, 0.05, 0x3f5f7a));
  parts.push(cylinder(0.055, 0.45, 0.2, 0.05, -0.18, 0x7e8a96, 8));
  parts.push(cylinder(0.04, 0.3, 0.2, 0.2, -0.28, 0x7e8a96, 8));
  return { body: merge(parts), windows: null };
}

/** 급수탑 (2×2) */
function tower(): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(1.7, 0.06, 1.7, 0, 0.03, 0, 0x8d949c));
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]] as [number, number][]) {
    parts.push(cylinder(0.04, 1.0, x, 0.06, z, 0x7e8a96, 6));
  }
  parts.push(boxOnGround(0.7, 0.04, 0.7, 0, 0.7, 0, 0x6f7a86));
  parts.push(cylinder(0.46, 0.5, 0, 1.06, 0, 0x5b8fb9, 16));
  parts.push(cylinder(0.46, 0.14, 0, 1.56, 0, 0x3f5f7a, 16, 0.02));
  parts.push(boxOnGround(0.3, 0.3, 0.3, 0.55, 0.06, 0.55, 0xc7ccd3));
  return { body: merge(parts), windows: null };
}

/** 지하수 우물 (1×1) */
function well(): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(cylinder(0.26, 0.05, 0, 0, 0, 0x8d949c, 12));
  parts.push(cylinder(0.2, 0.2, 0, 0.05, 0, 0xa59a8a, 12));
  parts.push(cylinder(0.13, 0.02, 0, 0.24, 0, 0x2a6fb0, 12));
  parts.push(boxOnGround(0.04, 0.32, 0.04, -0.17, 0.05, 0, 0x7a5a3a));
  parts.push(boxOnGround(0.04, 0.32, 0.04, 0.17, 0.05, 0, 0x7a5a3a));
  parts.push(pyramidRoof(0.46, 0.34, 0.14, 0, 0.36, 0, 0x9c4332));
  return { body: merge(parts), windows: null };
}

/** 하수 배출구 (1×1) */
function outlet(): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(boxOnGround(0.62, 0.05, 0.62, 0, 0, 0, 0x8d949c));
  parts.push(boxOnGround(0.36, 0.26, 0.36, -0.08, 0.05, -0.06, 0x7a6c5a));
  parts.push(cylinder(0.09, 0.34, 0.2, 0.05, 0.12, 0x5a4b3c, 10));
  parts.push(cylinder(0.11, 0.04, 0.2, 0.39, 0.12, 0x3a2f26, 10));
  return { body: merge(parts), windows: null };
}

/** 폐수 처리장 (2×2) */
function treatment(): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(1.86, 0.06, 1.86, 0, 0.03, 0, 0x8d949c));
  parts.push(cylinder(0.42, 0.3, -0.42, 0.06, -0.4, 0x6ab187, 18));
  parts.push(cylinder(0.42, 0.3, 0.42, 0.06, -0.4, 0x6ab187, 18));
  parts.push(cylinder(0.36, 0.04, -0.42, 0.36, -0.4, 0x3f7f5d, 18));
  parts.push(cylinder(0.36, 0.04, 0.42, 0.36, -0.4, 0x3f7f5d, 18));
  parts.push(boxOnGround(1.2, 0.4, 0.5, 0, 0.06, 0.45, 0xc7ccd3));
  parts.push(boxOnGround(1.24, 0.04, 0.54, 0, 0.46, 0.45, 0x5f6670));
  parts.push(cylinder(0.06, 0.55, 0.6, 0.46, 0.5, 0x8a8a8a, 8, 0.045));
  const win: THREE.BufferGeometry[] = [];
  for (let c = 0; c < 3; c++) win.push(windowQuad(0.2, 0.1, -0.35 + c * 0.35, 0.3, 0.45 + 0.25 + 0.004, 0));
  return { body: merge(parts), windows: merge(win) };
}

/** 빨간 십자 (평면 위 y 높이에 가로 방향 십자, 크기 s) */
function redCross(parts: THREE.BufferGeometry[], x: number, y: number, z: number, s: number): void {
  parts.push(box(s, 0.02, s * 0.3, x, y, z, 0xd9453c));
  parts.push(box(s * 0.3, 0.02, s, x, y, z, 0xd9453c));
}

/** 나무 한 그루 (줄기 + 원뿔형 수관) */
function tree(parts: THREE.BufferGeometry[], x: number, z: number, baseY: number, scale = 1, color = 0x3f9d4f): void {
  parts.push(cylinder(0.035 * scale, 0.14 * scale, x, baseY, z, 0x7a5a3a, 6));
  parts.push(cylinder(0.15 * scale, 0.3 * scale, x, baseY + 0.12 * scale, z, color, 7, 0.02 * scale));
}

/** 진료소 (2×2) */
function clinic(): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(1.7, 0.04, 1.6, 0, 0.02, 0, 0xcfd6dc));
  parts.push(boxOnGround(1.25, 0.5, 0.95, -0.1, 0.04, -0.1, 0xeaf2f8));
  parts.push(boxOnGround(1.3, 0.06, 1.0, -0.1, 0.54, -0.1, 0x6fb1d6));
  parts.push(boxOnGround(0.45, 0.32, 0.5, 0.58, 0.04, 0.35, 0xdbe6ee));
  redCross(parts, -0.1, 0.61, -0.1, 0.42);
  parts.push(boxOnGround(0.28, 0.03, 0.12, -0.1, 0.04, 0.4, 0x6fb1d6)); // 입구 차양
  const win: THREE.BufferGeometry[] = [];
  facadeWindows(win, 1.25, 0.95, 0.04, [0.2, 0.38], 3, 0.14, 0.1, -0.1, -0.1);
  return { body: merge(parts), windows: merge(win) };
}

/** 병원 (3×3) */
function hospital(): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(2.7, 0.04, 2.7, 0, 0.02, 0, 0xcfd6dc));
  parts.push(boxOnGround(2.0, 0.85, 1.3, 0, 0.04, 0.5, 0xeef3f7));
  parts.push(boxOnGround(2.04, 0.05, 1.34, 0, 0.89, 0.5, 0x6fb1d6));
  parts.push(boxOnGround(0.9, 1.5, 0.9, -0.5, 0.04, -0.7, 0xe3ecf2));
  parts.push(boxOnGround(0.94, 0.05, 0.94, -0.5, 1.54, -0.7, 0x6fb1d6));
  // 옥상 헬리패드
  parts.push(cylinder(0.3, 0.03, 0.55, 0.94, 0.5, 0x4d5560, 20));
  parts.push(box(0.05, 0.012, 0.28, 0.46, 0.972, 0.5, 0xf4f4f4));
  parts.push(box(0.05, 0.012, 0.28, 0.64, 0.972, 0.5, 0xf4f4f4));
  parts.push(box(0.2, 0.012, 0.05, 0.55, 0.972, 0.5, 0xf4f4f4));
  redCross(parts, -0.5, 1.6, -0.7, 0.4);
  parts.push(boxOnGround(0.5, 0.16, 0.3, 0.55, 0.04, 1.28, 0xdbe6ee)); // 응급 출입구
  const win: THREE.BufferGeometry[] = [];
  facadeWindows(win, 2.0, 1.3, 0.04, [0.22, 0.45, 0.68], 5, 0.14, 0.1, 0, 0.5);
  facadeWindows(win, 0.9, 0.9, 0.04, [0.25, 0.5, 0.75, 1.0, 1.25], 3, 0.12, 0.1, -0.5, -0.7);
  return { body: merge(parts), windows: merge(win) };
}

/** 경찰서 (2×2) */
function police(): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(1.7, 0.04, 1.6, 0, 0.02, 0, 0x9aa1a8));
  parts.push(boxOnGround(1.3, 0.62, 1.0, 0, 0.04, -0.05, 0x4a6fa8));
  parts.push(boxOnGround(1.34, 0.05, 1.04, 0, 0.66, -0.05, 0x2f4672));
  parts.push(boxOnGround(1.3, 0.07, 1.0, 0, 0.3, -0.05, 0xf1f3f5)); // 흰 띠
  parts.push(cylinder(0.07, 0.08, 0.38, 0.71, 0.0, 0xd9453c, 8)); // 경광등
  parts.push(cylinder(0.07, 0.08, 0.5, 0.71, 0.0, 0x3b82f6, 8));
  parts.push(cylinder(0.012, 0.5, -0.5, 0.04, 0.6, 0xc9d1dc, 5)); // 깃대
  parts.push(boxOnGround(0.22, 0.12, 0.012, -0.39, 0.46, 0.6, 0x3b82f6));
  parts.push(boxOnGround(0.34, 0.2, 0.26, 0.45, 0.04, 0.55, 0x2f4672)); // 차고 한 칸
  const win: THREE.BufferGeometry[] = [];
  facadeWindows(win, 1.3, 1.0, 0.04, [0.18, 0.48], 3, 0.14, 0.09, 0, -0.05);
  return { body: merge(parts), windows: merge(win) };
}

/** 소방서 (2×2) */
function fireStation(): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(1.7, 0.04, 1.6, 0, 0.02, 0, 0x9aa1a8));
  parts.push(boxOnGround(1.4, 0.58, 0.95, -0.1, 0.04, -0.1, 0xd9453c));
  parts.push(boxOnGround(1.44, 0.05, 0.99, -0.1, 0.62, -0.1, 0x8a2a24));
  // 차고 문 3개
  for (let k = 0; k < 3; k++) parts.push(boxOnGround(0.3, 0.34, 0.02, -0.4 + k * 0.34, 0.04, 0.38, 0xf1f3f5));
  // 훈련 탑
  parts.push(boxOnGround(0.32, 1.1, 0.32, 0.62, 0.04, -0.4, 0xc23a32));
  parts.push(boxOnGround(0.36, 0.05, 0.36, 0.62, 1.14, -0.4, 0x8a2a24));
  parts.push(cylinder(0.02, 0.2, 0.62, 1.19, -0.4, 0xc9d1dc, 5));
  const win: THREE.BufferGeometry[] = [];
  facadeWindows(win, 1.4, 0.95, 0.4, [0.1], 4, 0.12, 0.08, -0.1, -0.1);
  facadeWindows(win, 0.32, 0.32, 0.04, [0.5, 0.8], 1, 0.1, 0.1, 0.62, -0.4);
  return { body: merge(parts), windows: merge(win) };
}

/** 소공원 (1×1) */
function parkSmall(): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(0.94, 0.03, 0.94, 0, 0.015, 0, 0x6fbf6a));
  parts.push(box(0.14, 0.035, 0.94, 0, 0.018, 0, 0xd8cfae)); // 산책로
  tree(parts, -0.3, -0.28, 0.03, 1.1);
  tree(parts, 0.3, 0.25, 0.03, 0.9, 0x4aa85a);
  tree(parts, 0.28, -0.3, 0.03, 0.8, 0x2f8f4a);
  parts.push(boxOnGround(0.2, 0.05, 0.06, -0.28, 0.03, 0.3, 0x8a5a3a)); // 벤치
  return { body: merge(parts), windows: null };
}

/** 대공원 (2×2) */
function parkLarge(): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(1.94, 0.03, 1.94, 0, 0.015, 0, 0x6fbf6a));
  parts.push(box(0.16, 0.035, 1.94, 0, 0.018, 0, 0xd8cfae));
  parts.push(box(1.94, 0.035, 0.16, 0, 0.018, 0, 0xd8cfae));
  parts.push(cylinder(0.3, 0.02, -0.55, 0.03, -0.55, 0x4ea3dd, 18)); // 연못
  const trees: [number, number, number, number][] = [
    [0.55, -0.6, 1.2, 0x3f9d4f], [0.8, -0.3, 0.9, 0x2f8f4a], [-0.7, 0.55, 1.1, 0x4aa85a],
    [0.6, 0.65, 1.3, 0x3f9d4f], [-0.35, 0.8, 0.8, 0x2f8f4a], [0.25, 0.3, 0.9, 0x4aa85a], [-0.85, -0.2, 1.0, 0x3f9d4f],
  ];
  for (const [x, z, sc, c] of trees) tree(parts, x, z, 0.03, sc, c);
  parts.push(boxOnGround(0.24, 0.05, 0.07, 0.3, 0.03, -0.3, 0x8a5a3a));
  parts.push(boxOnGround(0.07, 0.05, 0.24, -0.3, 0.03, 0.35, 0x8a5a3a));
  return { body: merge(parts), windows: null };
}

export function buildFacilityModels(): Map<number, BuildingModel> {
  const m = new Map<number, BuildingModel>();
  m.set(FAC.WIND, wind());
  m.set(FAC.COAL, coal());
  m.set(FAC.PUMP, pump());
  m.set(FAC.TOWER, tower());
  m.set(FAC.WELL, well());
  m.set(FAC.OUTLET, outlet());
  m.set(FAC.TREATMENT, treatment());
  m.set(FAC.CLINIC, clinic());
  m.set(FAC.HOSPITAL, hospital());
  m.set(FAC.POLICE, police());
  m.set(FAC.FIRE, fireStation());
  m.set(FAC.PARK_S, parkSmall());
  m.set(FAC.PARK_L, parkLarge());
  return m;
}
