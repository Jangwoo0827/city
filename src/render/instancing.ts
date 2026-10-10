import * as THREE from 'three';
import { BUILD_ANIM_SECONDS, COLORS, GRID_SIZE, SECTION_SIZE, SECTIONS_PER_SIDE } from '../utils/constants';
import { clamp, easeOutBack, hash01 } from '../utils/math';
import { FACILITIES, ROAD_TYPES, RoadTypeDef } from '../data/catalog';
import { GameState } from '../game/state';
import { isSectionAdjacent } from '../game/progression';
import { DIRS, K, T, isZoneKind } from '../world/grid';
import { roadMask } from '../world/roads';
import { box, merge } from './geometry';
import { BuildingModel, ModelKey, buildAllModels, modelKey } from './models';

const CAP = GRID_SIZE * GRID_SIZE;
const FAC_CAP = 256;
const SIDEWALK = 0xbdb9ad;
const ASPHALT = 0x3d4148;
const ASPHALT_DARK = 0x353a41;
const MARKING = 0xf1e58a;
const MARKING_WHITE = 0xe8e8e8;
const ROAD_H = 0.065;

const WINDOW_DAY = new THREE.Color(0x7d9cb8);
const WINDOW_NIGHT = new THREE.Color(0xffd88a);

export type ServiceMode = 'none' | 'power' | 'water' | 'sewage';

