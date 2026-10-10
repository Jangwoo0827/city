import * as THREE from 'three';
import { K } from '../world/grid';
import { box, boxOnGround, cylinder, facadeWindows, merge, pyramidRoof } from './geometry';
import { buildFacilityModels } from './facilityModels';

export interface BuildingModel {
  body: THREE.BufferGeometry;
  /** 밤에 불이 켜지는 창 (없을 수 있음) */
  windows: THREE.BufferGeometry | null;
}

// ── 주거: 낮고 지붕이 있는 집 ─────────────────────────────
const RES_WALL = [0, 0xd4e9b8, 0xa8d88f, 0x78c077];
const RES_ROOF = [0, 0xc8603f, 0xb4503a, 0x9c4332];

function residential(level: number): BuildingModel {
  const dims = [
    [0, 0, 0, 0],
    [0.5, 0.46, 0.34, 0.22],
    [0.58, 0.52, 0.52, 0.26],
    [0.66, 0.6, 0.8, 0.3],
  ][level];
  const [w, d, h, roofH] = dims;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(boxOnGround(w, h, d, 0, 0, 0, RES_WALL[level]));
  parts.push(pyramidRoof(w * 1.12, d * 1.12, roofH, 0, h, 0, RES_ROOF[level]));
  // 문 + 굴뚝
  parts.push(boxOnGround(0.1, 0.16, 0.02, 0, 0, d / 2 + 0.005, 0x7a5a3a));
  if (level >= 2) parts.push(boxOnGround(0.07, 0.2, 0.07, w * 0.25, h + roofH * 0.35, -d * 0.2, 0x8a6a58));
  if (level === 3) parts.push(boxOnGround(0.3, 0.26, 0.24, w / 2 + 0.1, 0, 0.1, RES_WALL[2]));
  const rows = level === 1 ? [h * 0.55] : level === 2 ? [0.15, 0.36] : [0.15, 0.36, 0.58];
  const win: THREE.BufferGeometry[] = [];
  facadeWindows(win, w, d, 0, rows, 2, 0.1, 0.1);
  return { body: merge(parts), windows: merge(win) };
}

// ── 상업: 중간 높이 유리 건물 ─────────────────────────────
const COM_WALL = [0, 0xb7d4f4, 0x7fb0ea, 0x4d8bd8];
const COM_H = [0, 0.78, 1.25, 1.95];

function commercial(level: number): BuildingModel {
  const w = [0, 0.68, 0.7, 0.72][level];
  const h = COM_H[level];
  const parts: THREE.BufferGeometry[] = [];
  parts.push(boxOnGround(w, h, w, 0, 0, 0, COM_WALL[level]));
  parts.push(boxOnGround(w + 0.04, 0.05, w + 0.04, 0, h, 0, 0x5c6b7d));
  parts.push(boxOnGround(0.22, 0.12, 0.22, 0.15, h + 0.05, -0.12, 0x8794a6));
  if (level === 3) {
    parts.push(cylinder(0.015, 0.4, -0.18, h + 0.05, 0.15, 0xc9d1dc, 6));
    parts.push(boxOnGround(w + 0.1, 0.12, w + 0.1, 0, 0, 0, 0x6c7a8c)); // 저층 기단
  }
  const rowCount = [0, 3, 5, 8][level];
  const rows: number[] = [];
  for (let r = 0; r < rowCount; r++) rows.push(0.2 + r * ((h - 0.32) / Math.max(1, rowCount - 1)));
  const win: THREE.BufferGeometry[] = [];
  facadeWindows(win, w, w, 0, rows, 3, 0.13, 0.1);
  return { body: merge(parts), windows: merge(win) };
}

// ── 공업: 굴뚝 달린 낮은 박스 ─────────────────────────────
const IND_WALL = [0, 0xeadf9c, 0xe0c65a, 0xcfa62e];
const IND_H = [0, 0.34, 0.48, 0.62];

