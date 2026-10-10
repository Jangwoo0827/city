import type { Tool, ToolOptions } from '../game/actions';
import { GameState } from '../game/state';
import { isUnlocked } from '../game/progression';
import { COST } from '../utils/constants';
import { FACILITIES, FACILITY_LIST, FAC, FacilityCategory, ROAD_TYPES } from '../data/catalog';
import { DEV_NODE_MAP } from '../data/devtree';
import { ZONE_NAME, ZoneType } from '../world/zones';

type Listener = () => void;

/** 현재 선택된 도구 상태 */
export class ToolController {
  tool: Tool = 'select';
  zone: ZoneType = 'R';
  facility: number = FAC.WIND;
  roadType = 0;
  /** 터치 기기에서 한 손가락 드래그가 이동(false)인지 건설(true)인지 */
  touchBuild = false;
  private listeners: Listener[] = [];

  onChange(cb: Listener): void {
    this.listeners.push(cb);
  }

  options(): ToolOptions {
    return { zone: this.zone, facility: this.facility, roadType: this.roadType };
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

  setFacility(id: number): void {
    this.facility = id;
    this.tool = 'facility';
    this.fire();
  }

  setRoadType(t: number): void {
    this.roadType = t;
    this.tool = 'road';
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
  { tool: 'road', icon: '🛣️', name: '도로', hint: '드래그로 직선 설치 · 같은 자리에 더 큰 도로를 덮으면 업그레이드' },
  { tool: 'zone', icon: '🏘️', name: '구역', hint: `타일당 ₩${COST.zone} · 도로 근처에 드래그로 지정` },
  { tool: 'facility', icon: '⚡', name: '시설', hint: '발전소·상하수도 시설' },
  { tool: 'demolish', icon: '🧨', name: '철거', hint: '드래그로 영역 철거 (환급 없음)' },
  { tool: 'select', icon: '🔍', name: '정보', hint: '타일·건물 정보 보기' },
];

const ZONES: { z: ZoneType; key: string }[] = [
  { z: 'R', key: 'R' },
  { z: 'C', key: 'C' },
  { z: 'I', key: 'I' },
];

const CATEGORY_NAME: Record<FacilityCategory, string> = { power: '전력', water: '상수도', sewage: '하수' };

export interface ToolbarUI {
  /** 해금 상태 등이 바뀌었을 수 있을 때 다시 그린다 */
  refresh(): void;
}

export function createToolbar(root: HTMLElement, tools: ToolController, state: GameState): ToolbarUI {
  const wrap = document.createElement('div');
  wrap.id = 'toolbar-wrap';

  // ── 서브바: 구역 ──
  const zoneBar = document.createElement('div');
  zoneBar.className = 'subbar';
  const zoneBtns = new Map<ZoneType, HTMLButtonElement>();
  for (const { z, key } of ZONES) {
    const b = document.createElement('button');
    b.className = `sub-btn zone-btn zone-${z}`;
    b.innerHTML = `<span class="swatch"></span>${ZONE_NAME[z]}<kbd>${key}</kbd>`;
    b.addEventListener('click', () => tools.setZone(z));
    zoneBar.appendChild(b);
    zoneBtns.set(z, b);
  }

  // ── 서브바: 도로 종류 ──
  const roadBar = document.createElement('div');
  roadBar.className = 'subbar';
  const roadBtns: HTMLButtonElement[] = [];
  for (const rt of ROAD_TYPES) {
    const b = document.createElement('button');
    b.className = 'sub-btn';
    b.addEventListener('click', () => {
      if (!isUnlocked(state, rt.node)) {
        state.toast(`🔒 ${rt.name}: 개발 트리(🏆)에서 해금하세요`, 'bad');
        return;
      }
      tools.setRoadType(rt.id);
    });
    roadBar.appendChild(b);
    roadBtns.push(b);
  }

  // ── 서브바: 시설 ──
  const facBar = document.createElement('div');
  facBar.className = 'subbar wide';
  const facBtns = new Map<number, HTMLButtonElement>();
  for (const cat of ['power', 'water', 'sewage'] as FacilityCategory[]) {
    const group = document.createElement('div');
    group.className = 'fac-group';
    group.innerHTML = `<span class="fac-cat">${CATEGORY_NAME[cat]}</span>`;
    for (const def of FACILITY_LIST.filter((f) => f.category === cat)) {
      const b = document.createElement('button');
      b.className = 'sub-btn';
      b.addEventListener('click', () => {
        if (!isUnlocked(state, def.node)) {
          state.toast(`🔒 ${def.name}: 개발 트리(🏆)에서 해금하세요`, 'bad');
          return;
        }
        tools.setFacility(def.id);
      });
      group.appendChild(b);
      facBtns.set(def.id, b);
    }
    facBar.appendChild(group);
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

  wrap.append(zoneBar, roadBar, facBar, bar, touchToggle);
  root.appendChild(wrap);

  const lockLabel = (node: string | null): string => {
    if (isUnlocked(state, node)) return '';
    const n = node ? DEV_NODE_MAP[node] : null;
    return n ? ` title="🔒 개발 트리에서 해금 (포인트 ${n.cost}, 마일스톤 ${n.level}단계)"` : '';
  };

  const sync = (): void => {
    for (const [t, b] of toolBtns) b.classList.toggle('active', t === tools.tool);
    for (const [z, b] of zoneBtns) b.classList.toggle('active', z === tools.zone);
    zoneBar.classList.toggle('show', tools.tool === 'zone');
    roadBar.classList.toggle('show', tools.tool === 'road');
    facBar.classList.toggle('show', tools.tool === 'facility');

    ROAD_TYPES.forEach((rt, i) => {
      const locked = !isUnlocked(state, rt.node);
      const b = roadBtns[i];
      b.innerHTML = `<span>${locked ? '🔒' : '🛣️'} ${rt.name}</span><small>₩${rt.cost}/칸</small>`;
      b.classList.toggle('active', tools.tool === 'road' && tools.roadType === rt.id);
      b.classList.toggle('locked', locked);
      b.title = locked ? `🔒 개발 트리에서 해금` : `${rt.desc} · 유지비 ${rt.upkeep}/일`;
    });
    for (const [id, b] of facBtns) {
      const def = FACILITIES[id];
      const locked = !isUnlocked(state, def.node);
      b.innerHTML = `<span${lockLabel(def.node)}>${locked ? '🔒' : def.icon} ${def.name}</span><small>₩${def.cost.toLocaleString('ko-KR')}</small>`;
      b.classList.toggle('active', tools.tool === 'facility' && tools.facility === id);
      b.classList.toggle('locked', locked);
      b.title = `${def.desc} · ${def.w}×${def.h} · 유지비 ${def.upkeep}/일 · 용량 ${def.capacity}`;
    }
    touchToggle.textContent = tools.touchBuild ? '✏️ 드래그: 건설' : '✋ 드래그: 이동';
    touchToggle.classList.toggle('build', tools.touchBuild);
  };
  tools.onChange(sync);
  sync();
  return { refresh: sync };
}
