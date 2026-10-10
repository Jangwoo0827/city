import { GameState, ToastKind } from '../game/state';
import { BANKRUPT_LIMIT, DAYS_PER_MONTH, MONTHS_PER_YEAR } from '../utils/constants';
import { formatNumber } from '../utils/math';
import { MAX_MILESTONE, MILESTONES_20, levelName } from '../data/milestones';
import type { ServiceMode } from '../render/instancing';

export interface HudHooks {
  onNewGame: () => void;
  onSave: () => void;
  onLoad: () => void;
  onSpeed: (speed: number) => void;
  /** 저장 데이터가 있는지 */
  hasSave: () => boolean;
  onOpenProgress: () => void;
  onOverlay: (mode: ServiceMode) => void;
}

const SPEEDS: { speed: number; label: string; title: string }[] = [
  { speed: 0, label: '⏸', title: '일시정지 (Space)' },
  { speed: 1, label: '▶', title: '속도 ×1' },
  { speed: 2, label: '▶▶', title: '속도 ×2' },
  { speed: 3, label: '▶▶▶', title: '속도 ×3' },
];

interface CoverageDef {
  mode: ServiceMode;
  /** 클릭 시 순환할 모드들 (없으면 mode 한 개를 켜고 끔) */
  cycle?: ServiceMode[];
  icon: string;
  name: string;
  value: (s: GameState) => number;
}

const COVERAGE_DEFS: CoverageDef[] = [
  { mode: 'health', icon: '🏥', name: '의료', value: (s) => s.stats.covHealth },
  { mode: 'police', icon: '👮', name: '치안', value: (s) => s.stats.covPolice },
  { mode: 'fire', icon: '🚒', name: '소방', value: (s) => s.stats.covFire },
  { mode: 'park', icon: '🌳', name: '공원', value: (s) => s.stats.covPark },
  // 🎓: 고등학교 이수율 표시. 클릭할 때마다 초등 → 고등 → 대학 커버리지 오버레이로 순환
  { mode: 'edu2', cycle: ['edu1', 'edu2', 'edu3'], icon: '🎓', name: '교육 (이수율)', value: (s) => s.edu.a2 },
  { mode: 'land', icon: '💰', name: '땅값', value: (s) => s.stats.landValue / 100 },
];

const faceFor = (h: number): string => (h >= 75 ? '😄' : h >= 50 ? '🙂' : h >= 30 ? '😐' : '😠');
const colorFor = (h: number): string => (h >= 60 ? 'var(--good)' : h >= 35 ? '#f2c94c' : 'var(--bad)');

export function formatDate(tick: number): string {
  const day = (tick % DAYS_PER_MONTH) + 1;
  const month = (Math.floor(tick / DAYS_PER_MONTH) % MONTHS_PER_YEAR) + 1;
  const year = Math.floor(tick / (DAYS_PER_MONTH * MONTHS_PER_YEAR)) + 1;
  return `${year}년 ${month}월 ${day}일`;
}

/** 확인/취소 모달 */
export function confirmDialog(root: HTMLElement, message: string, okLabel = '확인'): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal panel"><p>${message}</p><div class="btns"><button class="btn ghost">취소</button><button class="btn primary">${okLabel}</button></div></div>`;
    const done = (v: boolean): void => {
      wrap.remove();
      resolve(v);
    };
    wrap.querySelector('.ghost')!.addEventListener('click', () => done(false));
    wrap.querySelector('.primary')!.addEventListener('click', () => done(true));
    root.appendChild(wrap);
  });
}

