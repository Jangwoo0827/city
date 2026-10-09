import { GameState } from '../game/state';
import { taxMultiplier } from '../game/economy';
import { COST, GROWTH, UPKEEP, MAX_LEVEL } from '../utils/constants';
import { K, Tile, isZoneKind } from '../world/grid';
import { BUILDING_NAME, KIND_NAME, PLANT_SIZE, buildingStats, plantAnchorAt } from '../world/buildings';
import { hasAdjacentRoad, roadMask } from '../world/roads';
import { ZONE_NAME, zoneTypeOfKind } from '../world/zones';

/** 마우스 커서를 따라다니는 비용/상태 툴팁 */
export class Tooltip {
  private readonly el: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'tooltip';
    root.appendChild(this.el);
  }

  show(text: string, x: number, y: number, ok: boolean): void {
    if (!text) {
      this.hide();
      return;
    }
    this.el.textContent = text;
    this.el.classList.toggle('bad', !ok);
    this.el.style.transform = `translate(${Math.round(x + 16)}px, ${Math.round(y + 16)}px)`;
    this.el.classList.add('show');
  }

  hide(): void {
    this.el.classList.remove('show');
  }
}

export interface Footprint {
  x: number;
  y: number;
  w: number;
  h: number;
}

const yes = (v: boolean, good = '정상', bad = '없음'): string =>
  v ? `<span class="ok">✔ ${good}</span>` : `<span class="no">✖ ${bad}</span>`;

/** 우측 선택 정보 패널 */
export class InfoPanel {
  private readonly el: HTMLDivElement;
  private tile: Tile | null = null;

  constructor(
    root: HTMLElement,
    private readonly state: GameState,
    private readonly onChange: (fp: Footprint | null) => void,
  ) {
    this.el = document.createElement('div');
    this.el.id = 'info';
    this.el.className = 'panel';
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.close')) this.select(null);
    });
    state.on('reset', () => this.select(null));
    this.render();
  }

  select(tile: Tile | null): void {
    this.tile = tile;
    this.render();
  }

  /** 선택 대상이 차지하는 타일 영역 */
  footprint(): Footprint | null {
    if (!this.tile) return null;
    const g = this.state.grid;
    const a = plantAnchorAt(g, this.tile.x, this.tile.y);
    if (a) return { x: a.x, y: a.y, w: PLANT_SIZE, h: PLANT_SIZE };
    return { x: this.tile.x, y: this.tile.y, w: 1, h: 1 };
  }

  /** 주기적으로 호출해 내용을 갱신 */
  render(): void {
    this.onChange(this.footprint());
    if (!this.tile) {
      this.el.innerHTML = `<div class="title">정보</div><div class="hint">‘정보’ 도구(5)로 타일이나 건물을 클릭하면 상세 정보가 표시됩니다.</div>`;
      return;
    }
    const s = this.state;
    const g = s.grid;
    const { x, y } = this.tile;
    const i = g.idx(x, y);
    const k = g.kind[i];
    const rows: string[] = [];
    let title = KIND_NAME[k] ?? '알 수 없음';

    const row = (label: string, value: string): void => {
      rows.push(`<div class="row"><span>${label}</span><b>${value}</b></div>`);
    };

    if (isZoneKind(k)) {
      const zt = zoneTypeOfKind(k)!;
      const lv = g.level[i];
      const road = hasAdjacentRoad(g, x, y);
      const powered = g.powered[i] === 1;
      if (lv > 0) {
        title = `${BUILDING_NAME[k]} Lv.${lv}`;
        const b = buildingStats(k, lv);
        row('구역', ZONE_NAME[zt]);
        if (b.pop) row('주민', `${b.pop}명`);
        if (b.jobs) row('일자리', `${b.jobs}개`);
        row('세금', powered ? `+${(b.tax * taxMultiplier(s.happiness)).toFixed(1)}/일` : '납세 없음');
        if (lv < MAX_LEVEL) {
          const pct = Math.min(100, Math.round(g.progress[i] * 100));
          const demand = zt === 'R' ? s.stats.demandR : zt === 'C' ? s.stats.demandC : s.stats.demandI;
          const need = GROWTH.minDemandForLevel[lv + 1];
          row('성장', demand > need ? `${pct}%` : '수요 부족');
          rows.push(`<div class="bar"><i style="width:${pct}%"></i></div>`);
        } else {
          row('성장', '최고 레벨');
        }
      } else {
        title = `${ZONE_NAME[zt]} 구역 (빈 땅)`;
        const demand = zt === 'R' ? s.stats.demandR : zt === 'C' ? s.stats.demandC : s.stats.demandI;
        if (!road) row('상태', '<span class="no">도로 인접 필요</span>');
        else if (!powered) row('상태', '<span class="no">전력 연결 필요</span>');
        else if (demand <= 0) row('상태', '<span class="warn">수요 부족</span>');
        else row('상태', '<span class="ok">건설 대기 중</span>');
      }
      row('도로 인접', yes(road, '인접', '없음'));
      row('전력', yes(powered, '공급 중', '끊김'));
      if (zt === 'R' && lv > 0) {
        const pol = Math.min(1, s.pollution[i]);
        row('오염도', pol > 0.05 ? `<span class="no">${Math.round(pol * 100)}%</span>` : '<span class="ok">깨끗함</span>');
      }
    } else if (k === K.ROAD) {
      const m = roadMask(g, x, y);
      const links = [1, 2, 4, 8].filter((b) => m & b).length;
      row('연결 방향', `${links}방향`);
      row('전력망', yes(g.powered[i] === 1, '통전', '미연결'));
      row('유지비', `₩${UPKEEP.road}/일`);
    } else if (k === K.PLANT) {
      const a = plantAnchorAt(g, x, y)!;
      let linked = false;
      for (let dy = -1; dy <= PLANT_SIZE; dy++) {
        for (let dx = -1; dx <= PLANT_SIZE; dx++) {
          const inside = dx >= 0 && dx < PLANT_SIZE && dy >= 0 && dy < PLANT_SIZE;
          if (!inside && g.kindAt(a.x + dx, a.y + dy) === K.ROAD) linked = true;
        }
      }
      row('상태', yes(true, '가동 중'));
      row('도로 연결', yes(linked, '연결됨', '도로에 붙여 설치하세요'));
      row('유지비', `₩${UPKEEP.plant}/일`);
      row('건설 비용', `₩${COST.plant.toLocaleString('ko-KR')}`);
    } else {
      row('상태', '건설 가능');
    }
    row('좌표', `${x}, ${y}`);

    this.el.innerHTML = `<div class="title">${title}<button class="close" aria-label="닫기">✕</button></div>${rows.join('')}`;
  }
}
