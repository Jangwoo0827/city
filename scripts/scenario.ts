import { GameState } from '../src/game/state';
import { applyAction, ToolOptions } from '../src/game/actions';
import { refreshStats } from '../src/game/simulation';
import { FAC } from '../src/data/catalog';

const opts = (o: Partial<ToolOptions> = {}): ToolOptions => ({ zone: 'R', facility: FAC.WIND, roadType: 0, ...o });

/** 시작 구획(중앙 32×32) 안에 간단한 도시를 만든다. 테스트·시뮬레이터 공용. */
export function buildStarterCity(s: GameState): void {
  // 도로: 가로 간선 + 세로 간선 + 호수 쪽 연결로
  applyAction(s, 'road', opts(), { x: 16, y: 26 }, { x: 46, y: 26 });
  applyAction(s, 'road', opts(), { x: 30, y: 16 }, { x: 30, y: 46 });
  applyAction(s, 'road', opts(), { x: 27, y: 21 }, { x: 27, y: 26 });

  // 상수도(호수 옆 취수장) + 하수 배출구
  applyAction(s, 'facility', opts({ facility: FAC.PUMP }), { x: 26, y: 21 }, { x: 26, y: 21 });
  applyAction(s, 'facility', opts({ facility: FAC.OUTLET }), { x: 26, y: 22 }, { x: 26, y: 22 });

  // 풍력 터빈 3기
  for (const y of [22, 23, 24]) applyAction(s, 'facility', opts({ facility: FAC.WIND }), { x: 31, y }, { x: 31, y });

  // 구역: 간선 양옆
  applyAction(s, 'zone', opts({ zone: 'R' }), { x: 31, y: 27 }, { x: 45, y: 30 });
  applyAction(s, 'zone', opts({ zone: 'C' }), { x: 17, y: 27 }, { x: 29, y: 29 });
  applyAction(s, 'zone', opts({ zone: 'I' }), { x: 31, y: 32 }, { x: 45, y: 36 });
  applyAction(s, 'zone', opts({ zone: 'R' }), { x: 17, y: 30 }, { x: 29, y: 33 });
  refreshStats(s);
}
