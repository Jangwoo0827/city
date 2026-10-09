import * as THREE from 'three';
import { GRID_SIZE } from '../utils/constants';
import { GameState } from '../game/state';
import { K } from '../world/grid';
import { roadMask } from '../world/roads';
import { box, merge } from './geometry';

const CAP = GRID_SIZE * GRID_SIZE;
const SIDEWALK = 0xbdb9ad;
const ASPHALT = 0x3d4148;
const MARKING = 0xf1e58a;

const ROAD_HALF = 0.32; // 차도 반폭
const ROAD_H = 0.065;

/** 이웃 연결 비트마스크(북1 동2 남4 서8)로 도로 타일 모양을 생성 */
function buildRoadGeometry(mask: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(1, 0.05, 1, 0, 0.025, 0, SIDEWALK));
  const w = ROAD_HALF * 2;
  parts.push(box(w, ROAD_H, w, 0, ROAD_H / 2, 0, ASPHALT));
  const armLen = 0.5 - ROAD_HALF;
  const armMid = ROAD_HALF + armLen / 2;
  // 북, 동, 남, 서
  const dirs: [number, number][] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  for (let d = 0; d < 4; d++) {
    if (!(mask & (1 << d))) continue;
    const [dx, dz] = dirs[d];
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

/** 맵 상태를 InstancedMesh 들로 동기화한다 */
export class CityMeshes {
  readonly group = new THREE.Group();

  private readonly roadMeshes: THREE.InstancedMesh[] = [];
  private readonly m = new THREE.Matrix4();

  constructor(private readonly state: GameState) {
    const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (let mask = 0; mask < 16; mask++) {
      const mesh = new THREE.InstancedMesh(buildRoadGeometry(mask), roadMat, CAP);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.name = `road-${mask}`;
      this.roadMeshes.push(mesh);
      this.group.add(mesh);
    }
  }

  /** 매 프레임 호출: 변경 플래그가 있으면 인스턴스를 다시 채운다 */
  sync(_time: number): void {
    const s = this.state;
    if (s.dirty.roads) {
      s.dirty.roads = false;
      this.rebuildRoads();
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
}
