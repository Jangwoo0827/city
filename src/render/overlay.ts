import * as THREE from 'three';
import { COLORS, GRID_SIZE } from '../utils/constants';
import type { Preview } from '../game/actions';

const NEUTRAL = new THREE.Color(0x6ec1ff);
const OK = new THREE.Color(COLORS.okTile);
const BAD = new THREE.Color(COLORS.badTile);

/** 호버·드래그 미리보기용 타일 하이라이트 (초록 = 설치 가능, 빨강 = 불가) */
export class Overlay {
  readonly mesh: THREE.InstancedMesh;
  /** 서비스 건물 설치/선택 시 반경을 보여주는 링 */
  readonly range: THREE.Group;
  private rangeRing: THREE.Mesh | null = null;
  private rangeRadius = 0;
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
    this.range = new THREE.Group();
    this.range.visible = false;
    this.range.renderOrder = 12;
  }

  /** (cx, cz) 월드 좌표 중심으로 반경 r 링 표시. r<=0 이면 숨김 */
  setRange(cx: number, cz: number, r: number): void {
    if (r <= 0) {
      this.range.visible = false;
      return;
    }
    if (!this.rangeRing || this.rangeRadius !== r) {
      if (this.rangeRing) {
        this.range.remove(this.rangeRing);
        this.rangeRing.geometry.dispose();
      }
      const geo = new THREE.RingGeometry(r - 0.1, r + 0.05, 72).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false });
      this.rangeRing = new THREE.Mesh(geo, mat);
      this.rangeRing.renderOrder = 12;
      this.range.add(this.rangeRing);
      this.rangeRadius = r;
    }
    this.range.position.set(cx, 0.14, cz);
    this.range.visible = true;
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
