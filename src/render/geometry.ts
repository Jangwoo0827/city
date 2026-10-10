import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 정점 색을 단색으로 칠한다 (모든 파트가 같은 attribute 세트를 갖도록) */
function paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** 중심 (x,y,z), 크기 (w,h,d) 의 색칠된 박스 파트 */
export function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return paint(g, color);
}

/** 바닥 y 에서 시작하는 박스 (건물 쌓기용) */
export function boxOnGround(w: number, h: number, d: number, x: number, baseY: number, z: number, color: number): THREE.BufferGeometry {
  return box(w, h, d, x, baseY + h / 2, z, color);
}

export function cylinder(r: number, h: number, x: number, baseY: number, z: number, color: number, segs = 8, rTop = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, r, h, segs);
  g.translate(x, baseY + h / 2, z);
  return paint(g, color);
}

/** 사각뿔 지붕 (4각, 45° 회전) */
export function pyramidRoof(w: number, d: number, h: number, x: number, baseY: number, z: number, color: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.5, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(w * Math.SQRT2, 1, d * Math.SQRT2);
  g.translate(x, baseY + h / 2, z);
  return paint(g, color);
}

/** 벽면에 붙는 작은 사각 창 (법선 방향: 0=+z, 1=+x, 2=-z, 3=-x) */
export function windowQuad(w: number, h: number, cx: number, cy: number, cz: number, side: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateY((side * Math.PI) / 2);
  g.translate(cx, cy, cz);
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('geometry merge failed');
  for (const p of parts) p.dispose();
  return g;
}

export const WIN_OUT = 0.004;

/**
 * 직육면체 벽면 4면에 창 격자를 만든다.
 * rows × cols 개의 작은 사각형을 벽에서 살짝 띄워 배치.
 */
export function facadeWindows(
  out: THREE.BufferGeometry[],
  w: number,
  d: number,
  baseY: number,
  rowYs: number[],
  cols: number,
  winW: number,
  winH: number,
  ox = 0,
  oz = 0,
): void {
  for (let side = 0; side < 4; side++) {
    const alongX = side % 2 === 0;
    const span = alongX ? w : d;
    const off = (alongX ? d : w) / 2 + WIN_OUT;
    for (const ry of rowYs) {
      for (let c = 0; c < cols; c++) {
        const u = ((c + 0.5) / cols - 0.5) * span * 0.78;
        const y = baseY + ry;
        let x = 0;
        let z = 0;
        if (side === 0) {
          x = u;
          z = off;
        } else if (side === 1) {
          x = off;
          z = u;
        } else if (side === 2) {
          x = u;
          z = -off;
        } else {
          x = -off;
          z = u;
        }
        out.push(windowQuad(winW, winH, x + ox, y, z + oz, side));
      }
    }
  }
}

