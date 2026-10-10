import * as THREE from 'three';
import { K } from '../world/grid';
import { boxOnGround, cylinder, facadeWindows, merge, pyramidRoof } from './geometry';
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

export function buildAllModels(): Map<ModelKey, BuildingModel> {
  const map = new Map<ModelKey, BuildingModel>();
  for (let lv = 1; lv <= 3; lv++) {
    map.set(modelKey(K.RES, lv), residential(lv));
    map.set(modelKey(K.COM, lv), commercial(lv));
    map.set(modelKey(K.IND, lv), industrial(lv));
  }
  for (const [id, model] of buildFacilityModels()) map.set(modelKey(K.FAC, id), model);
  return map;
}