export class Hud {
  private readonly money: HTMLElement;
  private readonly delta: HTMLElement;
  private readonly pop: HTMLElement;
  private readonly jobs: HTMLElement;
  private readonly workers: HTMLElement;
  private readonly happy: HTMLElement;
  private readonly happyFace: HTMLElement;
  private readonly date: HTMLElement;
  private readonly lvName: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly utilBtns = new Map<ServiceMode, HTMLButtonElement>();
  private overlayMode: ServiceMode = 'none';
  private readonly covBtns = new Map<ServiceMode, HTMLButtonElement>();
  private readonly speedBtns = new Map<number, HTMLButtonElement>();
  private readonly rci: Record<'R' | 'C' | 'I' | 'O', HTMLElement>;
  private readonly toasts: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly loadItem: HTMLButtonElement;
  private lastMenuOpen = false;
  private utilDefs: { mode: ServiceMode; icon: string; name: string }[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly state: GameState,
    private readonly hooks: HudHooks,
  ) {
    const top = document.createElement('div');
    top.id = 'topbar';
    top.className = 'panel';
    top.innerHTML = `
      <div class="stat money" title="자금 / 틱당 순수입"><span class="ico">💰</span><div><b data-k="money"></b><small data-k="delta"></small></div></div>
      <div class="stat" title="전체 인구"><span class="ico">👥</span><div><b data-k="pop"></b><small>인구</small></div></div>
      <div class="stat" title="일자리 / 노동력"><span class="ico">💼</span><div><b data-k="jobs"></b><small data-k="workers"></small></div></div>
      <div class="stat" title="행복도 (0~100)"><span class="ico" data-k="face"></span><div><b data-k="happy"></b><small>행복도</small></div></div>
      <button class="stat level" data-k="levelbtn" title="마일스톤 · 개발 트리 · 재정"><span class="ico">🏆</span><div><b data-k="lvname"></b><span class="xpbar"><i data-k="xpfill"></i></span></div></button>
      <div class="stat date" title="날짜"><span class="ico">📅</span><div><b data-k="date"></b><small>1초 = 1일</small></div></div>
      <div class="speed"></div>
      <button class="menu-btn" aria-label="메뉴">☰</button>
    `;
    const q = (k: string): HTMLElement => top.querySelector(`[data-k="${k}"]`) as HTMLElement;
    this.money = q('money');
    this.delta = q('delta');
    this.pop = q('pop');
    this.jobs = q('jobs');
    this.workers = q('workers');
    this.happy = q('happy');
    this.happyFace = q('face');
    this.date = q('date');
    this.lvName = q('lvname');
    this.xpFill = q('xpfill');
    q('levelbtn').addEventListener('click', () => hooks.onOpenProgress());

    const speedBox = top.querySelector('.speed') as HTMLElement;
    for (const s of SPEEDS) {
      const b = document.createElement('button');
      b.textContent = s.label;
      b.title = s.title;
      b.addEventListener('click', () => hooks.onSpeed(s.speed));
      speedBox.appendChild(b);
      this.speedBtns.set(s.speed, b);
    }

    // 메뉴
    this.menu = document.createElement('div');
    this.menu.id = 'menu';
    this.menu.className = 'panel';
    this.menu.innerHTML = `
      <button data-a="save">💾 저장하기</button>
      <button data-a="load">📂 불러오기</button>
      <button data-a="new">🆕 새 게임</button>
      <button data-a="help">❓ 도움말</button>`;
    this.loadItem = this.menu.querySelector('[data-a="load"]') as HTMLButtonElement;
    const menuBtn = top.querySelector('.menu-btn') as HTMLButtonElement;
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });
    this.menu.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a;
      if (!a) return;
      this.toggleMenu(false);
      if (a === 'save') hooks.onSave();
      else if (a === 'load') hooks.onLoad();
      else if (a === 'new') hooks.onNewGame();
      else if (a === 'help') this.showHelp();
    });
    window.addEventListener('click', () => this.toggleMenu(false));

    // RCI 수요 바
    const rciBox = document.createElement('div');
    rciBox.id = 'rci';
    rciBox.className = 'panel';
    rciBox.title = '수요: 위로 차오를수록 해당 구역이 더 필요합니다';
    rciBox.innerHTML = (['R', 'C', 'I', 'O'] as const)
      .map(
        (z) => `<div class="col ${z}"><div class="track"><i></i><span class="mid"></span></div><b>${
          z === 'R' ? '주거' : z === 'C' ? '상업' : z === 'I' ? '공업' : '사무'
        }</b></div>`,
      )
      .join('');
    this.rci = {
      R: rciBox.querySelector('.R i') as HTMLElement,
      C: rciBox.querySelector('.C i') as HTMLElement,
      I: rciBox.querySelector('.I i') as HTMLElement,
      O: rciBox.querySelector('.O i') as HTMLElement,
    };

    // 공급 현황 + 오버레이 토글
    const utils = document.createElement('div');
    utils.id = 'utils';
    utils.className = 'panel';
    const defs: { mode: ServiceMode; icon: string; name: string }[] = [
      { mode: 'power', icon: '⚡', name: '전력' },
      { mode: 'water', icon: '💧', name: '상수도' },
      { mode: 'sewage', icon: '🚰', name: '하수' },
    ];
    for (const d of defs) {
      const b = document.createElement('button');
      b.className = 'util-row';
      b.title = `${d.name} 공급 오버레이 (초록 = 공급, 빨강 = 끊김)`;
      b.addEventListener('click', () => {
        this.overlayMode = this.overlayMode === d.mode ? 'none' : d.mode;
        hooks.onOverlay(this.overlayMode);
        this.update();
      });
      utils.appendChild(b);
      this.utilBtns.set(d.mode, b);
    }
    this.utilDefs = defs;

    // 서비스 커버리지 오버레이 (의료/치안/소방/공원)
    const covGrid = document.createElement('div');
    covGrid.className = 'cov-grid';
    for (const d of COVERAGE_DEFS) {
      const b = document.createElement('button');
      b.className = 'util-cov';
      b.title = `${d.name} 오버레이 (초록 = 충분/높음, 빨강 = 부족/낮음)`;
      b.addEventListener('click', () => {
        if (d.cycle) {
          // 순환: 꺼짐 → 첫 번째 → … → 마지막 → 꺼짐
          const idx = d.cycle.indexOf(this.overlayMode);
          this.overlayMode = idx < 0 ? d.cycle[0] : (d.cycle[idx + 1] ?? 'none');
        } else this.overlayMode = this.overlayMode === d.mode ? 'none' : d.mode;
        hooks.onOverlay(this.overlayMode);
        this.update();
      });
      covGrid.appendChild(b);
      this.covBtns.set(d.mode, b);
    }
    utils.appendChild(covGrid);

    this.toasts = document.createElement('div');
    this.toasts.id = 'toasts';

    this.overlay = document.createElement('div');
    this.overlay.id = 'gameover';
    this.overlay.className = 'modal-wrap hidden';

    const area = document.createElement('div');
    area.id = 'top-area';
    area.append(top, this.toasts);
    root.append(area, this.menu, utils, rciBox, this.overlay);

    state.on('toast', (msg, kind) => this.toast(msg, kind));
    state.on('gameover', () => this.showGameOver());
    state.on('reset', () => this.overlay.classList.add('hidden'));
    this.update();
  }

  private toggleMenu(force?: boolean): void {
    const open = force ?? !this.lastMenuOpen;
    this.lastMenuOpen = open;
    this.menu.classList.toggle('show', open);
    if (open) this.loadItem.disabled = !this.hooks.hasSave();
  }

  toast(message: string, kind: ToastKind = 'info'): void {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4400);
  }

  /** 수치 갱신 (주기적으로 호출) */
  update(): void {
    const s = this.state;
    const st = s.stats;
    this.money.textContent = `₩${formatNumber(s.money)}`;
    this.money.classList.toggle('neg', s.money < 0);
    const net = st.income - st.expense;
    this.delta.textContent = `${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(1)}/일`;
    this.delta.className = net >= 0 ? 'pos' : 'neg';
    this.pop.textContent = formatNumber(st.pop);
    this.jobs.textContent = formatNumber(st.jobs);
    this.workers.textContent = `노동력 ${formatNumber(st.workers)}`;
    this.workers.className = st.workers > st.jobs ? 'neg' : '';
    const h = Math.round(s.happiness);
    this.happy.textContent = `${h}`;
    this.happy.style.color = colorFor(h);
    this.happyFace.textContent = faceFor(h);
    this.date.textContent = formatDate(s.tick);
    for (const [sp, b] of this.speedBtns) b.classList.toggle('active', sp === s.speed);

    // 마일스톤
    const next = s.level < MAX_MILESTONE ? MILESTONES_20[s.level] : null;
    const prevXp = s.level > 0 ? MILESTONES_20[s.level - 1].xp : 0;
    this.lvName.textContent = `Lv.${s.level} ${levelName(s.level)}`;
    this.xpFill.style.width = `${next ? Math.min(100, ((s.xp - prevXp) / (next.xp - prevXp)) * 100) : 100}%`;

    // 공급 현황
    const sup: Record<string, [number, number]> = {
      power: [st.powerSupply, st.powerDemand],
      water: [st.waterSupply, st.waterDemand],
      sewage: [st.sewageCap, st.sewageDemand],
    };
    for (const d of this.utilDefs) {
      const [a, b] = sup[d.mode];
      const short = b > a + 1e-6;
      const btn = this.utilBtns.get(d.mode)!;
      btn.innerHTML = `<span>${d.icon} ${d.name}</span><b class="${short ? 'neg' : ''}">${b.toFixed(1)} / ${a.toFixed(1)}</b>`;
      btn.classList.toggle('active', this.overlayMode === d.mode);
    }

    for (const d of COVERAGE_DEFS) {
      const btn = this.covBtns.get(d.mode)!;
      const v = d.value(s);
      const active = d.cycle ? d.cycle.includes(this.overlayMode) : this.overlayMode === d.mode;
      const sub = d.cycle && active ? ({ edu1: '초', edu2: '고', edu3: '대' } as Record<string, string>)[this.overlayMode] : '';
      btn.innerHTML = `<span>${d.icon}${sub}</span><b class="${v < 0.5 && st.pop > 0 && d.mode !== 'land' ? 'neg' : ''}">${Math.round(v * 100)}%</b>`;
      btn.classList.toggle('active', active);
    }

    this.setBar('R', st.demandR);
    this.setBar('C', st.demandC);
    this.setBar('I', st.demandI);
    this.setBar('O', st.demandO);
  }

  private setBar(z: 'R' | 'C' | 'I' | 'O', v: number): void {
    const el = this.rci[z];
    const pct = Math.min(1, Math.abs(v)) * 50;
    el.style.height = `${pct}%`;
    el.style.bottom = v >= 0 ? '50%' : `${50 - pct}%`;
    el.classList.toggle('neg', v < 0);
  }

  private showHelp(): void {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal panel help">
      <h3>도움말</h3>
      <ul>
        <li><b>도로(1)</b> 드래그로 직선 설치. 물 위에는 다리가 놓입니다. 구역은 도로 가까이에 지정합니다.</li>
        <li><b>구역(2)</b> 주거(R)·고밀 주거(T)·상업(C)·고밀 상업(B)·공업(I)·사무(O) 영역을 드래그로 지정합니다.</li>
        <li><b>시설(3)</b> 발전소·상하수도·서비스·학교. 드래그하면 영역에 한꺼번에 설치됩니다.</li>
        <li><b>지형(4)</b> 직선을 드래그해 강·호수를 만들거나, 영역을 드래그해 물을 메웁니다.</li>
        <li><b>철거(5)</b> 도로·구역·건물·시설을 제거합니다 (건설비의 50% 환급).</li>
        <li><b>정보(6)</b> 타일이나 건물을 클릭해 상세 정보를 봅니다.</li>
        <li><b>복사(7)</b> 영역을 드래그해 도로·구역·시설을 복사하고, 클릭으로 붙여넣습니다 (R 회전, Ctrl+V, Esc 종료).</li>
      </ul>
      <p class="keys">우클릭 드래그: 이동 · 휠: 줌 · Q/E: 회전 · WASD: 이동 · Space: 일시정지 · 터치: 한 손가락 이동 / 두 손가락 핀치 줌</p>
      <div class="btns"><button class="btn primary">닫기</button></div>
    </div>`;
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || (e.target as HTMLElement).closest('.primary')) wrap.remove();
    });
    this.root.appendChild(wrap);
  }

  private showGameOver(): void {
    const s = this.state;
    this.overlay.innerHTML = `<div class="modal panel over">
      <h2>💸 파산!</h2>
      <p>자금이 ₩${formatNumber(BANKRUPT_LIMIT)} 아래로 떨어져 도시가 파산했습니다.</p>
      <div class="final"><span>최종 인구 <b>${formatNumber(s.stats.pop)}명</b></span><span>운영 기간 <b>${formatDate(s.tick)}</b></span></div>
      <div class="btns">
        <button class="btn ghost" data-a="load">저장 불러오기</button>
        <button class="btn primary" data-a="new">새 게임</button>
      </div>
    </div>`;
    const load = this.overlay.querySelector('[data-a="load"]') as HTMLButtonElement;
    load.disabled = !this.hooks.hasSave();
    load.addEventListener('click', () => this.hooks.onLoad());
    this.overlay.querySelector('[data-a="new"]')!.addEventListener('click', () => this.hooks.onNewGame());
    this.overlay.classList.remove('hidden');
  }

  hideGameOver(): void {
    this.overlay.classList.add('hidden');
  }

  get ui(): HTMLElement {
    return this.root;
  }
}
