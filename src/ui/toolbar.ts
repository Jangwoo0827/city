import type { Tool } from '../game/actions';
import { COST } from '../utils/constants';
import { ZONE_NAME, ZoneType } from '../world/zones';

type Listener = () => void;

/** 현재 선택된 도구 상태 */
export class ToolController {
  tool: Tool = 'select';
  zone: ZoneType = 'R';
  /** 터치 기기에서 한 손가락 드래그가 이동(false)인지 건설(true)인지 */
  touchBuild = false;
  private listeners: Listener[] = [];

  onChange(cb: Listener): void {
    this.listeners.push(cb);
  }

  setTool(t: Tool): void {
    this.tool = t;
    this.fire();
  }

  setZone(z: ZoneType): void {
    this.zone = z;
    this.tool = 'zone';
    this.fire();
  }

  setTouchBuild(v: boolean): void {
    this.touchBuild = v;
    this.fire();
  }

  private fire(): void {
    for (const cb of this.listeners) cb();
  }
}

interface ToolDef {
  tool: Tool;
  icon: string;
  name: string;
  hint: string;
}

const TOOLS: ToolDef[] = [
  { tool: 'road', icon: '🛣️', name: '도로', hint: `타일당 ₩${COST.road} · 드래그로 직선 설치` },
  { tool: 'zone', icon: '🏘️', name: '구역', hint: `타일당 ₩${COST.zone} · 도로 옆에 드래그로 지정` },
  { tool: 'plant', icon: '⚡', name: '발전소', hint: `₩${COST.plant.toLocaleString('ko-KR')} · 2×2` },
  { tool: 'demolish', icon: '🧨', name: '철거', hint: '드래그로 영역 철거 (환급 없음)' },
  { tool: 'select', icon: '🔍', name: '정보', hint: '타일·건물 정보 보기' },
];

const ZONES: { z: ZoneType; key: string }[] = [
  { z: 'R', key: 'R' },
  { z: 'C', key: 'C' },
  { z: 'I', key: 'I' },
];

export function createToolbar(root: HTMLElement, tools: ToolController): void {
  const wrap = document.createElement('div');
  wrap.id = 'toolbar-wrap';

  const zoneBar = document.createElement('div');
  zoneBar.id = 'zonebar';
  const zoneBtns = new Map<ZoneType, HTMLButtonElement>();
  for (const { z, key } of ZONES) {
    const b = document.createElement('button');
    b.className = `zone-btn zone-${z}`;
    b.innerHTML = `<span class="swatch"></span>${ZONE_NAME[z]}<kbd>${key}</kbd>`;
    b.addEventListener('click', () => tools.setZone(z));
    zoneBar.appendChild(b);
    zoneBtns.set(z, b);
  }

  const bar = document.createElement('div');
  bar.id = 'toolbar';
  const toolBtns = new Map<Tool, HTMLButtonElement>();
  TOOLS.forEach((def, i) => {
    const b = document.createElement('button');
    b.className = 'tool-btn';
    b.title = def.hint;
    b.innerHTML = `<span class="ico">${def.icon}</span><span class="nm">${def.name}</span><kbd>${i + 1}</kbd>`;
    b.addEventListener('click', () => tools.setTool(def.tool));
    bar.appendChild(b);
    toolBtns.set(def.tool, b);
  });

  // 터치 기기 전용: 한 손가락 드래그의 의미(이동/건설) 전환
  const touchToggle = document.createElement('button');
  touchToggle.id = 'touch-toggle';
  touchToggle.addEventListener('click', () => tools.setTouchBuild(!tools.touchBuild));
  if (window.matchMedia('(pointer: coarse)').matches) wrap.classList.add('touch');

  wrap.append(zoneBar, bar, touchToggle);
  root.appendChild(wrap);

  const sync = (): void => {
    for (const [t, b] of toolBtns) b.classList.toggle('active', t === tools.tool);
    for (const [z, b] of zoneBtns) b.classList.toggle('active', z === tools.zone);
    zoneBar.classList.toggle('show', tools.tool === 'zone');
    touchToggle.textContent = tools.touchBuild ? '✏️ 드래그: 건설' : '✋ 드래그: 이동';
    touchToggle.classList.toggle('build', tools.touchBuild);
  };
  tools.onChange(sync);
  sync();
}
