import { GameState } from '../game/state';
import { borrow, buyNode, repay, sectionCost, purchasedSections } from '../game/progression';
import { DEV_NODES } from '../data/devtree';
import { MAX_MILESTONE, MILESTONES_20, levelName } from '../data/milestones';
import { LOAN, SECTIONS_PER_SIDE } from '../utils/constants';
import { formatNumber } from '../utils/math';

type Tab = 'milestone' | 'dev' | 'finance';

const TAB_NAME: Record<Tab, string> = { milestone: '마일스톤', dev: '개발 트리', finance: '재정' };

/** 진행 패널: 마일스톤 / 개발 트리 / 재정(대출) */
export class ProgressPanel {
  private wrap: HTMLElement | null = null;
  private tab: Tab = 'milestone';
  private lastHtml = '';
  private timer = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly state: GameState,
    private readonly onChanged: () => void,
  ) {}

  get isOpen(): boolean {
    return this.wrap !== null;
  }

  open(tab: Tab = this.tab): void {
    this.tab = tab;
    if (this.wrap) {
      this.render(true);
      return;
    }
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (e.target === w || el.closest('[data-close]')) return this.close();
      const t = el.closest('[data-tab]') as HTMLElement | null;
      if (t) {
        this.tab = t.dataset.tab as Tab;
        this.render(true);
        return;
      }
      const buy = el.closest('[data-buy]') as HTMLElement | null;
      if (buy) {
        const r = buyNode(this.state, buy.dataset.buy!);
        this.state.toast(r.message, r.ok ? 'good' : 'bad');
        this.onChanged();
        this.render(true);
        return;
      }
      const act = (el.closest('[data-act]') as HTMLElement | null)?.dataset.act;
      if (act === 'borrow' || act === 'repay') {
        const r = act === 'borrow' ? borrow(this.state) : repay(this.state);
        this.state.toast(r.message, r.ok ? 'info' : 'bad');
        this.onChanged();
        this.render(true);
      }
    });
    this.root.appendChild(w);
    this.wrap = w;
    this.render(true);
    this.timer = window.setInterval(() => this.render(), 500);
  }

  close(): void {
    this.wrap?.remove();
    this.wrap = null;
    window.clearInterval(this.timer);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private render(force = false): void {
    if (!this.wrap) return;
    const s = this.state;
    const tabs = (Object.keys(TAB_NAME) as Tab[])
      .map((t) => `<button class="tab${t === this.tab ? ' active' : ''}" data-tab="${t}">${TAB_NAME[t]}</button>`)
      .join('');
    let body = '';
    if (this.tab === 'milestone') body = this.milestoneHtml();
    else if (this.tab === 'dev') body = this.devHtml();
    else body = this.financeHtml();
    const html = `<div class="modal panel progress">
      <div class="p-head"><h3>🏆 ${levelName(s.level)} <small>마일스톤 ${s.level}/${MAX_MILESTONE}</small></h3><button class="close" data-close aria-label="닫기">✕</button></div>
      <div class="tabs">${tabs}</div>
      <div class="p-body">${body}</div>
    </div>`;
    if (!force && html === this.lastHtml) return;
    const scroll = this.wrap.querySelector('.p-body')?.scrollTop ?? 0;
    this.lastHtml = html;
    this.wrap.innerHTML = html;
    const b = this.wrap.querySelector('.p-body');
    if (b) b.scrollTop = scroll;
  }

  private milestoneHtml(): string {
    const s = this.state;
    const next = s.level < MAX_MILESTONE ? MILESTONES_20[s.level] : null;
    const prevXp = s.level > 0 ? MILESTONES_20[s.level - 1].xp : 0;
    const pct = next ? Math.min(100, Math.round(((s.xp - prevXp) / (next.xp - prevXp)) * 100)) : 100;
    const head = next
      ? `<div class="xp-line"><span>다음: ${next.level}단계 「${next.name}」</span><b>${formatNumber(Math.floor(s.xp))} / ${formatNumber(next.xp)} XP</b></div><div class="bar"><i style="width:${pct}%"></i></div>
         <p class="hint">XP는 도로·시설 건설, 건물 생성·성장, 인구 증가로 쌓입니다.</p>`
      : '<p class="hint">모든 마일스톤을 달성했습니다! 🎉</p>';
    const rows = MILESTONES_20.map((m) => {
      const done = s.level >= m.level;
      const cur = s.level + 1 === m.level;
      return `<tr class="${done ? 'done' : cur ? 'cur' : ''}"><td>${done ? '✔' : m.level}</td><td>${m.name}</td><td>${formatNumber(m.xp)}</td><td>₩${formatNumber(m.money)}</td><td>+${m.devPoints}</td><td>₩${formatNumber(m.loanLimit)}</td><td>${m.unlocks}</td></tr>`;
    }).join('');
    return `${head}<table class="mtable"><thead><tr><th></th><th>단계</th><th>필요 XP</th><th>보상</th><th>개발 P</th><th>대출 한도</th><th>해금</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private devHtml(): string {
    const s = this.state;
    const groups = new Map<string, typeof DEV_NODES>();
    for (const n of DEV_NODES) {
      const arr = groups.get(n.group) ?? [];
      arr.push(n);
      groups.set(n.group, arr);
    }
    let out = `<div class="xp-line"><span>보유 개발 포인트</span><b>${s.devPoints} P</b></div><p class="hint">마일스톤을 올릴 때마다 포인트를 받습니다. 기본 건물(풍력·취수장·하수 배출구·소형 도로)은 처음부터 사용할 수 있습니다.</p>`;
    for (const [group, nodes] of groups) {
      out += `<h4>${group}</h4>`;
      for (const n of nodes) {
        const owned = s.unlocked.has(n.id);
        const lvOk = s.level >= n.level;
        const canBuy = !owned && lvOk && s.devPoints >= n.cost;
        const state = owned ? '<span class="ok">해금됨</span>' : !lvOk ? `<span class="muted">🔒 마일스톤 ${n.level}단계</span>` : `<button class="btn${canBuy ? ' primary' : ''}" data-buy="${n.id}" ${canBuy ? '' : 'disabled'}>${n.cost}P 해금</button>`;
        out += `<div class="node"><div><b>${n.name}</b><div class="hint">${n.desc}</div></div><div>${state}</div></div>`;
      }
    }
    return out;
  }

  private financeHtml(): string {
    const s = this.state;
    const st = s.stats;
    const room = s.loanLimit - s.loan;
    const net = st.income - st.expense;
    return `
      <div class="fin-grid">
        <div><span>자금</span><b>₩${formatNumber(s.money)}</b></div>
        <div><span>일 수입</span><b class="pos">+${st.income.toFixed(1)}</b></div>
        <div><span>일 지출</span><b class="neg">−${st.expense.toFixed(1)}</b></div>
        <div><span>일 순수입</span><b class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(1)}</b></div>
      </div>
      <h4>지출 내역 (일)</h4>
      <div class="row"><span>도로 유지비 (${st.roads}칸)</span><b>${st.upkeepRoads.toFixed(1)}</b></div>
      <div class="row"><span>시설 유지비 (${st.facilities}곳)</span><b>${st.upkeepFacilities.toFixed(1)}</b></div>
      <div class="row"><span>대출 이자</span><b>${st.interest.toFixed(1)}</b></div>
      <h4>대출</h4>
      <div class="row"><span>잔액 / 한도</span><b>₩${formatNumber(s.loan)} / ₩${formatNumber(s.loanLimit)}</b></div>
      <div class="row"><span>이자율</span><b>일 ${(LOAN.interestPerDay * 100).toFixed(2)}%</b></div>
      <div class="loan-btns">
        <button class="btn primary" data-act="borrow" ${room <= 0 ? 'disabled' : ''}>＋ ₩${formatNumber(LOAN.step)} 대출</button>
        <button class="btn" data-act="repay" ${s.loan <= 0 ? 'disabled' : ''}>－ ₩${formatNumber(LOAN.step)} 상환</button>
      </div>
      <h4>맵 확장</h4>
      <div class="row"><span>구매한 구획</span><b>${purchasedSections(s)} / ${SECTIONS_PER_SIDE * SECTIONS_PER_SIDE - 4}</b></div>
      <div class="row"><span>다음 구획 가격</span><b>₩${formatNumber(sectionCost(s))}</b></div>
      <p class="hint">어두운 구획의 테두리가 노란색이면 구매할 수 있습니다. 구획을 클릭하세요.</p>`;
  }
}
