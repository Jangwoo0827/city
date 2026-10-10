import { GameState } from '../game/state';
import { Tool, applyAction, previewAction } from '../game/actions';
import { Tile, sectionIndex } from '../world/grid';
import { FACILITIES } from '../data/catalog';
import { ZONES } from '../data/zones';
import { isUnlocked } from '../game/progression';
import { isSectionAdjacent, sectionCost } from '../game/progression';
import { GameView } from '../render/scene';
import { ToolController } from './toolbar';
import { Tooltip } from './panels';

interface PointerInfo {
  x: number;
  y: number;
  type: string;
}

const TOOL_KEYS: Record<string, Tool> = {
  Digit1: 'road',
  Digit2: 'zone',
  Digit3: 'facility',
  Digit4: 'demolish',
  Digit5: 'select',
};

export interface InputHooks {
  onSelect: (tile: Tile | null) => void;
  /** 잠긴 구획 클릭 (구획 번호) */
  onLockedSection: (section: number) => void;
  onTogglePause: () => void;
}

/** 마우스·터치·키보드 입력 → 카메라 조작과 건설 도구 */
export class InputController {
  private readonly pointers = new Map<number, PointerInfo>();
  private readonly keys = new Set<string>();

  private hover: Tile | null = null;
  private buildStart: Tile | null = null;
  private buildPointer = -1;
  private panPointer = -1;
  private pinchDist = 0;

  // 터치 탭 판별
  private tapStart: { t: number; x: number; y: number; moved: number } | null = null;

