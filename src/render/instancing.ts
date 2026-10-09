import * as THREE from 'three';
import { BUILD_ANIM_SECONDS, COLORS, GRID_SIZE } from '../utils/constants';
import { clamp, easeOutBack, hash01 } from '../utils/math';
import { GameState } from '../game/state';
import { DIRS, K, isZoneKind } from '../world/grid';
import { roadMask } from '../world/roads';
import { box, merge } from './geometry';
import { BuildingModel, ModelKey, buildAllModels, modelKey } from './models';

const CAP = GRID_SIZE * GRID_SIZE;
const PLANT_CAP = 256;
const SIDEWALK = 0xbdb9ad;
const ASPHALT = 0x3d4148;
const MARKING = 0xf1e58a;

const ROAD_HALF = 0.32; // 차도 반폭
const ROAD_H = 0.065;

const WINDOW_DAY = new THREE.Color(0x7d9cb8);
const WINDOW_NIGHT = new THREE.Color(0xffd88a);

/** 이웃 연결 비트마스크(북1 동2 남4 서8)로 도로 타일 모양을 생성 */
function buildRoadGeometry(mask: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(1, 0.05, 1, 0, 0.025, 0, SIDEWALK));
  const w = ROAD_HALF * 2;
  parts.push(box(w, ROAD_H, w, 0, ROAD_H / 2, 0, ASPHALT));
  const armLen = 0.5 - ROAD_HALF;
  const armMid = ROAD_HALF + armLen / 2;
  for (let d = 0; d < 4; d++) {
    if (!(mask & (1 << d))) continue;
    const [dx, dz] = DIRS[d];
    const horizontal = dx !== 0;
    const aw = horizontal ? armLen : w;
    const ad = horizontal ? w : armLen;
    parts.push(box(aw, ROAD_H, ad, dx * armMid, ROAD_H / 2, dz * armMid, ASPHALT));
    // 중앙선 점선(팔 끝 부분)
    const mw = horizontal ? armLen : 0.035;
    const md = horizontal ? 0.035 : armLen;
    parts.push(box(mw, 0.004, md, dx * armMid, ROAD_H + 0.002, dz * armMid, MARKING));
  }
  return merge(parts);
}

function makeInstanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  cap: number,
  name: string,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.name = name;
  return mesh;
}

/** 맵 상태를 InstancedMesh 들로 동기화한다 (도로 / 구역 / 건물) */
export class CityMeshes {
  readonly group = new THREE.Group();

  private readonly roadMeshes: THREE.InstancedMesh[] = [];
  private readonly zoneMesh: THREE.InstancedMesh;
  private readonly zoneMat: THREE.MeshBasicMaterial;
  private readonly bodyMeshes = new Map<ModelKey, THREE.InstancedMesh>();
  private readonly windowMeshes = new Map<ModelKey, THREE.InstancedMesh>();
  readonly windowMat = new THREE.MeshBasicMaterial({ color: WINDOW_DAY });

  private readonly m = new THREE.Matrix4();
  private readonly dummy = new THREE.Object3D();
  private readonly tmpColor = new THREE.Color();

  // 건물 등장 애니메이션 상태
  private readonly prevLevel = new Uint8Array(CAP);
  private readonly prevKind = new Uint8Array(CAP);
  private readonly riseStart = new Float32Array(CAP);
  private snapshot = true;

