import { LOAN, SECTION_COST, SECTIONS_PER_SIDE } from '../utils/constants';
import { MAX_MILESTONE, MILESTONES_20 } from '../data/milestones';
import { DEV_NODE_MAP } from '../data/devtree';
import { GameState } from './state';

/** XP 를 더하고, 기준을 넘으면 마일스톤을 올린다 (여러 단계 연속 가능) */
export function awardXp(s: GameState, amount: number): void {
  if (amount <= 0 || s.gameOver) return;
  s.xp += amount;
  while (s.level < MAX_MILESTONE && s.xp >= MILESTONES_20[s.level].xp) {
    const m = MILESTONES_20[s.level];
    s.level = m.level;
    s.money += m.money;
    s.devPoints += m.devPoints;
    s.loanLimit = Math.max(s.loanLimit, m.loanLimit);
    s.toast(`🏆 마일스톤 ${m.level}단계 「${m.name}」 달성! +₩${m.money.toLocaleString('ko-KR')} · 개발 포인트 +${m.devPoints}`, 'good');
    s.emit('levelup', m.level);
  }
}

/** 개발 트리 노드(또는 기본 제공 null)가 해금되어 있는가 */
export const isUnlocked = (s: GameState, node: string | null): boolean => node === null || s.unlocked.has(node);

export interface BuyResult {
  ok: boolean;
  message: string;
}

export function buyNode(s: GameState, id: string): BuyResult {
  const n = DEV_NODE_MAP[id];
  if (!n) return { ok: false, message: '알 수 없는 항목입니다' };
  if (s.unlocked.has(id)) return { ok: false, message: '이미 해금했습니다' };
  if (s.level < n.level) return { ok: false, message: `마일스톤 ${n.level}단계가 필요합니다` };
  if (s.devPoints < n.cost) return { ok: false, message: `개발 포인트가 부족합니다 (필요 ${n.cost})` };
  s.devPoints -= n.cost;
  s.unlocked.add(id);
  return { ok: true, message: `「${n.name}」을(를) 해금했습니다` };
}

// ── 맵 구획 구매 ──────────────────────────────────────
export const purchasedSections = (s: GameState): number => {
  let n = 0;
  for (const v of s.sections) n += v;
  return Math.max(0, n - 4); // 시작 구획 4개 제외
};

export const sectionCost = (s: GameState): number =>
  Math.round((SECTION_COST.base * (1 + purchasedSections(s) * SECTION_COST.growth)) / 100) * 100;

/** 해금된 구획과 상하좌우로 맞닿아 있는가 */
export function isSectionAdjacent(s: GameState, idx: number): boolean {
  const sx = idx % SECTIONS_PER_SIDE;
  const sy = Math.floor(idx / SECTIONS_PER_SIDE);
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    const nx = sx + dx;
    const ny = sy + dy;
    if (nx < 0 || ny < 0 || nx >= SECTIONS_PER_SIDE || ny >= SECTIONS_PER_SIDE) continue;
    if (s.sections[ny * SECTIONS_PER_SIDE + nx]) return true;
  }
  return false;
}

export function buySection(s: GameState, idx: number): BuyResult {
  if (s.sections[idx]) return { ok: false, message: '이미 해금된 구획입니다' };
  if (!isSectionAdjacent(s, idx)) return { ok: false, message: '해금된 구획과 맞닿은 구획만 살 수 있습니다' };
  const cost = sectionCost(s);
  if (s.money < cost) return { ok: false, message: `자금이 부족합니다 (필요 ₩${cost.toLocaleString('ko-KR')})` };
  s.money -= cost;
  s.sections[idx] = 1;
  s.dirty.sections = true;
  return { ok: true, message: `구획을 해금했습니다 (−₩${cost.toLocaleString('ko-KR')})` };
}

// ── 대출 ──────────────────────────────────────────────
export function borrow(s: GameState): BuyResult {
  const room = s.loanLimit - s.loan;
  if (room <= 0) return { ok: false, message: '대출 한도에 도달했습니다 (마일스톤을 올리면 늘어납니다)' };
  const amt = Math.min(LOAN.step, room);
  s.loan += amt;
  s.money += amt;
  return { ok: true, message: `₩${amt.toLocaleString('ko-KR')} 대출` };
}

export function repay(s: GameState): BuyResult {
  if (s.loan <= 0) return { ok: false, message: '갚을 대출이 없습니다' };
  const amt = Math.min(LOAN.step, s.loan, Math.max(0, Math.floor(s.money)));
  if (amt <= 0) return { ok: false, message: '상환할 자금이 없습니다' };
  s.loan -= amt;
  s.money -= amt;
  return { ok: true, message: `₩${amt.toLocaleString('ko-KR')} 상환` };
}
