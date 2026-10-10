import { describe, expect, it } from 'vitest';
import { GameState } from '../src/game/state';
import { applyAction, previewAction, canPlaceFacility, ToolOptions } from '../src/game/actions';
import { refreshStats, tick } from '../src/game/simulation';
import { awardXp, buyNode, buySection, sectionCost } from '../src/game/progression';
import { FAC } from '../src/data/catalog';
import { K } from '../src/world/grid';
import { deserializeGame, serializeGame } from '../src/utils/save';
import { buildStarterCity } from '../scripts/scenario';

const opts = (o: Partial<ToolOptions> = {}): ToolOptions => ({ zone: 'R', facility: FAC.WIND, roadType: 0, ...o });

describe('구획(맵 해금)', () => {
  it('시작은 중앙 32×32만 열려 있다', () => {
    const s = new GameState();
    expect(s.isUnlockedAt(16, 16)).toBe(true);
    expect(s.isUnlockedAt(47, 47)).toBe(true);
    expect(s.isUnlockedAt(15, 16)).toBe(false);
    expect(s.isUnlockedAt(0, 0)).toBe(false);
  });

  it('잠긴 구획에는 건설할 수 없다', () => {
    const s = new GameState();
    const r = applyAction(s, 'road', opts(), { x: 4, y: 4 }, { x: 8, y: 4 });
    expect(r.ok).toBe(false);
    expect(s.grid.kind[s.grid.idx(4, 4)]).toBe(K.EMPTY);
  });

  it('맞닿은 구획만 돈으로 해금할 수 있다', () => {
    const s = new GameState();
    s.money = 100000;
    expect(buySection(s, 0).ok).toBe(false); // 모서리: 맞닿지 않음
    const cost = sectionCost(s);
    const before = s.money;
    expect(buySection(s, 1).ok).toBe(true); // 위쪽 중앙 구획
    expect(s.money).toBe(before - cost);
    expect(sectionCost(s)).toBeGreaterThan(cost);
    expect(s.isUnlockedAt(20, 4)).toBe(true);
  });
});

describe('도로·구역·시설 규칙', () => {
  it('구역은 도로에서 4칸 이내에만 지정된다', () => {
    const s = new GameState();
    applyAction(s, 'road', opts(), { x: 20, y: 30 }, { x: 40, y: 30 });
    const near = previewAction(s, 'zone', opts(), { x: 30, y: 34 }, { x: 30, y: 34 });
    const far = previewAction(s, 'zone', opts(), { x: 30, y: 35 }, { x: 30, y: 35 });
    expect(near.tiles[0].ok).toBe(true);
    expect(far.tiles[0].ok).toBe(false);
  });

  it('대형 도로는 구역을 6칸까지 붙일 수 있고, 해금 전에는 설치할 수 없다', () => {
    const s = new GameState();
    expect(applyAction(s, 'road', opts({ roadType: 2 }), { x: 20, y: 30 }, { x: 24, y: 30 }).ok).toBe(false);
    s.unlocked.add('road_large');
    expect(applyAction(s, 'road', opts({ roadType: 2 }), { x: 20, y: 30 }, { x: 40, y: 30 }).ok).toBe(true);
    const six = previewAction(s, 'zone', opts(), { x: 30, y: 36 }, { x: 30, y: 36 });
    expect(six.tiles[0].ok).toBe(true);
  });

  it('취수장·배출구는 물 타일에 붙어야 한다', () => {
    const s = new GameState();
    expect(canPlaceFacility(s, FAC.PUMP, { x: 26, y: 21 })).toBe(true); // 호수 옆
    expect(canPlaceFacility(s, FAC.PUMP, { x: 40, y: 40 })).toBe(false);
    expect(canPlaceFacility(s, FAC.WIND, { x: 40, y: 40 })).toBe(true);
    expect(canPlaceFacility(s, FAC.WIND, { x: 22, y: 21 })).toBe(false); // 물 위
  });

  it('도로 업그레이드는 차액만 청구한다', () => {
    const s = new GameState();
    s.unlocked.add('road_medium');
    applyAction(s, 'road', opts(), { x: 20, y: 30 }, { x: 20, y: 30 });
    const m0 = s.money;
    applyAction(s, 'road', opts({ roadType: 1 }), { x: 20, y: 30 }, { x: 20, y: 30 });
    expect(m0 - s.money).toBe(18 - 12);
    expect(s.grid.roadType[s.grid.idx(20, 30)]).toBe(1);
  });
});

