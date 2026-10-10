import { describe, expect, it } from 'vitest';
import { GameState } from '../src/game/state';
import { applyAction, previewAction, canPlaceFacility, ToolOptions } from '../src/game/actions';
import { meetsRequirements, refreshStats, tick } from '../src/game/simulation';
import { updateFires } from '../src/game/events';
import { awardXp, buyNode, buySection, sectionCost } from '../src/game/progression';
import { FAC } from '../src/data/catalog';
import { K } from '../src/world/grid';
import { deserializeGame, serializeGame } from '../src/utils/save';
import { buildStarterCity, T } from '../scripts/scenario';
import { ABANDON, HAPPINESS, LEGACY_OFFSET as O, SECTIONS_PER_SIDE } from '../src/utils/constants';
import { ZONE_BY_KIND } from '../src/data/zones';
import { sectionIndex } from '../src/world/grid';

const opts = (o: Partial<ToolOptions> = {}): ToolOptions => ({ zone: 'R', facility: FAC.WIND, roadType: 0, ...o });

describe('구획(맵 해금)', () => {
  it('시작은 중앙 32×32만 열려 있다', () => {
    const s = new GameState();
    expect(s.isUnlockedAt(16 + O, 16 + O)).toBe(true);
    expect(s.isUnlockedAt(47 + O, 47 + O)).toBe(true);
    expect(s.isUnlockedAt(15 + O, 16 + O)).toBe(false);
    expect(s.isUnlockedAt(0, 0)).toBe(false);
    expect(s.sections.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('잠긴 구획에는 건설할 수 없다', () => {
    const s = new GameState();
    const r = applyAction(s, 'road', opts(), T(4, 4), T(8, 4));
    expect(r.ok).toBe(false);
    expect(s.grid.kind[s.grid.idx(4 + O, 4 + O)]).toBe(K.EMPTY);
  });

  it('맞닿은 구획만 돈으로 해금할 수 있다', () => {
    const s = new GameState();
    s.money = 100000;
    expect(buySection(s, 0).ok).toBe(false); // 모서리: 맞닿지 않음
    const above = (SECTIONS_PER_SIDE / 2 - 2) * SECTIONS_PER_SIDE + SECTIONS_PER_SIDE / 2 - 1; // 시작 구획 바로 위
    const cost = sectionCost(s);
    const before = s.money;
    expect(buySection(s, above).ok).toBe(true); // 위쪽 구획
    expect(s.money).toBe(before - cost);
    expect(sectionCost(s)).toBeGreaterThan(cost);
    expect(s.isUnlockedAt(20 + O, 4 + O)).toBe(true);
  });
});

describe('도로·구역·시설 규칙', () => {
  it('구역은 도로에서 4칸 이내에만 지정된다', () => {
    const s = new GameState();
    applyAction(s, 'road', opts(), T(20, 30), T(40, 30));
    const near = previewAction(s, 'zone', opts(), T(30, 34), T(30, 34));
    const far = previewAction(s, 'zone', opts(), T(30, 35), T(30, 35));
    expect(near.tiles[0].ok).toBe(true);
    expect(far.tiles[0].ok).toBe(false);
  });

  it('대형 도로는 구역을 6칸까지 붙일 수 있고, 해금 전에는 설치할 수 없다', () => {
    const s = new GameState();
    expect(applyAction(s, 'road', opts({ roadType: 2 }), T(20, 30), T(24, 30)).ok).toBe(false);
    s.unlocked.add('road_large');
    expect(applyAction(s, 'road', opts({ roadType: 2 }), T(20, 30), T(40, 30)).ok).toBe(true);
    const six = previewAction(s, 'zone', opts(), T(30, 36), T(30, 36));
    expect(six.tiles[0].ok).toBe(true);
  });

  it('취수장·배출구는 물 타일에 붙어야 한다', () => {
    const s = new GameState();
    expect(canPlaceFacility(s, FAC.PUMP, T(26, 21))).toBe(true); // 호수 옆
    expect(canPlaceFacility(s, FAC.PUMP, T(40, 40))).toBe(false);
    expect(canPlaceFacility(s, FAC.WIND, T(40, 40))).toBe(true);
    expect(canPlaceFacility(s, FAC.WIND, T(22, 21))).toBe(false); // 물 위
  });

  it('도로 업그레이드는 차액만 청구한다', () => {
    const s = new GameState();
    s.unlocked.add('road_medium');
    applyAction(s, 'road', opts(), T(20, 30), T(20, 30));
    const m0 = s.money;
    applyAction(s, 'road', opts({ roadType: 1 }), T(20, 30), T(20, 30));
    expect(m0 - s.money).toBe(18 - 12);
    expect(s.grid.roadType[s.grid.idx(20 + O, 30 + O)]).toBe(1);
  });
});

describe('시설 드래그 설치', () => {
  it('영역을 드래그하면 시설 크기 격자로 한꺼번에 깔린다', () => {
    const s = new GameState();
    s.money = 100000;
    // 풍력 터빈(1×1): 4×3 영역 → 12기
    const pv = previewAction(s, 'facility', opts({ facility: FAC.WIND }), T(30, 30), T(33, 32));
    expect(pv.cost).toBe(12 * 600);
    const r = applyAction(s, 'facility', opts({ facility: FAC.WIND }), T(30, 30), T(33, 32));
    expect(r.placed).toBe(12);
    expect(s.stats.facilities).toBe(12);
  });

  it('큰 시설은 영역 안에 들어가는 개수만큼 깔린다', () => {
    const s = new GameState();
    s.money = 100000;
    s.unlocked.add('fac_coal');
    // 석탄 발전소(2×2): 5×4 영역 → 가로 2 × 세로 2 = 4기
    const r = applyAction(s, 'facility', opts({ facility: FAC.COAL }), T(30, 30), T(34, 33));
    expect(r.placed).toBe(4);
    // 영역이 시설보다 작아도 시작 지점에 하나는 깐다
    const one = applyAction(s, 'facility', opts({ facility: FAC.COAL }), T(40, 30), T(40, 30));
    expect(one.placed).toBe(1);
  });

  it('일부 칸이 막혀 있으면 가능한 곳에만 깔리고 미리보기는 칸별로 표시된다', () => {
    const s = new GameState();
    s.money = 100000;
    applyAction(s, 'road', opts(), T(31, 30), T(31, 30)); // 가운데 한 칸 막음
    const pv = previewAction(s, 'facility', opts({ facility: FAC.WIND }), T(30, 30), T(32, 30));
    expect(pv.tiles.map((t) => t.ok)).toEqual([true, false, true]);
    const r = applyAction(s, 'facility', opts({ facility: FAC.WIND }), T(30, 30), T(32, 30));
    expect(r.placed).toBe(2);
  });

  it('물가를 따라 드래그하면 취수장이 물 타일 옆에만 깔린다', () => {
    const s = new GameState();
    s.money = 100000;
    // 호수 동쪽 가장자리(x=26) 세로로 드래그
    const r = applyAction(s, 'facility', opts({ facility: FAC.PUMP }), T(26, 18), T(26, 24));
    expect(r.placed).toBeGreaterThan(1);
    expect(r.placed).toBeLessThanOrEqual(7);
  });
});

describe('철거 환급', () => {
  it('도로를 철거하면 건설비의 50%를 돌려받는다', () => {
    const s = new GameState();
    applyAction(s, 'road', opts(), T(20, 30), T(24, 30)); // 5칸 × 12
    const before = s.money;
    const r = applyAction(s, 'demolish', opts(), T(20, 30), T(24, 30));
    expect(r.ok).toBe(true);
    expect(s.money - before).toBe(5 * 6);
    expect(s.stats.roads).toBe(0);
  });

  it('여러 칸짜리 시설은 한 번만 환급한다', () => {
    const s = new GameState();
    s.unlocked.add('fac_coal');
    applyAction(s, 'facility', opts({ facility: FAC.COAL }), T(30, 30), T(30, 30));
    const before = s.money;
    applyAction(s, 'demolish', opts(), T(30, 30), T(31, 31)); // 2×2 전체 선택
    expect(s.money - before).toBe(750); // 1500 × 50%
    expect(s.stats.facilities).toBe(0);
  });

  it('건물이 있는 구역은 레벨에 따라 추가 환급', () => {
    const s = new GameState();
    applyAction(s, 'road', opts(), T(20, 30), T(30, 30));
    applyAction(s, 'zone', opts(), T(25, 31), T(25, 31));
    s.grid.level[s.grid.idx(25 + O, 31 + O)] = 3;
    const before = s.money;
    applyAction(s, 'demolish', opts(), T(25, 31), T(25, 31));
    expect(s.money - before).toBe(3 + 15);
  });

  it('자금이 마이너스여도 철거할 수 있다', () => {
    const s = new GameState();
    applyAction(s, 'road', opts(), T(20, 30), T(22, 30));
    s.money = -3000;
    const pv = previewAction(s, 'demolish', opts(), T(20, 30), T(22, 30));
    expect(pv.tiles.every((t) => t.ok)).toBe(true);
    const r = applyAction(s, 'demolish', opts(), T(20, 30), T(22, 30));
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
    applyAction(s, 'demolish', opts(), T(26, 21), T(26, 21));
    expect(s.stats.waterSupply).toBe(0);
    for (let t = 0; t < 60; t++) tick(s);
    expect(s.stats.buildings).toBeLessThanOrEqual(before);
    expect(s.stats.wateredRatio).toBe(0);
    // 단수가 오래 이어지면 폐허가 된다
    for (let t = 0; t < 100; t++) tick(s);
    expect(s.stats.abandoned).toBeGreaterThan(0);
    expect(s.stats.pop).toBeLessThan(1);
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
    applyAction(s, 'facility', opts({ facility: FAC.COAL }), T(28, 17), T(28, 17));
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
    applyAction(clean, 'facility', opts({ facility: FAC.TREATMENT }), T(28, 22), T(28, 22));
    for (let t = 0; t < 400; t++) tick(clean);
    expect(clean.waterPollution).toBeLessThan(polluted.waterPollution);
  });
});

describe('서비스 건물(P3)', () => {
  const unlockAll = (s: GameState): void => {
    for (const id of ['fac_clinic', 'fac_hospital', 'fac_fire', 'fac_police', 'fac_park_s', 'fac_park_l']) s.unlocked.add(id);
    s.money = 100000;
  };
  const house = (s: GameState, x: number, y: number, level = 3): number => {
    const i = s.grid.idx(x + O, y + O);
    s.grid.kind[i] = K.RES;
    s.grid.level[i] = level;
    return i;
  };

  it('해금 전에는 서비스 건물을 지을 수 없다', () => {
    const s = new GameState();
    s.money = 100000;
    expect(applyAction(s, 'facility', opts({ facility: FAC.CLINIC }), T(30, 30), T(30, 30)).ok).toBe(false);
    s.unlocked.add('fac_clinic');
    expect(applyAction(s, 'facility', opts({ facility: FAC.CLINIC }), T(30, 30), T(30, 30)).ok).toBe(true);
  });

  it('커버리지는 반경 안에서만 생기고 거리에 따라 줄어든다', () => {
    const s = new GameState();
    unlockAll(s);
    applyAction(s, 'facility', opts({ facility: FAC.CLINIC }), T(30, 30), T(30, 30)); // 2×2, 중심 (30.5, 30.5)
    const near = house(s, 31, 31);
    const mid = house(s, 38, 31);
    const far = house(s, 56, 31);
    refreshStats(s);
    expect(s.cov.health[near]).toBe(1);
    expect(s.cov.health[mid]).toBeGreaterThan(0);
    expect(s.cov.health[mid]).toBeLessThan(1);
    expect(s.cov.health[far]).toBe(0);
    expect(s.cov.police[near]).toBe(0); // 다른 서비스는 영향 없음
  });

  it('병원 수용량보다 주민이 많으면 효율이 떨어진다', () => {
    const s = new GameState();
    unlockAll(s);
    applyAction(s, 'facility', opts({ facility: FAC.CLINIC }), T(30, 30), T(30, 30)); // 환자 120명 수용
    // 레벨 3 주택(28명) 80채 = 2,240명 → 환자 8% = 179명
    for (let k = 0; k < 80; k++) house(s, 24 + (k % 8), 33 + Math.floor(k / 8));
    refreshStats(s);
    const load = [...s.serviceLoad.values()][0];
    expect(load.pop).toBe(2240);
    expect(load.patients).toBeCloseTo(2240 * 0.08, 3);
    expect(load.eff).toBeCloseTo(120 / (2240 * 0.08), 3);
    expect(s.stats.covHealth).toBeLessThanOrEqual(load.eff + 1e-6); // 커버리지 = 거리 감쇠 × 효율
    expect(s.stats.covHealth).toBeGreaterThan(0.3);
  });

  it('주민 1,000명 규모에서는 진료소 하나로 충분하다', () => {
    const s = new GameState();
    unlockAll(s);
    applyAction(s, 'facility', opts({ facility: FAC.CLINIC }), T(30, 30), T(30, 30));
    for (let k = 0; k < 36; k++) house(s, 28 + (k % 6), 33 + Math.floor(k / 6)); // 1,008명
    refreshStats(s);
    expect([...s.serviceLoad.values()][0].eff).toBe(1);
  });

  it('화재는 한 번 난 뒤 일정 기간은 다시 나지 않는다', () => {
    const s = new GameState();
    for (let k = 0; k < 60; k++) house(s, 20 + (k % 10), 20 + Math.floor(k / 10) * 2);
    s.stats.buildings = 60;
    s.lastFireTick = s.tick; // 방금 불이 났다고 가정
    const before = s.fires.size;
    const orig = Math.random;
    Math.random = () => 0; // 항상 발화 조건을 만족시킨다
    try {
      updateFires(s);
    } finally {
      Math.random = orig;
    }
    expect(s.fires.size).toBe(before); // 쿨다운 중이라 새 불은 없다
  });

  it('의료·공원 커버리지는 행복도 목표치를 올린다', () => {
    const base0 = HAPPINESS.base;
    HAPPINESS.base = 125; // 클램프(0~100) 영향 제거
    const s = new GameState();
    unlockAll(s);
    for (let k = 0; k < 6; k++) house(s, 28 + k, 33);
    refreshStats(s);
    const base = s.happinessTarget;
    applyAction(s, 'facility', opts({ facility: FAC.CLINIC }), T(30, 30), T(30, 30));
    applyAction(s, 'facility', opts({ facility: FAC.PARK_L }), T(26, 33), T(26, 33));
    refreshStats(s);
    HAPPINESS.base = base0;
    expect(s.happinessTarget).toBeGreaterThan(base + 5);
  });

  it('경찰이 없으면 인구가 많을 때 범죄 페널티가 생긴다', () => {
    const base0 = HAPPINESS.base;
    HAPPINESS.base = 125;
    const s = new GameState();
    unlockAll(s);
    for (let k = 0; k < 30; k++) house(s, 20 + (k % 10), 40 + Math.floor(k / 10) * 2);
    refreshStats(s);
    const noPolice = s.happinessTarget;
    applyAction(s, 'facility', opts({ facility: FAC.POLICE }), T(24, 38), T(24, 38));
    refreshStats(s);
    HAPPINESS.base = base0;
    expect(s.stats.covPolice).toBeGreaterThan(0.3);
    expect(s.happinessTarget).toBeGreaterThan(noPolice);
  });

  it('소방서가 없으면 불난 건물이 전소되고, 소방서가 있으면 진압된다', () => {
    const noFire = new GameState();
    const a = house(noFire, 30, 30);
    noFire.fires.set(a, 3);
    for (let t = 0; t < 5; t++) tick(noFire);
    expect(noFire.grid.level[a]).toBe(0);
    expect(noFire.fires.has(a)).toBe(false);

    const withFire = new GameState();
    unlockAll(withFire);
    applyAction(withFire, 'facility', opts({ facility: FAC.FIRE }), T(32, 30), T(32, 30));
    const b = house(withFire, 30, 30);
    refreshStats(withFire);
    expect(withFire.cov.fire[b]).toBe(1);
    withFire.fires.set(b, 3);
    for (let t = 0; t < 3; t++) tick(withFire);
    expect(withFire.grid.level[b]).toBe(3);
    expect(withFire.fires.has(b)).toBe(false);
  });
});

describe('교육·사무·땅값·폐허·다리 (P4·P5)', () => {
  /** 전력·수도·하수·도로가 충분한 시험 도시 + 주민 있는 주택 + 상업 일자리 */
  const richCity = (): GameState => {
    const s = new GameState();
    buildStarterCity(s);
    s.unlocked.add('fac_coal');
    s.unlocked.add('zone_office');
    s.unlocked.add('zone_rh');
    s.unlocked.add('zone_ch');
    s.money = 500000;
    applyAction(s, 'facility', opts({ facility: FAC.COAL }), T(28, 17), T(28, 17));
    // 주택 10채(레벨 3) → 노동력, 상업 건물 5채(레벨 3) → 상업 일자리 80
    for (let k = 0; k < 10; k++) {
      const i = s.grid.idx(32 + (k % 5) + O, 27 + Math.floor(k / 5) + O);
      s.grid.kind[i] = K.RES;
      s.grid.level[i] = 3;
    }
    for (let k = 0; k < 5; k++) {
      const i = s.grid.idx(17 + k + O, 27 + O);
      s.grid.kind[i] = K.COM;
      s.grid.level[i] = 3;
    }
    refreshStats(s);
    return s;
  };

  it('사무 구역은 해금 전에는 지정할 수 없다', () => {
    const s = new GameState();
    applyAction(s, 'road', opts(), T(20, 30), T(30, 30));
    const pv = previewAction(s, 'zone', opts({ zone: 'O' }), T(25, 32), T(25, 32));
    expect(pv.tiles.length).toBe(0);
    s.unlocked.add('zone_office');
    expect(previewAction(s, 'zone', opts({ zone: 'O' }), T(25, 32), T(25, 32)).tiles[0].ok).toBe(true);
  });

  it('교육받은 시민이 없으면 사무 건물이 지어지지 않고, 있으면 지어진다', () => {
    const none = richCity();
    applyAction(none, 'zone', opts({ zone: 'O' }), T(18, 24), T(24, 25));
    none.edu = { a1: 0, a2: 0, a3: 0 };
    for (let t = 0; t < 40; t++) tick(none);
    const officeCount = (g: GameState): number => {
      let n = 0;
      for (let i = 0; i < g.grid.count; i++) if (g.grid.kind[i] === K.OFF && g.grid.level[i] > 0) n++;
      return n;
    };
    expect(officeCount(none)).toBe(0);

    const educated = richCity();
    applyAction(educated, 'zone', opts({ zone: 'O' }), T(18, 24), T(24, 25));
    educated.edu = { a1: 1, a2: 0.8, a3: 0.5 };
    for (let t = 0; t < 40; t++) tick(educated);
    expect(officeCount(educated)).toBeGreaterThan(0);
  });

  it('학력이 낮으면 고급 일자리를 채우지 못한다 (일자리 매칭)', () => {
    const s = richCity();
    const i = s.grid.idx(20 + O, 24 + O);
    s.grid.kind[i] = K.OFF;
    s.grid.level[i] = 3; // 사무 3레벨: 고학력 일자리 55개
    s.edu = { a1: 0, a2: 0, a3: 0 };
    refreshStats(s);
    const lowEdu = s.stats.jobs;
    expect(s.stats.jobsTotal).toBeGreaterThan(lowEdu);
    s.edu = { a1: 1, a2: 1, a3: 1 };
    refreshStats(s);
    expect(s.stats.jobs).toBeGreaterThan(lowEdu);
  });

  it('학교 커버리지가 시민 이수율을 서서히 올린다', () => {
    const s = richCity();
    s.unlocked.add('fac_school_e');
    s.unlocked.add('fac_school_h');
    applyAction(s, 'facility', opts({ facility: FAC.SCHOOL_E }), T(34, 24), T(34, 24));
    applyAction(s, 'facility', opts({ facility: FAC.SCHOOL_H }), T(36, 23), T(36, 23));
    for (let t = 0; t < 200; t++) tick(s);
    expect(s.edu.a1).toBeGreaterThan(0.3);
    expect(s.edu.a2).toBeGreaterThan(0.1);
    expect(s.edu.a3).toBe(0); // 대학교가 없다
    expect(s.edu.a2).toBeLessThanOrEqual(s.edu.a1 + 1e-9);
  });

  it('땅값은 공원·서비스 근처에서 올라가고 공업 오염 근처에서 내려간다', () => {
    const s = richCity();
    const near = s.grid.idx(36 + O, 31 + O);
    const base = s.grid.landValue[near];
    s.unlocked.add('fac_park_l');
    applyAction(s, 'facility', opts({ facility: FAC.PARK_L }), T(36, 31), T(36, 31));
    refreshStats(s);
    expect(s.grid.landValue[near]).toBeGreaterThan(base + 10);
    // 공업 건물 옆
    const ind = s.grid.idx(40 + O, 33 + O);
    s.grid.kind[ind] = K.IND;
    s.grid.level[ind] = 3;
    refreshStats(s);
    const polluted = s.grid.landValue[s.grid.idx(41 + O, 33 + O)];
    const clean = s.grid.landValue[s.grid.idx(41 + O, 36 + O)];
    expect(polluted).toBeLessThan(clean);
  });

  it('땅값이 모자라면 건물 레벨이 오르지 않는다', () => {
    const s = richCity();
    const i = s.grid.idx(32 + O, 27 + O);
    s.grid.level[i] = 1;
    s.grid.progress[i] = 0;
    s.grid.landValue[i] = 0;
    // 땅값이 낮은 상태에서는 meetsRequirements 가 거짓
    const def = ZONE_BY_KIND[K.RES];
    expect(meetsRequirements(s, def, 2, 10)).toBe(false);
    expect(meetsRequirements(s, def, 2, def.minLandValue[2])).toBe(true);
    // 고밀 주거는 땅값 45 이상이어야 한다
    expect(meetsRequirements(s, ZONE_BY_KIND[K.RESH], 1, 40)).toBe(false);
    expect(meetsRequirements(s, ZONE_BY_KIND[K.RESH], 1, 50)).toBe(true);
  });

  it('서비스가 오래 끊긴 건물은 폐허가 되고, 복구하면 되살아난다', () => {
    const s = richCity();
    const i = s.grid.idx(32 + O, 27 + O);
    expect(s.grid.level[i]).toBe(3);
    // 취수장 철거 → 단수
    applyAction(s, 'demolish', opts(), T(26, 21), T(26, 21));
    for (let t = 0; t < ABANDON.ticks + 5; t++) tick(s);
    expect(s.grid.abandoned[i]).toBe(1);
    expect(s.stats.abandoned).toBeGreaterThan(0);
    const popBefore = s.stats.pop;
    // 복구
    applyAction(s, 'facility', opts({ facility: FAC.PUMP }), T(26, 21), T(26, 21));
    for (let t = 0; t < ABANDON.ticks; t++) tick(s);
    expect(s.grid.abandoned[i]).toBe(0);
    expect(s.stats.pop).toBeGreaterThan(popBefore);
  });

  it('물 위에 다리를 놓을 수 있고 비용은 ×2.65, 환급도 비례한다', () => {
    const s = new GameState();
    s.money = 100000;
    const a = T(16, 21);
    const b = T(28, 21); // 호수를 가로지른다
    const g = s.grid;
    let water = 0;
    let land = 0;
    for (let x = a.x; x <= b.x; x++) (g.isWater(x, a.y) ? water++ : land++);
    expect(water).toBeGreaterThan(3);
    const before = s.money;
    const r = applyAction(s, 'road', opts(), a, b);
    expect(r.ok).toBe(true);
    expect(before - s.money).toBe(land * 12 + water * Math.round(12 * 2.65));
    expect(s.stats.roads).toBe(land + water);
    // 철거 환급
    const m1 = s.money;
    applyAction(s, 'demolish', opts(), a, b);
    expect(s.money - m1).toBe(land * 6 + water * Math.round(12 * 0.5 * 2.65));
  });

  it('다리 위 도로도 전력·수도망으로 이어진다 (호수 건너편 구역이 공급받는다)', () => {
    const s = new GameState();
    s.money = 100000;
    // 호수 서쪽에서 동쪽 취수장까지 다리
    applyAction(s, 'road', opts(), T(16, 21), T(27, 21)); // 호수(19~25) 가로질러 취수장 옆(27,21)
    applyAction(s, 'facility', opts({ facility: FAC.PUMP }), T(26, 22), T(26, 22)); // 호수 옆, 도로(27,22)? 아님 → 다음 줄에서 연결
    applyAction(s, 'road', opts(), T(27, 21), T(27, 23));
    applyAction(s, 'facility', opts({ facility: FAC.PUMP }), T(26, 20), T(26, 20));
    refreshStats(s);
    // 서쪽 끝 도로 타일(16,21)까지 수도망이 닿는다
    expect(s.grid.watered[s.grid.idx(16 + O, 21 + O)]).toBe(1);
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
    a.sections[(SECTIONS_PER_SIDE / 2 - 2) * SECTIONS_PER_SIDE + SECTIONS_PER_SIDE / 2 - 1] = 1;
    const data = JSON.parse(JSON.stringify(serializeGame(a)));

    const b = new GameState();
    expect(deserializeGame(b, data)).toBe(true);
    expect(b.money).toBeCloseTo(a.money);
    expect(b.stats.buildings).toBe(a.stats.buildings);
    expect(b.stats.facilities).toBe(a.stats.facilities);
    expect(b.stats.roads).toBe(a.stats.roads);
    expect(b.level).toBe(a.level);
    expect(b.unlocked.has('fac_coal')).toBe(true);
    expect(b.sections.reduce((x, y) => x + y, 0)).toBe(5);
    expect(b.grid.kind).toEqual(a.grid.kind);
    expect(b.grid.fac).toEqual(a.grid.fac);
  });

  it('v1 저장(64×64)을 v2로 이전하고 새 맵 중앙에 놓는다 (발전소는 석탄 발전소, 건물이 있는 구획은 열림)', () => {
    const L = 64; // 예전 맵 한 변
    const n = L * L;
    const kind = new Uint8Array(n);
    const level = new Uint8Array(n);
    // 예전 좌표 (2,2)에 건물이 있는 주거 구역 → 예전 구획 0이 열려야 함
    kind[2 * L + 2] = K.RES;
    level[2 * L + 2] = 2;
    // 발전소 2×2 앵커 (예전 좌표 20,20)
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) kind[(20 + dy) * L + 20 + dx] = 5;
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
    // 예전 구획 0 → 새 맵에서는 중앙 오프셋만큼 이동한 구획
    expect(b.sections[sectionIndex(2 + O, 2 + O)]).toBe(1);
    expect(b.stats.facilities).toBe(1);
    expect(b.grid.fac[b.grid.idx(20 + O, 20 + O)]).toBe(FAC.COAL);
    expect(b.grid.level[b.grid.idx(2 + O, 2 + O)]).toBe(2);
    expect(b.popMilestones.has(100)).toBe(true);
  });
});