  constructor(
    private readonly view: GameView,
    private readonly state: GameState,
    private readonly tools: ToolController,
    private readonly tip: Tooltip,
    private readonly hooks: InputHooks,
  ) {
    const c = view.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onCancel(e));
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && this.buildStart === null) {
        this.hover = null;
        this.refreshPreview(e.clientX, e.clientY);
      }
    });
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
    tools.onChange(() => {
      this.cancelBuild();
      this.refreshPreview(this.lastX, this.lastY);
    });
  }

  private lastX = 0;
  private lastY = 0;

  /** 매 프레임: 키보드 이동 */
  update(dt: number): void {
    let right = 0;
    let up = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) right -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) right += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) up += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) up -= 1;
    if (right !== 0 || up !== 0) {
      this.view.rig.panScreen(right, up, dt);
      this.refreshPreview(this.lastX, this.lastY);
    }
  }

  // ── 포인터 ────────────────────────────────────────────
  private onDown(e: PointerEvent): void {
    this.view.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (e.pointerType === 'mouse') {
      if (e.button === 2 || e.button === 1) {
        this.panPointer = e.pointerId;
        this.cancelBuild();
        e.preventDefault();
      } else if (e.button === 0) {
        this.hover = this.view.pickTile(e.clientX, e.clientY) ?? this.hover;
        this.beginBuild(e.pointerId);
      }
      return;
    }

    // 터치
    if (this.pointers.size >= 2) {
      this.cancelBuild();
      this.tapStart = null;
      this.panPointer = -1;
      this.pinchDist = this.pinchDistance();
      return;
    }
    if (this.tools.touchBuild) {
      this.hover = this.view.pickTile(e.clientX, e.clientY);
      this.beginBuild(e.pointerId);
    } else {
      this.panPointer = e.pointerId;
      this.tapStart = { t: performance.now(), x: e.clientX, y: e.clientY, moved: 0 };
    }
  }

  private onMove(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (!p) {
      // 버튼을 누르지 않은 마우스 호버
      if (e.pointerType === 'mouse') this.refreshPreview(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (this.pointers.size >= 2 && p.type === 'touch') {
      this.handlePinch();
      return;
    }
    if (e.pointerId === this.panPointer) {
      this.view.rig.panPixels(dx, dy);
      if (this.tapStart) this.tapStart.moved += Math.abs(dx) + Math.abs(dy);
    }
    if (e.pointerId === this.buildPointer || e.pointerType === 'mouse') {
      this.refreshPreview(e.clientX, e.clientY);
    }
  }

  private onUp(e: PointerEvent): void {
    const wasBuild = e.pointerId === this.buildPointer;
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.view.canvas.hasPointerCapture(e.pointerId)) this.view.canvas.releasePointerCapture(e.pointerId);

    if (wasBuild && this.buildStart) {
      const end = this.view.pickTile(e.clientX, e.clientY) ?? this.hover;
      const start = this.buildStart;
      this.cancelBuild();
      if (end) this.commit(start, end);
      if (e.pointerType !== 'mouse') {
        this.hover = null;
        this.refreshPreview(e.clientX, e.clientY);
      }
      return;
    }
    if (e.pointerId === this.panPointer) this.panPointer = -1;

    // 터치 탭 = 해당 타일에 도구 적용
    if (p && p.type === 'touch' && this.tapStart && this.pointers.size === 0) {
      const ts = this.tapStart;
      this.tapStart = null;
      if (ts.moved < 10 && performance.now() - ts.t < 400) {
        const t = this.view.pickTile(e.clientX, e.clientY);
        if (t) this.commit(t, t);
      }
    }
    if (this.pointers.size < 2) this.pinchDist = 0;
    if (e.pointerType !== 'mouse') {
      this.hover = null;
      this.refreshPreview(e.clientX, e.clientY);
    }
  }

  private onCancel(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.buildPointer) this.cancelBuild();
    if (e.pointerId === this.panPointer) this.panPointer = -1;
    this.tapStart = null;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
    this.view.rig.zoomAt(factor, e.clientX, e.clientY);
    this.refreshPreview(e.clientX, e.clientY);
  }

  private pinchDistance(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  private handlePinch(): void {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return;
    const d = this.pinchDistance();
    const mx = (pts[0].x + pts[1].x) / 2;
    const my = (pts[0].y + pts[1].y) / 2;
    if (this.pinchDist > 0 && d > 0) this.view.rig.zoomAt(d / this.pinchDist, mx, my);
    this.pinchDist = d;
  }

  // ── 건설 ──────────────────────────────────────────────
  private beginBuild(pointerId: number): void {
    if (!this.hover) return;
    this.buildStart = this.hover;
    this.buildPointer = pointerId;
    this.refreshPreview(this.lastX, this.lastY);
  }

  private cancelBuild(): void {
    this.buildStart = null;
    this.buildPointer = -1;
    this.refreshPreview(this.lastX, this.lastY);
  }

  private commit(a: Tile, b: Tile): void {
    const { tool } = this.tools;
    if (!this.state.isUnlockedAt(b.x, b.y)) {
      this.hooks.onLockedSection(sectionIndex(b.x, b.y));
      return;
    }
    if (tool === 'select') {
      this.hooks.onSelect(b);
      return;
    }
    const res = applyAction(this.state, tool, this.tools.options(), a, b);
    if (res.message) this.state.toast(res.message, 'bad');
    this.refreshPreview(this.lastX, this.lastY);
  }

  private refreshPreview(clientX: number, clientY: number): void {
    const picked = this.view.pickTile(clientX, clientY);
    if (picked) this.hover = picked;
    else if (this.buildStart === null) this.hover = null;

    if (!this.hover) {
      this.view.showPlacementRange(0, 0, 0);
      this.view.overlay.set(null);
      this.tip.hide();
      return;
    }
    if (!this.state.isUnlockedAt(this.hover.x, this.hover.y) && this.buildStart === null) {
      // 잠긴 구획 위: 구획 해금 안내
      const sec = sectionIndex(this.hover.x, this.hover.y);
      this.view.overlay.set(null);
      if (isSectionAdjacent(this.state, sec)) {
        this.tip.show(`🔒 구획 해금 ₩${sectionCost(this.state).toLocaleString('ko-KR')} (클릭)`, clientX, clientY, true);
      } else {
        this.tip.show('🔒 잠긴 구획 (맞닿은 구획부터 해금)', clientX, clientY, false);
      }
      return;
    }
    // 서비스 시설 설치 중이면 반경 링 표시
    if (this.tools.tool === 'facility') {
      const def = FACILITIES[this.tools.facility];
      const r = def.radius ?? 0;
      this.view.showPlacementRange(this.hover.x + def.w / 2, this.hover.y + def.h / 2, r);
    } else {
      this.view.showPlacementRange(0, 0, 0);
    }
    const a = this.buildStart ?? this.hover;
    const pv = previewAction(this.state, this.tools.tool, this.tools.options(), a, this.hover);
    this.view.overlay.set(pv);
    const anyOk = pv.tiles.some((t) => t.ok);
    this.tip.show(pv.label, clientX, clientY, anyOk || pv.neutral);
  }

  // ── 키보드 ────────────────────────────────────────────
  private onKey(e: KeyboardEvent, down: boolean): void {
    if (down) {
      this.keys.add(e.code);
      if (e.repeat) return;
      const tool = TOOL_KEYS[e.code];
      if (tool) {
        this.tools.setTool(tool);
        return;
      }
      switch (e.code) {
        case 'KeyQ':
          this.view.rig.rotate(-1);
          break;
        case 'KeyE':
          this.view.rig.rotate(1);
          break;
        case 'Space':
          e.preventDefault();
          this.hooks.onTogglePause();
          break;
        case 'Escape':
          this.cancelBuild();
          this.tools.setTool('select');
          break;
        default: {
          // 구역 도구 사용 중에는 글자 키로 구역 종류 선택
          if (this.tools.tool === 'zone') {
            const zd = ZONES.find((z) => `Key${z.key}` === e.code);
            if (zd && isUnlocked(this.state, zd.node)) this.tools.setZone(zd.id);
          }
        }
      }
      this.refreshPreview(this.lastX, this.lastY);
    } else {
      this.keys.delete(e.code);
    }
  }
}