describe('철거 환급', () => {
  it('도로를 철거하면 건설비의 50%를 돌려받는다', () => {
    const s = new GameState();
    applyAction(s, 'road', opts(), { x: 20, y: 30 }, { x: 24, y: 30 }); // 5칸 × 12
    const before = s.money;
    const r = applyAction(s, 'demolish', opts(), { x: 20, y: 30 }, { x: 24, y: 30 });
    expect(r.ok).toBe(true);
    expect(s.money - before).toBe(5 * 6);
    expect(s.stats.roads).toBe(0);
  });

  it('여러 칸짜리 시설은 한 번만 환급한다', () => {
    const s = new GameState();
    s.unlocked.add('fac_coal');
    applyAction(s, 'facility', opts({ facility: FAC.COAL }), { x: 30, y: 30 }, { x: 30, y: 30 });
    const before = s.money;
    applyAction(s, 'demolish', opts(), { x: 30, y: 30 }, { x: 31, y: 31 }); // 2×2 전체 선택
    expect(s.money - before).toBe(750); // 1500 × 50%
    expect(s.stats.facilities).toBe(0);
  });

  it('건물이 있는 구역은 레벨에 따라 추가 환급', () => {
    const s = new GameState();
    applyAction(s, 'road', opts(), { x: 20, y: 30 }, { x: 30, y: 30 });
    applyAction(s, 'zone', opts(), { x: 25, y: 31 }, { x: 25, y: 31 });
    s.grid.level[s.grid.idx(25, 31)] = 3;
    const before = s.money;
    applyAction(s, 'demolish', opts(), { x: 25, y: 31 }, { x: 25, y: 31 });
    expect(s.money - before).toBe(3 + 15);
  });

  it('자금이 마이너스여도 철거할 수 있다', () => {
    const s = new GameState();
    applyAction(s, 'road', opts(), { x: 20, y: 30 }, { x: 22, y: 30 });
    s.money = -3000;
    const pv = previewAction(s, 'demolish', opts(), { x: 20, y: 30 }, { x: 22, y: 30 });
    expect(pv.tiles.every((t) => t.ok)).toBe(true);
    const r = applyAction(s, 'demolish', opts(), { x: 20, y: 30 }, { x: 22, y: 30 });
    expect(r.ok).toBe(true);
    expect(s.money).toBe(-3000 + 3 * 6);
  });
});

describe('전력·상수도·하수 네트워크', () => {
  it('세 가지가 모두 공급되면 건물이 자라고, 하나라도 끊기면 자라지 않는다', () => {
    const s = new GameState();
    buildStarterCity(s);
    for (let t = 0; t < 120; t++) tick(s);
    expect(s.stats.buildings).toBeGreaterThan(10);

    // 취수장을 철거하면 상수도가 끊겨 더 이상 새 건물이 생기지 않는다
    const before = s.stats.buildings;
    applyAction(s, 'demolish', opts(), { x: 26, y: 21 }, { x: 26, y: 21 });
    expect(s.stats.waterSupply).toBe(0);
    for (let t = 0; t < 60; t++) tick(s);
    expect(s.stats.buildings).toBeLessThanOrEqual(before);
    expect(s.stats.wateredRatio).toBe(0);
  });

  it('용량이 모자라면 시설에서 먼 구역부터 끊긴다', () => {
    const s = new GameState();
    buildStarterCity(s);
    for (let t = 0; t < 120; t++) tick(s);
    expect(s.stats.powerDemand).toBeGreaterThan(s.stats.powerSupply);
    expect(s.stats.poweredRatio).toBeLessThan(1);
    expect(s.stats.poweredRatio).toBeGreaterThan(0);
    // 석탄 발전소 추가 → 공급이 늘어난다
    s.unlocked.add('fac_coal');
    s.money = 50000;
    const supply = s.stats.powerSupply;
    applyAction(s, 'facility', opts({ facility: FAC.COAL }), { x: 28, y: 17 }, { x: 28, y: 17 });
    expect(s.stats.powerSupply).toBe(supply + 80);
  });

  it('무처리 방류는 수질을 오염시키고, 처리장이 있으면 오염되지 않는다', () => {
    const polluted = new GameState();
    buildStarterCity(polluted);
    for (let t = 0; t < 400; t++) tick(polluted);
    expect(polluted.waterPollution).toBeGreaterThan(0.05);

    const clean = new GameState();
    buildStarterCity(clean);
    clean.unlocked.add('fac_treatment');
    clean.money = 100000;
    applyAction(clean, 'facility', opts({ facility: FAC.TREATMENT }), { x: 28, y: 22 }, { x: 28, y: 22 });
    for (let t = 0; t < 400; t++) tick(clean);
    expect(clean.waterPollution).toBeLessThan(polluted.waterPollution);
  });
});