function industrial(level: number): BuildingModel {
  const w = [0, 0.74, 0.8, 0.84][level];
  const d = [0, 0.68, 0.72, 0.78][level];
  const h = IND_H[level];
  const parts: THREE.BufferGeometry[] = [];
  parts.push(boxOnGround(w, h, d, 0, 0, 0, IND_WALL[level]));
  parts.push(boxOnGround(w + 0.03, 0.04, d + 0.03, 0, h, 0, 0x6f6a5c));
  const chimneys: [number, number, number][] =
    level === 1 ? [[0.24, -0.18, 0.34]] : level === 2 ? [[0.26, -0.2, 0.42], [0.1, -0.22, 0.34]] : [[0.3, -0.22, 0.52], [0.14, -0.24, 0.42], [-0.02, -0.24, 0.34]];
  for (const [cx, cz, ch] of chimneys) {
    parts.push(cylinder(0.06, ch, cx, h, cz, 0x8a8a8a, 8, 0.045));
    parts.push(cylinder(0.065, 0.04, cx, h + ch, cz, 0x4a4a4a, 8));
  }
  if (level >= 2) parts.push(boxOnGround(0.3, 0.26, 0.3, -w * 0.22, h + 0.04, d * 0.15, 0xb9b095));
  if (level === 3) parts.push(boxOnGround(0.22, 0.4, 0.22, -w * 0.3, h + 0.04, -d * 0.2, 0xa89f84));
  const rows = level === 1 ? [h * 0.5] : [h * 0.35, h * 0.7];
  const win: THREE.BufferGeometry[] = [];
  facadeWindows(win, w, d, 0, rows, 3, 0.12, 0.07);
  return { body: merge(parts), windows: merge(win) };
}

export type ModelKey = string;
export const modelKey = (kind: number, level: number): ModelKey => `${kind}:${level}`;

// ── 고밀 주거: 아파트 ────────────────────────────────────
const RESH_WALL = [0, 0xe9d2b0, 0xdcb68a, 0xcb9a6c];
const RESH_H = [0, 0.95, 1.55, 2.5];

function residentialHigh(level: number): BuildingModel {
  const h = RESH_H[level];
  const w = 0.82;
  const d = level === 3 ? 0.6 : 0.7;
  const parts: THREE.BufferGeometry[] = [];
  if (level === 3) {
    // 저층 기단 + 고층 타워
    parts.push(boxOnGround(0.9, 0.3, 0.9, 0, 0, 0, 0xb9855a));
    parts.push(boxOnGround(0.62, h - 0.3, 0.62, 0, 0.3, 0, RESH_WALL[3]));
    parts.push(boxOnGround(0.66, 0.05, 0.66, 0, h, 0, 0x5c4f45));
  } else {
    parts.push(boxOnGround(w, h, d, 0, 0, 0, RESH_WALL[level]));
    parts.push(boxOnGround(w + 0.04, 0.05, d + 0.04, 0, h, 0, 0x5c4f45));
    parts.push(boxOnGround(0.2, 0.12, 0.2, 0.2, h + 0.05, -0.1, 0x8a7b6a)); // 옥탑
  }
  // 발코니 띠
  const floors = [0, 3, 5, 8][level];
  for (let f = 1; f < floors; f += 2) {
    const y = 0.12 + (f * (h - 0.2)) / floors;
    parts.push(boxOnGround(level === 3 ? 0.66 : w + 0.03, 0.025, level === 3 ? 0.66 : d + 0.03, 0, y, 0, 0xf4efe6));
  }
  const rows: number[] = [];
  for (let f = 0; f < floors; f++) rows.push(0.14 + (f * (h - 0.28)) / Math.max(1, floors - 1));
  const win: THREE.BufferGeometry[] = [];
  facadeWindows(win, level === 3 ? 0.62 : w, level === 3 ? 0.62 : d, level === 3 ? 0.3 : 0, rows.map((r) => (level === 3 ? r - 0.3 : r)).filter((r) => r > 0.02), 3, 0.11, 0.09);
  return { body: merge(parts), windows: merge(win) };
}

// ── 고밀 상업: 쇼핑몰 ────────────────────────────────────
const COMH_WALL = [0, 0xe8a9c8, 0xd77aa7, 0xc2569a];

function commercialHigh(level: number): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  const baseH = [0, 0.5, 0.85, 0.55][level];
  parts.push(boxOnGround(0.9, baseH, 0.9, 0, 0, 0, COMH_WALL[level]));
  parts.push(boxOnGround(0.94, 0.05, 0.94, 0, baseH, 0, 0x6a3b58));
  parts.push(boxOnGround(0.5, 0.14, 0.04, 0, baseH + 0.05, 0.38, 0xfff3b0)); // 간판
  parts.push(boxOnGround(0.5, 0.2, 0.04, 0, 0.05, 0.46, 0x3a2a35)); // 입구
  let towerH = 0;
  if (level === 3) {
    towerH = 1.1;
    parts.push(boxOnGround(0.56, towerH, 0.56, 0, baseH + 0.05, 0, 0xa83a85));
    parts.push(boxOnGround(0.6, 0.05, 0.6, 0, baseH + 0.05 + towerH, 0, 0x6a3b58));
    parts.push(cylinder(0.015, 0.4, 0, baseH + 0.1 + towerH, 0, 0xc9d1dc, 6));
  }
  const win: THREE.BufferGeometry[] = [];
  const baseRows = baseH > 0.7 ? [0.28, 0.55] : [0.28];
  facadeWindows(win, 0.9, 0.9, 0, baseRows, 4, 0.16, 0.1);
  if (level === 3) {
    const rows: number[] = [];
    for (let r = 0; r < 5; r++) rows.push(0.18 + r * 0.2);
    facadeWindows(win, 0.56, 0.56, baseH + 0.05, rows, 3, 0.12, 0.1);
  }
  return { body: merge(parts), windows: merge(win) };
}

