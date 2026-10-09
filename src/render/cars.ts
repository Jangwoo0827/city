import * as THREE from 'three';
import { CAR_SPEED, MAX_CARS, ROAD_TILES_PER_CAR } from '../utils/constants';
import { damp } from '../utils/math';
import { GameState } from '../game/state';
import { DIRS, K } from '../world/grid';
import { box, merge } from './geometry';

interface Car {
  /** 현재 타일 */
  x: number;
  y: number;
  /** 진행 방향(DIRS 인덱스) */
  dir: number;
  /** 현재 타일 중심 → 다음 타일 중심 사이 진행도 0..1 */
  t: number;
  speed: number;
  yaw: number;
  offX: number;
  offZ: number;
}

const PALETTE = [0xe74c3c, 0xf5b041, 0xf4f6f7, 0x3498db, 0x2ecc71, 0x9b59b6, 0x34495e, 0xecf0f1];
const LANE_OFFSET = 0.13;
const CAR_Y = 0.065;

function buildCarGeometry(): THREE.BufferGeometry {
  return merge([
    box(0.12, 0.06, 0.26, 0, 0.03, 0, 0xffffff),
    box(0.1, 0.05, 0.13, 0, 0.085, -0.015, 0x9fb7cc),
    box(0.125, 0.02, 0.03, 0, 0.04, 0.13, 0xfff3b0),
  ]);
}

/** 도로 위를 오가는 단순한 자동차들 (최대 MAX_CARS 대, InstancedMesh 1개) */
export class Cars {
  readonly mesh: THREE.InstancedMesh;
  private readonly cars: Car[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private roadList: number[] = [];
  private roadVersion = -1;

  constructor(private readonly state: GameState) {
    this.mesh = new THREE.InstancedMesh(
      buildCarGeometry(),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
      MAX_CARS,
    );
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.name = 'cars';
    for (let i = 0; i < MAX_CARS; i++) {
      this.color.setHex(PALETTE[i % PALETTE.length]);
      this.mesh.setColorAt(i, this.color);
    }
  }

  /** 도로 타일 목록 (도로 수가 바뀐 경우에만 갱신) */
  private refreshRoads(): void {
    const g = this.state.grid;
    const n = this.state.stats.roads;
    // 도로 수·위치가 바뀌면 stats.roads 또는 아래 해시가 바뀐다
    let hash = n;
    for (let i = 0; i < g.count; i += 61) hash = (hash * 31 + g.kind[i]) | 0;
    if (hash === this.roadVersion && this.roadList.length === n) return;
    this.roadVersion = hash;
    this.roadList = [];
    for (let i = 0; i < g.count; i++) if (g.kind[i] === K.ROAD) this.roadList.push(i);
  }

  private isRoad(x: number, y: number): boolean {
    return this.state.grid.kindAt(x, y) === K.ROAD;
  }

  private pickDirection(x: number, y: number, from: number, rand = Math.random()): number {
    const opts: number[] = [];
    for (let d = 0; d < 4; d++) {
      if (this.isRoad(x + DIRS[d][0], y + DIRS[d][1])) opts.push(d);
    }
    if (opts.length === 0) return -1;
    const back = (from + 2) & 3;
    const forward = opts.filter((d) => d !== back);
    if (forward.length === 0) return back; // 막다른 길: 유턴
    if (forward.includes(from) && rand < 0.6) return from;
    return forward[Math.floor(Math.random() * forward.length)];
  }

  private spawn(c?: Car): Car | null {
    if (this.roadList.length === 0) return null;
    const g = this.state.grid;
    for (let tries = 0; tries < 12; tries++) {
      const i = this.roadList[Math.floor(Math.random() * this.roadList.length)];
      const x = i % g.size;
      const y = (i / g.size) | 0;
      const dir = this.pickDirection(x, y, Math.floor(Math.random() * 4));
      if (dir < 0) continue;
      const car: Car = c ?? { x, y, dir, t: 0, speed: 1, yaw: 0, offX: 0, offZ: 0 };
      car.x = x;
      car.y = y;
      car.dir = dir;
      car.t = Math.random();
      car.speed = 0.8 + Math.random() * 0.4;
      car.yaw = Math.atan2(DIRS[dir][0], DIRS[dir][1]);
      car.offX = -DIRS[dir][1] * LANE_OFFSET;
      car.offZ = DIRS[dir][0] * LANE_OFFSET;
      return car;
    }
    return null;
  }

  update(dt: number): void {
    this.refreshRoads();
    const roads = this.roadList.length;
    const target = Math.min(MAX_CARS, Math.floor(roads / ROAD_TILES_PER_CAR));

    while (this.cars.length < target) {
      const c = this.spawn();
      if (!c) break;
      this.cars.push(c);
    }
    if (this.cars.length > target) this.cars.length = target;

    const sp = this.state.speed;
    const factor = sp === 0 ? 0 : 1 + (sp - 1) * 0.5;
    const move = dt * CAR_SPEED * factor;
    const d = this.dummy;

    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      // 도로가 철거되었으면 다른 도로 위로 재배치
      const nx = c.x + DIRS[c.dir][0];
      const ny = c.y + DIRS[c.dir][1];
      if (!this.isRoad(c.x, c.y) || !this.isRoad(nx, ny)) {
        if (!this.spawn(c)) continue;
      }

      c.t += move * c.speed;
      while (c.t >= 1) {
        c.t -= 1;
        c.x += DIRS[c.dir][0];
        c.y += DIRS[c.dir][1];
        const nd = this.pickDirection(c.x, c.y, c.dir);
        if (nd < 0) {
          this.spawn(c);
          break;
        }
        c.dir = nd;
      }

      const [dx, dz] = DIRS[c.dir];
      const wantYaw = Math.atan2(dx, dz);
      let diff = wantYaw - c.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      c.yaw += diff * (1 - Math.exp(-12 * dt));
      c.offX = damp(c.offX, -dz * LANE_OFFSET, 10, dt);
      c.offZ = damp(c.offZ, dx * LANE_OFFSET, 10, dt);

      d.position.set(c.x + 0.5 + dx * c.t + c.offX, CAR_Y, c.y + 0.5 + dz * c.t + c.offZ);
      d.rotation.set(0, c.yaw, 0);
      d.scale.setScalar(1.25);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.count = this.cars.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