describe('진행 시스템', () => {
  it('XP가 기준을 넘으면 마일스톤이 오르고 보상을 받는다', () => {
    const s = new GameState();
    const money = s.money;
    awardXp(s, 200);
    expect(s.level).toBe(1);
    expect(s.money).toBe(money + 625);
    expect(s.devPoints).toBe(2); // 시작 1 + 1단계 +1
    expect(s.loanLimit).toBe(10000);
    awardXp(s, 100000);
    expect(s.level).toBeGreaterThan(10);
  });

  it('개발 트리: 포인트와 마일스톤 단계가 있어야 해금된다', () => {
    const s = new GameState();
    expect(buyNode(s, 'road_large').ok).toBe(false); // 3단계 필요
    expect(buyNode(s, 'fac_coal').ok).toBe(true); // 0단계, 1P
    expect(s.devPoints).toBe(0);
    expect(buyNode(s, 'fac_coal').ok).toBe(false); // 이미 해금
  });
});

describe('저장', () => {
  it('저장 → 복원이 상태를 보존한다', () => {
    const a = new GameState();
    buildStarterCity(a);
    for (let t = 0; t < 100; t++) tick(a);
    a.unlocked.add('fac_coal');
    a.sections[1] = 1;
    const data = JSON.parse(JSON.stringify(serializeGame(a)));

    const b = new GameState();
    expect(deserializeGame(b, data)).toBe(true);
    expect(b.money).toBeCloseTo(a.money);
    expect(b.stats.buildings).toBe(a.stats.buildings);
    expect(b.stats.facilities).toBe(a.stats.facilities);
    expect(b.stats.roads).toBe(a.stats.roads);
    expect(b.level).toBe(a.level);
    expect(b.unlocked.has('fac_coal')).toBe(true);
    expect(b.sections[1]).toBe(1);
    expect(b.grid.kind).toEqual(a.grid.kind);
    expect(b.grid.fac).toEqual(a.grid.fac);
  });

  it('v1 저장을 v2로 이전한다 (기존 발전소는 석탄 발전소, 건물이 있는 구획은 열림)', () => {
    const a = new GameState();
    const g = a.grid;
    const n = g.count;
    const kind = new Uint8Array(n);
    const level = new Uint8Array(n);
    // (2,2)에 건물이 있는 주거 구역 → 잠긴 구획(0)이 열려야 함
    kind[g.idx(2, 2)] = K.RES;
    level[g.idx(2, 2)] = 2;
    // 발전소 2×2 앵커 (20,20)
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) kind[g.idx(20 + dx, 20 + dy)] = 5;
    const b64 = (u: Uint8Array): string => btoa(String.fromCharCode(...u));
    const v1 = {
      v: 1,
      money: 12345,
      tick: 77,
      speed: 1,
      happiness: 55,
      milestones: [100],
      kind: b64(kind),
      level: b64(level),
      progress: b64(new Uint8Array(n)),
      variant: b64(new Uint8Array(n)),
      plants: [20, 20],
    };
    const b = new GameState();
    expect(deserializeGame(b, v1)).toBe(true);
    expect(b.money).toBe(12345);
    expect(b.sections[0]).toBe(1);
    expect(b.stats.facilities).toBe(1);
    expect(b.grid.fac[b.grid.idx(20, 20)]).toBe(FAC.COAL);
    expect(b.popMilestones.has(100)).toBe(true);
    expect(refreshStats(b)).toBeUndefined();
  });
});
