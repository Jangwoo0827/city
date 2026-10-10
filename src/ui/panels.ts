import { GameState } from '../game/state';
import { taxMultiplier } from '../game/economy';
import { effectiveCapacity, powerUse, sewageUse, waterUse } from '../game/network';
import { GROWTH, MAX_LEVEL } from '../utils/constants';
import { ROAD_TYPES } from '../data/catalog';
import { K, Tile, isZoneKind } from '../world/grid';
import { BUILDING_NAME, KIND_NAME, buildingStats, facilityAt } from '../world/buildings';
import { roadMask } from '../world/roads';
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
  private lastHtml = '';

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
    const f = facilityAt(this.state.grid, this.tile.x, this.tile.y);
    if (f) return { x: f.x, y: f.y, w: f.def.w, h: f.def.h };
    return { x: this.tile.x, y: this.tile.y, w: 1, h: 1 };
  }

  /** 주기적으로 호출해 내용을 갱신 */
  render(): void {
    this.onChange(this.footprint());
    if (!this.tile) {
      this.setHtml('<div class="title">정보</div><div class="hint">‘정보’ 도구(5)로 타일이나 건물을 클릭하면 상세 정보가 표시됩니다.</div>');
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
      const road = g.access[i] >= 0;
      const powered = g.powered[i] === 1;
      const watered = g.watered[i] === 1;
      const sewered = g.sewered[i] === 1;
      const demand = zt === 'R' ? s.stats.demandR : zt === 'C' ? s.stats.demandC : s.stats.demandI;
      if (lv > 0) {
        title = `${BUILDING_NAME[k]} Lv.${lv}`;
        const b = buildingStats(k, lv);
        row('구역', ZONE_NAME[zt]);
        if (b.pop) row('주민', `${b.pop}명`);
        if (b.jobs) row('일자리', `${b.jobs}개`);
        const paying = powered && watered && sewered;
        row('세금', paying ? `+${(b.tax * taxMultiplier(s.happiness)).toFixed(1)}/일` : '납세 없음');
        if (lv < MAX_LEVEL) {
          const pct = Math.min(100, Math.round(g.progress[i] * 100));
          const need = GROWTH.minDemandForLevel[lv + 1];
          row('성장', !paying ? '공급 부족' : demand > need ? `${pct}%` : '수요 부족');
          rows.push(`<div class="bar"><i style="width:${pct}%"></i></div>`);
        } else {
          row('성장', '최고 레벨');
        }
        row('전력 / 수도 / 하수', `${(powerUse(k, lv)).toFixed(1)} / ${waterUse(k, lv).toFixed(1)} / ${sewageUse(k, lv).toFixed(1)}`);
      } else {
        title = `${ZONE_NAME[zt]} 구역 (빈 땅)`;
        if (!road) row('상태', '<span class="no">도로에서 너무 멀음</span>');
        else if (!powered) row('상태', '<span class="no">전력 필요</span>');
        else if (!watered) row('상태', '<span class="no">상수도 필요</span>');
        else if (!sewered) row('상태', '<span class="no">하수 처리 필요</span>');
        else if (demand <= 0) row('상태', '<span class="warn">수요 부족</span>');
        else row('상태', '<span class="ok">건설 대기 중</span>');
      }
      row('도로 접근', yes(road, `${manhattan(g, i)}칸 거리`, '없음'));
      row('전력', yes(powered, '공급 중', '끊김'));
      row('상수도', yes(watered, '공급 중', '끊김'));
      row('하수', yes(sewered, '처리 중', '끊김'));
      if (zt === 'R' && lv > 0) {
        const pol = Math.min(1, s.pollution[i]);
        row('오염도', pol > 0.05 ? `<span class="no">${Math.round(pol * 100)}%</span>` : '<span class="ok">깨끗함</span>');
      }
    } else if (k === K.ROAD) {
      const t = ROAD_TYPES[g.roadType[i]];
      title = t.name;
      const m = roadMask(g, x, y);
      const links = [1, 2, 4, 8].filter((b) => m & b).length;
      row('연결 방향', `${links}방향`);
      row('구역 깊이', `${t.depth}칸`);
      row('전력망', yes(g.powered[i] === 1, '통전', '미연결'));
      row('수도망', yes(g.watered[i] === 1, '통수', '미연결'));
      row('하수망', yes(g.sewered[i] === 1, '연결', '미연결'));
      row('유지비', `₩${t.upkeep}/일`);
    } else if (k === K.FAC) {
      const f = facilityAt(g, x, y)!;
      title = f.def.name;
      const linked = g.powered[i] === 1 || g.watered[i] === 1 || g.sewered[i] === 1;
      const cap = effectiveCapacity(s, f.def.id);
      const unit = f.def.category === 'power' ? '전력' : f.def.category === 'water' ? '급수량' : '하수 처리량';
      row(unit, `${cap.toFixed(1)} / ${f.def.capacity}`);
      row('도로 연결', yes(linked, '연결됨', '도로에 붙여 설치하세요'));
      row('유지비', `₩${f.def.upkeep}/일`);
      if (f.def.id === 5) row('지하수', `${Math.round(s.groundwater * 100)}%`);
      if (f.def.id === 3) row('수질 오염', `${Math.round(s.waterPollution * 100)}%`);
      rows.push(`<div class="hint">${f.def.desc}</div>`);
    } else if (g.isWater(x, y)) {
      title = '물';
      row('상태', '건설 불가 (취수장·배출구는 물 타일 옆에)');
    } else {
      row('상태', '건설 가능');
    }
    row('좌표', `${x}, ${y}`);

    this.setHtml(`<div class="title">${title}<button class="close" aria-label="닫기">✕</button></div>${rows.join('')}`);
  }

  /** 내용이 바뀐 경우에만 DOM 갱신 (클릭 도중 버튼이 교체되는 것 방지) */
  private setHtml(html: string): void {
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.el.innerHTML = html;
  }
}

function manhattan(g: GameState['grid'], i: number): number {
  const r = g.access[i];
  if (r < 0) return 0;
  return Math.abs((r % g.size) - (i % g.size)) + Math.abs(((r / g.size) | 0) - ((i / g.size) | 0));
}
