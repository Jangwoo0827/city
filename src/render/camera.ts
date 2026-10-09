import * as THREE from 'three';
import { CAMERA, GRID_SIZE } from '../utils/constants';
import { clamp, damp, deg2rad } from '../utils/math';

/** 아이소메트릭 직교 카메라: 대상점(target) 주위를 yaw 로 회전, 고정 pitch */
export class CameraRig {
  readonly camera: THREE.OrthographicCamera;
  readonly target = new THREE.Vector3(GRID_SIZE / 2, 0, GRID_SIZE / 2);

  yaw = deg2rad(CAMERA.yawDeg);
  yawGoal = this.yaw;
  zoom = 1.15;
  private readonly pitch = deg2rad(CAMERA.pitchDeg);
  private viewW = 1;
  private viewH = 1;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly ndc = new THREE.Vector2();

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA.distance * 3);
    this.applyTransform();
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    const halfH = CAMERA.baseView / 2;
    const halfW = halfH * (w / h);
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
  }

  /** 90° 단위 회전 (부드럽게 보간됨) */
  rotate(dir: 1 | -1): void {
    this.yawGoal += dir * (Math.PI / 2);
  }

  update(dt: number): void {
    this.yaw = damp(this.yaw, this.yawGoal, CAMERA.rotateDamping, dt);
    if (Math.abs(this.yaw - this.yawGoal) < 1e-4) this.yaw = this.yawGoal;
    this.applyTransform();
  }

  /** 화면 픽셀 이동량만큼 지면을 끌어 이동 */
  panPixels(dx: number, dy: number): void {
    const unitsPerPixel = CAMERA.baseView / this.camera.zoom / this.viewH;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    // right = (cos, 0, -sin), forward(지면 투영) = (-sin, 0, -cos)
    const fwdScale = (dy * unitsPerPixel) / Math.sin(this.pitch);
    this.target.x += -cosY * dx * unitsPerPixel + -sinY * fwdScale;
    this.target.z += sinY * dx * unitsPerPixel + -cosY * fwdScale;
    this.clampTarget();
  }

  /** 키보드 이동용: 화면 기준 (오른쪽, 위쪽) 단위벡터 입력 */
  panScreen(right: number, up: number, dt: number): void {
    const speed = (CAMERA.panKeySpeed * dt) / this.camera.zoom;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    this.target.x += (cosY * right - sinY * up) * speed;
    this.target.z += (-sinY * right - cosY * up) * speed;
    this.clampTarget();
  }

  /** 포인터 위치(화면 클라이언트 좌표)를 고정점으로 삼아 줌 */
  zoomAt(factor: number, clientX: number, clientY: number): void {
    const before = this.groundPoint(clientX, clientY);
    this.zoom = clamp(this.zoom * factor, CAMERA.minZoom, CAMERA.maxZoom);
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
    this.applyTransform();
    const after = this.groundPoint(clientX, clientY);
    if (before && after) {
      this.target.x += before.x - after.x;
      this.target.z += before.z - after.z;
      this.clampTarget();
      this.applyTransform();
    }
  }

  /** 클라이언트 좌표 → 지면(y=0) 월드 좌표 */
  groundPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    this.ndc.set((clientX / this.viewW) * 2 - 1, -(clientY / this.viewH) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, out);
  }

  private clampTarget(): void {
    this.target.x = clamp(this.target.x, 0, GRID_SIZE);
    this.target.z = clamp(this.target.z, 0, GRID_SIZE);
  }

  private applyTransform(): void {
    const d = CAMERA.distance;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * d,
      this.target.y + Math.sin(this.pitch) * d,
      this.target.z + Math.cos(this.yaw) * cp * d,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }
}
