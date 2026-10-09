import * as THREE from 'three';
import { COLORS, GRID_SIZE } from '../utils/constants';
import { CameraRig } from './camera';
import { Overlay } from './overlay';

/** three.js 씬 전체를 소유하는 뷰 */
export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  readonly overlay = new Overlay();

  readonly sun = new THREE.DirectionalLight(0xffffff, 2.2);
  readonly ambient = new THREE.HemisphereLight(0xcfe8ff, 0x8aa070, 0.9);

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color(COLORS.sky);
    this.scene.fog = new THREE.Fog(COLORS.sky, 150, 330);

    this.setupLights();
    this.setupGround();
    this.scene.add(this.overlay.mesh);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private setupLights(): void {
    const half = GRID_SIZE / 2;
    this.sun.position.set(half + 50, 70, half + 30);
    this.sun.target.position.set(half, 0, half);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    const r = GRID_SIZE * 0.78;
    sc.left = -r;
    sc.right = r;
    sc.top = r;
    sc.bottom = -r;
    sc.near = 1;
    sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target, this.ambient);
  }

  private setupGround(): void {
    // 맵 바깥 바닥
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: COLORS.groundOuter }),
    );
    outer.position.set(GRID_SIZE / 2, -0.06, GRID_SIZE / 2);
    outer.receiveShadow = true;
    this.scene.add(outer);

    // 64x64 맵 바닥
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: COLORS.ground }),
    );
    ground.position.set(GRID_SIZE / 2, 0, GRID_SIZE / 2);
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.scene.add(ground);

    // 타일 격자선
    const pts: number[] = [];
    for (let i = 0; i <= GRID_SIZE; i++) {
      pts.push(i, 0.012, 0, i, 0.012, GRID_SIZE);
      pts.push(0, 0.012, i, GRID_SIZE, 0.012, i);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0x2f5d2a, transparent: true, opacity: 0.22 }),
    );
    lines.name = 'gridlines';
    this.scene.add(lines);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
  }

  /** 월드 좌표가 아닌 클라이언트 좌표 → 타일 좌표 (맵 밖이면 null) */
  pickTile(clientX: number, clientY: number): { x: number; y: number } | null {
    const p = this.rig.groundPoint(clientX, clientY);
    if (!p) return null;
    const x = Math.floor(p.x);
    const y = Math.floor(p.z);
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return null;
    return { x, y };
  }

  render(dt: number): void {
    this.rig.update(dt);
    this.renderer.render(this.scene, this.rig.camera);
  }
}
