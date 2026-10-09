import * as THREE from 'three';
import { COLORS, GRID_SIZE } from '../utils/constants';
import type { Preview } from '../game/actions';

const NEUTRAL = new THREE.Color(0x6ec1ff);
const OK = new THREE.Color(COLORS.okTile);
const BAD = new THREE.Color(COLORS.badTile);

/** 호버·드래그 미리보기용 타일 하이라이트 (초록 = 설치 가능, 빨강 = 불가) */
export class Overlay {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();

  constructor() {
    const geo = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, GRID_SIZE * GRID_SIZE);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.count = 0;
    this.mesh.name = 'overlay';
  }

  set(preview: Preview | null): void {
    if (!preview) {
      this.mesh.count = 0;
      return;
    }
    const n = Math.min(preview.tiles.length, this.mesh.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      const t = preview.tiles[i];
      this.m.makeTranslation(t.x + 0.5, 0.09, t.y + 0.5);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, preview.neutral ? NEUTRAL : t.ok ? OK : BAD);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
