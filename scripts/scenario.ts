import { GameState } from '../src/game/state';
import { applyAction, ToolOptions } from '../src/game/actions';
import { refreshStats } from '../src/game/simulation';
import { FAC } from '../src/data/catalog';
import { LEGACY_OFFSET } from '../src/utils/constants';

/** 시작 구역 기준 좌표(예전 64×64 좌표)를 현재 맵 좌표로 */
export const T = (x: number, y: number): { x: number; y: number } => ({ x: x + LEGACY_OFFSET, y: y + LEGACY_OFFSET });

const opts = (o: Partial<ToolOptions> = {}): ToolOptions => ({ zone: 'R', facility: FAC.WIND, roadType: 0, ...o });

/** 시작 구획(중앙 32×32) 안에 간단한 도시를 만든다. 테스트·시뮬레이터 공용. */
export function buildStarterCity(s: GameState): void {
  // 도로: 가로 간선 + 세로 간선 + 호수 쪽 연결로
  applyAction(s, 'road', opts(), T(16, 26), T(46, 26));
  applyAction(s, 'road', opts(), T(30, 16), T(30, 46));
  applyAction(s, 'road', opts(), T(27, 21), T(27, 26));

  // 상수도(호수 옆 취수장) + 하수 배출구
  applyAction(s, 'facility', opts({ facility: FAC.PUMP }), T(26, 21), T(26, 21));
  applyAction(s, 'facility', opts({ facility: FAC.OUTLET }), T(26, 22), T(26, 22));

  // 풍력 터빈 3기
  for (const y of [22, 23, 24]) applyAction(s, 'facility', opts({ facility: FAC.WIND }), T(31, y), T(31, y));

  // 구역: 간선 양옆
  applyAction(s, 'zone', opts({ zone: 'R' }), T(31, 27), T(45, 30));
  applyAction(s, 'zone', opts({ zone: 'C' }), T(17, 27), T(29, 29));
  applyAction(s, 'zone', opts({ zone: 'I' }), T(31, 32), T(45, 36));
  applyAction(s, 'zone', opts({ zone: 'R' }), T(17, 30), T(29, 33));
  refreshStats(s);
}