  constructor(private readonly state: GameState) {
    const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (let mask = 0; mask < 16; mask++) {
      const mesh = makeInstanced(buildRoadGeometry(mask), roadMat, CAP, `road-${mask}`);
      mesh.receiveShadow = true;
      this.roadMeshes.push(mesh);
      this.group.add(mesh);
    }

    // 구역 바닥 표시
    this.zoneMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false });
    this.zoneMesh = makeInstanced(new THREE.PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2), this.zoneMat, CAP, 'zones');
    this.zoneMesh.renderOrder = 1;
    this.group.add(this.zoneMesh);

    // 건물 모델
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const models: Map<ModelKey, BuildingModel> = buildAllModels();
    for (const [key, model] of models) {
      const cap = key.startsWith(`${K.PLANT}:`) ? PLANT_CAP : CAP;
      const body = makeInstanced(model.body, bodyMat, cap, `bld-${key}`);
      body.castShadow = true;
      body.receiveShadow = true;
      this.bodyMeshes.set(key, body);
      this.group.add(body);
      if (model.windows) {
        const win = makeInstanced(model.windows, this.windowMat, cap, `win-${key}`);
        this.windowMeshes.set(key, win);
        this.group.add(win);
      }
    }
  }

  /** 불러오기/새 게임 직후: 이미 있는 건물은 솟아오르는 애니메이션 없이 표시 */
  resetAnimations(): void {
    this.snapshot = true;
  }

  /** 0 = 낮, 1 = 밤 */
  setNight(n: number): void {
    this.windowMat.color.lerpColors(WINDOW_DAY, WINDOW_NIGHT, n);
    const k = 1 - 0.55 * n;
    this.zoneMat.color.setScalar(k);
  }

  /** 매 프레임 호출: 변경 플래그가 있으면 인스턴스를 다시 채운다 */
  sync(time: number): void {
    const s = this.state;
    if (s.dirty.roads) {
      s.dirty.roads = false;
      this.rebuildRoads();
    }
    if (s.dirty.zones) {
      s.dirty.zones = false;
      this.rebuildZones();
    }
    if (s.dirty.buildings) {
      s.dirty.buildings = false;
      if (this.rebuildBuildings(time)) s.dirty.buildings = true; // 애니메이션 진행 중
    }
  }

  private rebuildRoads(): void {
    const g = this.state.grid;
    const counts = new Array<number>(16).fill(0);
    for (let y = 0; y < g.size; y++) {
      for (let x = 0; x < g.size; x++) {
        if (g.kind[g.idx(x, y)] !== K.ROAD) continue;
        const mask = roadMask(g, x, y);
        this.m.makeTranslation(x + 0.5, 0, y + 0.5);
        this.roadMeshes[mask].setMatrixAt(counts[mask]++, this.m);
      }
    }
    for (let mask = 0; mask < 16; mask++) {
      const mesh = this.roadMeshes[mask];
      mesh.count = counts[mask];
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private rebuildZones(): void {
    const g = this.state.grid;
    let n = 0;
    for (let i = 0; i < g.count; i++) {
      const k = g.kind[i];
      if (!isZoneKind(k)) continue;
      const x = i % g.size;
      const y = (i / g.size) | 0;
      this.m.makeTranslation(x + 0.5, 0.025, y + 0.5);
      this.zoneMesh.setMatrixAt(n, this.m);
      this.zoneMesh.setColorAt(
        n,
        this.tmpColor.setHex(k === K.RES ? COLORS.zone.R : k === K.COM ? COLORS.zone.C : COLORS.zone.I),
      );
      n++;
    }
    this.zoneMesh.count = n;
    this.zoneMesh.instanceMatrix.needsUpdate = true;
    if (this.zoneMesh.instanceColor) this.zoneMesh.instanceColor.needsUpdate = true;
  }

  /** @returns 솟아오르는 애니메이션이 아직 진행 중이면 true */
  private rebuildBuildings(time: number): boolean {
    const g = this.state.grid;
    const counts = new Map<ModelKey, number>();
    for (const key of this.bodyMeshes.keys()) counts.set(key, 0);
    let animating = false;

    for (let i = 0; i < g.count; i++) {
      const k = g.kind[i];
      let key: ModelKey | null = null;
      let level = 0;
      if (isZoneKind(k) && g.level[i] > 0) {
        level = g.level[i];
        key = modelKey(k, level);
      } else if (k === K.PLANT && g.plantOwner[i] === i + 1) {
        level = 1;
        key = modelKey(K.PLANT, 1);
      }
      if (key === null) {
        this.prevLevel[i] = 0;
        this.prevKind[i] = 0;
        continue;
      }

      if (this.snapshot) {
        this.riseStart[i] = -1e6;
      } else if (this.prevLevel[i] !== level || this.prevKind[i] !== k) {
        this.riseStart[i] = time;
      }
      this.prevLevel[i] = level;
      this.prevKind[i] = k;

      const f = clamp((time - this.riseStart[i]) / BUILD_ANIM_SECONDS, 0, 1);
      let sy = 1;
      if (f < 1) {
        sy = Math.max(0.001, easeOutBack(f));
        animating = true;
      }

      const x = i % g.size;
      const y = (i / g.size) | 0;
      const d = this.dummy;
      let yaw = 0;
      if (k === K.PLANT) {
        d.position.set(x + 1, 0, y + 1);
      } else {
        d.position.set(x + 0.5, 0, y + 0.5);
        yaw = this.facingYaw(x, y, g.variant[i]);
      }
      d.rotation.set(0, yaw, 0);
      d.scale.set(1, sy, 1);
      d.updateMatrix();

      const idx = counts.get(key) ?? 0;
      counts.set(key, idx + 1);
      const body = this.bodyMeshes.get(key)!;
      body.setMatrixAt(idx, d.matrix);
      this.tmpColor.setScalar(0.9 + 0.2 * hash01(i * 31 + g.variant[i]));
      body.setColorAt(idx, this.tmpColor);
      this.windowMeshes.get(key)?.setMatrixAt(idx, d.matrix);
    }

    for (const [key, body] of this.bodyMeshes) {
      const n = counts.get(key) ?? 0;
      body.count = n;
      body.instanceMatrix.needsUpdate = true;
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      const win = this.windowMeshes.get(key);
      if (win) {
        win.count = n;
        win.instanceMatrix.needsUpdate = true;
      }
    }
    this.snapshot = false;
    return animating;
  }

  /** 가까운 도로 쪽을 바라보도록 건물 방향 결정 (도로가 없으면 변주값으로) */
  private facingYaw(x: number, y: number, variant: number): number {
    const g = this.state.grid;
    for (let n = 0; n < 4; n++) {
      const d = (n + (variant & 3)) & 3;
      const nx = x + DIRS[d][0];
      const ny = y + DIRS[d][1];
      if (g.kindAt(nx, ny) === K.ROAD) return Math.atan2(DIRS[d][0], DIRS[d][1]);
    }
    return (variant & 3) * (Math.PI / 2);
  }
}
