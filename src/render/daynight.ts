import * as THREE from 'three';
import { COLORS, DAY_LENGTH_SECONDS, GRID_SIZE } from '../utils/constants';
import { lerp, smoothstep } from '../utils/math';

const SKY_DAY = new THREE.Color(COLORS.sky);
const SKY_NIGHT = new THREE.Color(COLORS.skyNight);
const SKY_DUSK = new THREE.Color(0xf4a261);
const SUN_COLOR = new THREE.Color(0xfff1d6);
const SUN_LOW = new THREE.Color(0xffb36b);
const MOON_COLOR = new THREE.Color(0x8aa6ff);
const HEMI_SKY_DAY = new THREE.Color(0xcfe8ff);
const HEMI_SKY_NIGHT = new THREE.Color(0x3a4a8c);
const HEMI_GROUND_DAY = new THREE.Color(0x8aa070);
const HEMI_GROUND_NIGHT = new THREE.Color(0x1a2038);

/** 2분 주기의 낮/밤: 태양(달) 이동, 조명·하늘·안개 색, 창 불빛 */
export class DayNight {
  /** 0 = 일출, 0.25 = 정오, 0.5 = 일몰, 0.75 = 자정 */
  phase = 0.12;
  /** 0 = 낮, 1 = 밤 */
  night = 0;

  private readonly c = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sun: THREE.DirectionalLight,
    private readonly hemi: THREE.HemisphereLight,
    private readonly onNight: (n: number) => void,
  ) {
    this.apply();
  }

  update(dt: number): void {
    this.phase = (this.phase + dt / DAY_LENGTH_SECONDS) % 1;
    this.apply();
  }

  private apply(): void {
    const a = this.phase * Math.PI * 2;
    const elev = Math.sin(a); // 태양 고도 (-1..1)
    const day = smoothstep(-0.12, 0.3, elev);
    this.night = 1 - day;
    // 일출/일몰 노을 정도
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.32) * (elev > -0.12 ? 1 : 0);

    // 태양(낮)과 달(밤)은 같은 방향광을 공유: 밤에는 고도 절댓값으로 반대편에서 비춘다
    const half = GRID_SIZE / 2;
    const h = 28 + 52 * Math.abs(elev);
    this.sun.position.set(half + Math.cos(a) * 62, h, half + 30);
    this.sun.target.position.set(half, 0, half);

    this.sun.intensity = lerp(0.45, 2.25, day);
    this.sun.color.copy(MOON_COLOR).lerp(SUN_COLOR, day).lerp(SUN_LOW, dusk * 0.6 * day);

    this.hemi.intensity = lerp(0.42, 0.95, day);
    this.hemi.color.copy(HEMI_SKY_NIGHT).lerp(HEMI_SKY_DAY, day);
    this.hemi.groundColor.copy(HEMI_GROUND_NIGHT).lerp(HEMI_GROUND_DAY, day);

    this.c.copy(SKY_NIGHT).lerp(SKY_DAY, day).lerp(SKY_DUSK, dusk * 0.5);
    (this.scene.background as THREE.Color).copy(this.c);
    if (this.scene.fog) this.scene.fog.color.copy(this.c);

    this.onNight(this.night);
  }
}