// ── 사무: 유리 커튼월 오피스 ─────────────────────────────
const OFF_WALL = [0, 0xa6e0dd, 0x6ac4c4, 0x3aa5ad];
const OFF_H = [0, 1.0, 1.8, 3.0];

function office(level: number): BuildingModel {
  const parts: THREE.BufferGeometry[] = [];
  const h = OFF_H[level];
  const win: THREE.BufferGeometry[] = [];
  if (level === 1) {
    parts.push(boxOnGround(0.72, h, 0.62, 0, 0, 0, OFF_WALL[1]));
    parts.push(boxOnGround(0.76, 0.05, 0.66, 0, h, 0, 0x4a6e70));
    parts.push(boxOnGround(0.2, 0.1, 0.2, 0.15, h + 0.05, 0, 0x7e9a9c));
    const rows: number[] = [];
    for (let r = 0; r < 4; r++) rows.push(0.16 + r * 0.22);
    facadeWindows(win, 0.72, 0.62, 0, rows, 4, 0.13, 0.11);
  } else if (level === 2) {
    // 2단 셋백
    parts.push(boxOnGround(0.76, 1.1, 0.7, 0, 0, 0, OFF_WALL[2]));
    parts.push(boxOnGround(0.58, h - 1.1, 0.52, 0, 1.1, 0, 0x57b0b0));
    parts.push(boxOnGround(0.62, 0.05, 0.56, 0, h, 0, 0x3f6f72));
    const r1: number[] = [];
    for (let r = 0; r < 5; r++) r1.push(0.14 + r * 0.2);
    facadeWindows(win, 0.76, 0.7, 0, r1, 4, 0.13, 0.11);
    const r2: number[] = [];
    for (let r = 0; r < 3; r++) r2.push(0.14 + r * 0.2);
    facadeWindows(win, 0.58, 0.52, 1.1, r2, 3, 0.13, 0.11);
  } else {
    // 3단 셋백 + 안테나/헬리패드
    parts.push(boxOnGround(0.8, 1.2, 0.74, 0, 0, 0, OFF_WALL[3]));
    parts.push(boxOnGround(0.62, 1.0, 0.56, 0, 1.2, 0, 0x2f929a));
    parts.push(boxOnGround(0.44, h - 2.2, 0.4, 0, 2.2, 0, 0x2a7f88));
    parts.push(boxOnGround(0.48, 0.05, 0.44, 0, h, 0, 0x2a5a60));
    parts.push(cylinder(0.012, 0.5, 0, h + 0.05, 0, 0xc9d1dc, 6));
    parts.push(cylinder(0.12, 0.02, 0, h + 0.05, 0, 0x4d5560, 12));
    const r1: number[] = [];
    for (let r = 0; r < 5; r++) r1.push(0.14 + r * 0.22);
    facadeWindows(win, 0.8, 0.74, 0, r1, 5, 0.12, 0.12);
    const r2: number[] = [];
    for (let r = 0; r < 4; r++) r2.push(0.12 + r * 0.22);
    facadeWindows(win, 0.62, 0.56, 1.2, r2, 4, 0.12, 0.12);
    const r3: number[] = [];
    for (let r = 0; r < 4; r++) r3.push(0.12 + r * 0.2);
    facadeWindows(win, 0.44, 0.4, 2.2, r3, 3, 0.1, 0.12);
  }
  // 입구 캐노피
  parts.push(box(0.3, 0.025, 0.14, 0, 0.1, level === 1 ? 0.34 : 0.4, 0x2c4f52));
  return { body: merge(parts), windows: merge(win) };
}

export function buildAllModels(): Map<ModelKey, BuildingModel> {
  const map = new Map<ModelKey, BuildingModel>();
  for (let lv = 1; lv <= 3; lv++) {
    map.set(modelKey(K.RES, lv), residential(lv));
    map.set(modelKey(K.COM, lv), commercial(lv));
    map.set(modelKey(K.IND, lv), industrial(lv));
    map.set(modelKey(K.RESH, lv), residentialHigh(lv));
    map.set(modelKey(K.COMH, lv), commercialHigh(lv));
    map.set(modelKey(K.OFF, lv), office(lv));
  }
  for (const [id, model] of buildFacilityModels()) map.set(modelKey(K.FAC, id), model);
  return map;
}