/** 이웃 연결 비트마스크(북1 동2 남4 서8)와 도로 종류로 도로 타일 모양을 생성 */
function buildRoadGeometry(mask: number, type: RoadTypeDef): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const half = type.halfWidth;
  const asphalt = type.id === 2 ? ASPHALT_DARK : ASPHALT;
  parts.push(box(1, 0.05, 1, 0, 0.025, 0, SIDEWALK));
  const w = half * 2;
  parts.push(box(w, ROAD_H, w, 0, ROAD_H / 2, 0, asphalt));
  const armLen = 0.5 - half;
  const armMid = half + armLen / 2;
  for (let d = 0; d < 4; d++) {
    if (!(mask & (1 << d))) continue;
    const [dx, dz] = DIRS[d];
    const horizontal = dx !== 0;
    const aw = horizontal ? armLen : w;
    const ad = horizontal ? w : armLen;
    parts.push(box(aw, ROAD_H, ad, dx * armMid, ROAD_H / 2, dz * armMid, asphalt));
    const mark = (off: number, thick: number, color: number): void => {
      const mw = horizontal ? armLen : thick;
      const md = horizontal ? thick : armLen;
      const ox = horizontal ? 0 : off;
      const oz = horizontal ? off : 0;
      parts.push(box(mw, 0.004, md, dx * armMid + ox, ROAD_H + 0.002, dz * armMid + oz, color));
    };
    if (type.id === 0) {
      mark(0, 0.035, MARKING);
    } else {
      // 중형·대형: 이중 중앙선
      mark(-0.03, 0.025, MARKING);
      mark(0.03, 0.025, MARKING);
      if (type.id === 2) {
        // 대형: 차선 구분 흰 점선
        mark(-half * 0.55, 0.02, MARKING_WHITE);
        mark(half * 0.55, 0.02, MARKING_WHITE);
      }
    }
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

/** 맵 상태를 InstancedMesh 들로 동기화한다 (지형 / 도로 / 구역 / 건물 / 구획 잠금 / 서비스 오버레이) */
export class CityMeshes {
  readonly group = new THREE.Group();

  /** [도로 종류][마스크] */
  private readonly roadMeshes: THREE.InstancedMesh[][] = [];
  private readonly zoneMesh: THREE.InstancedMesh;
  private readonly zoneMat: THREE.MeshBasicMaterial;
  private readonly bodyMeshes = new Map<ModelKey, THREE.InstancedMesh>();
  private readonly windowMeshes = new Map<ModelKey, THREE.InstancedMesh>();
  readonly windowMat = new THREE.MeshBasicMaterial({ color: WINDOW_DAY });

  private readonly sectionMeshes: THREE.Mesh[] = [];
  private readonly sectionEdges: THREE.LineSegments[] = [];
  private readonly serviceMesh: THREE.InstancedMesh;
  private serviceMode: ServiceMode = 'none';
  private serviceStamp = -1;

  private readonly m = new THREE.Matrix4();
  private readonly dummy = new THREE.Object3D();
  private readonly tmpColor = new THREE.Color();

  // 건물 등장 애니메이션 상태
  private readonly prevLevel = new Uint8Array(CAP);
  private readonly prevKind = new Uint8Array(CAP);
  private readonly prevFac = new Uint8Array(CAP);
  private readonly riseStart = new Float32Array(CAP);
  private snapshot = true;

  constructor(private readonly state: GameState) {
    this.buildTerrain();

    const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const type of ROAD_TYPES) {
      const row: THREE.InstancedMesh[] = [];
      for (let mask = 0; mask < 16; mask++) {
        const mesh = makeInstanced(buildRoadGeometry(mask, type), roadMat, CAP, `road-${type.id}-${mask}`);
        mesh.receiveShadow = true;
        row.push(mesh);
        this.group.add(mesh);
      }
      this.roadMeshes.push(row);
    }

    // 구역 바닥 표시
    this.zoneMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false });
    this.zoneMesh = makeInstanced(new THREE.PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2), this.zoneMat, CAP, 'zones');
    this.zoneMesh.renderOrder = 1;
    this.group.add(this.zoneMesh);

    // 건물·시설 모델
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const models: Map<ModelKey, BuildingModel> = buildAllModels();
    for (const [key, model] of models) {
      const cap = key.startsWith(`${K.FAC}:`) ? FAC_CAP : CAP;
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

    // 서비스 오버레이 (전력/수도/하수 공급 여부)
    this.serviceMesh = makeInstanced(
      new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }),
      CAP,
      'service-overlay',
    );
    this.serviceMesh.renderOrder = 5;
    this.group.add(this.serviceMesh);

    this.buildSections();
  }

  /** 물 타일 */
  private buildTerrain(): void {
    const g = this.state.grid;
    const water: number[] = [];
    for (let i = 0; i < g.count; i++) if (g.terrain[i] === T.WATER) water.push(i);
    const mat = new THREE.MeshLambertMaterial({ color: COLORS.water, transparent: true, opacity: 0.92 });
    const mesh = makeInstanced(new THREE.PlaneGeometry(1.002, 1.002).rotateX(-Math.PI / 2), mat, Math.max(1, water.length), 'water');
    mesh.receiveShadow = true;
    water.forEach((i, n) => {
      this.m.makeTranslation((i % g.size) + 0.5, 0.03, ((i / g.size) | 0) + 0.5);
      mesh.setMatrixAt(n, this.m);
    });
    mesh.count = water.length;
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  /** 잠긴 구획 덮개 16개 */
  private buildSections(): void {
    const S = SECTION_SIZE;
    const planeGeo = new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2);
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(S, 0.01, S));
    for (let i = 0; i < SECTIONS_PER_SIDE * SECTIONS_PER_SIDE; i++) {
      const sx = i % SECTIONS_PER_SIDE;
      const sy = Math.floor(i / SECTIONS_PER_SIDE);
      const cx = sx * S + S / 2;
      const cz = sy * S + S / 2;
      const mesh = new THREE.Mesh(
        planeGeo,
        new THREE.MeshBasicMaterial({ color: 0x0b1224, transparent: true, opacity: 0.5, depthWrite: false }),
      );
      mesh.position.set(cx, 0.35, cz);
      mesh.renderOrder = 8;
      const edge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x8fa3c4, transparent: true, opacity: 0.6 }));
      edge.position.set(cx, 0.36, cz);
      edge.renderOrder = 9;
      this.sectionMeshes.push(mesh);
      this.sectionEdges.push(edge);
      this.group.add(mesh, edge);
    }
  }

  private updateSections(): void {
    const s = this.state;
    for (let i = 0; i < this.sectionMeshes.length; i++) {
      const locked = !s.sections[i];
      const buyable = locked && isSectionAdjacent(s, i);
      const mesh = this.sectionMeshes[i];
      const edge = this.sectionEdges[i];
      mesh.visible = locked;
      edge.visible = locked;
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(buyable ? 0x1c2a4a : 0x070b16);
      (mesh.material as THREE.MeshBasicMaterial).opacity = buyable ? 0.42 : 0.62;
      (edge.material as THREE.LineBasicMaterial).color.setHex(buyable ? 0xffd166 : 0x5c6b88);
    }
  }

  /** 불러오기/새 게임 직후: 이미 있는 건물은 솟아오르는 애니메이션 없이 표시 */
  resetAnimations(): void {
    this.snapshot = true;
  }

  setServiceMode(mode: ServiceMode): void {
    this.serviceMode = mode;
    this.serviceStamp = -1;
    if (mode === 'none') this.serviceMesh.count = 0;
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
    if (s.dirty.sections) {
      s.dirty.sections = false;
      this.updateSections();
    }
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
    if (this.serviceMode !== 'none') {
      const stamp = s.tick * 1000 + s.stats.buildings;
      if (stamp !== this.serviceStamp) {
        this.serviceStamp = stamp;
        this.rebuildServiceOverlay();
      }
    }
  }

  private rebuildRoads(): void {
    const g = this.state.grid;
    const counts = ROAD_TYPES.map(() => new Array<number>(16).fill(0));
    for (let y = 0; y < g.size; y++) {
      for (let x = 0; x < g.size; x++) {
        const i = g.idx(x, y);
        if (g.kind[i] !== K.ROAD) continue;
        const mask = roadMask(g, x, y);
        const t = Math.min(g.roadType[i], ROAD_TYPES.length - 1);
        this.m.makeTranslation(x + 0.5, 0, y + 0.5);
        this.roadMeshes[t][mask].setMatrixAt(counts[t][mask]++, this.m);
      }
    }
    for (let t = 0; t < ROAD_TYPES.length; t++) {
      for (let mask = 0; mask < 16; mask++) {
        const mesh = this.roadMeshes[t][mask];
        mesh.count = counts[t][mask];
        mesh.instanceMatrix.needsUpdate = true;
      }
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

  /** 전력/수도/하수 공급 상태 오버레이: 초록 = 공급, 빨강 = 끊김 */
  private rebuildServiceOverlay(): void {
    const g = this.state.grid;
    const arr = this.serviceMode === 'power' ? g.powered : this.serviceMode === 'water' ? g.watered : g.sewered;
    let n = 0;
    for (let i = 0; i < g.count; i++) {
      const k = g.kind[i];
      if (k === K.EMPTY) continue;
      if (isZoneKind(k) && g.access[i] < 0) continue;
      const x = i % g.size;
      const y = (i / g.size) | 0;
      this.m.makeTranslation(x + 0.5, 0.12, y + 0.5);
      this.serviceMesh.setMatrixAt(n, this.m);
      this.serviceMesh.setColorAt(n, this.tmpColor.setHex(arr[i] ? 0x39d353 : 0xf0443a));
      n++;
    }
    this.serviceMesh.count = n;
    this.serviceMesh.instanceMatrix.needsUpdate = true;
    if (this.serviceMesh.instanceColor) this.serviceMesh.instanceColor.needsUpdate = true;
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
      } else if (k === K.FAC && g.owner[i] === i + 1) {
        level = 1;
        key = modelKey(K.FAC, g.fac[i]);
      }
      if (key === null || !this.bodyMeshes.has(key)) {
        this.prevLevel[i] = 0;
        this.prevKind[i] = 0;
        this.prevFac[i] = 0;
        continue;
      }

      if (this.snapshot) {
        this.riseStart[i] = -1e6;
      } else if (this.prevLevel[i] !== level || this.prevKind[i] !== k || this.prevFac[i] !== g.fac[i]) {
        this.riseStart[i] = time;
      }
      this.prevLevel[i] = level;
      this.prevKind[i] = k;
      this.prevFac[i] = g.fac[i];

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
      if (k === K.FAC) {
        const def = FACILITIES[g.fac[i]];
        d.position.set(x + def.w / 2, 0, y + def.h / 2);
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

  /** 접근 도로 쪽을 바라보도록 건물 방향 결정 (도로가 없으면 변주값으로) */
  private facingYaw(x: number, y: number, variant: number): number {
    const g = this.state.grid;
    const r = g.access[g.idx(x, y)];
    if (r >= 0) {
      const dx = (r % g.size) - x;
      const dz = ((r / g.size) | 0) - y;
      if (Math.abs(dx) >= Math.abs(dz)) return Math.atan2(Math.sign(dx), 0);
      return Math.atan2(0, Math.sign(dz));
    }
    for (let n = 0; n < 4; n++) {
      const d = (n + (variant & 3)) & 3;
      if (g.kindAt(x + DIRS[d][0], y + DIRS[d][1]) === K.ROAD) return Math.atan2(DIRS[d][0], DIRS[d][1]);
    }
    return (variant & 3) * (Math.PI / 2);
  }
}
