import { FIRE } from '../utils/constants';
import { isZoneKind } from '../world/grid';
import { BUILDING_NAME } from '../world/buildings';
import { GameState } from './state';

/**
 * 화재 이벤트. 건물 수에 비례해 가끔 건물에 불이 나고, 소방 커버리지가 높을수록
 * 빨리·확실히 진압된다. 진압하지 못하면 건물이 전소(레벨 0, 빈 구역으로 돌아감)된다.
 */
export function updateFires(s: GameState): void {
  const g = s.grid;

  // 발화
  const cooled = s.tick - s.lastFireTick >= FIRE.cooldownTicks;
  if (cooled && s.stats.buildings >= FIRE.minBuildings && Math.random() < FIRE.chancePerBuilding * s.stats.buildings) {
    for (let tries = 0; tries < 60; tries++) {
      const i = Math.floor(Math.random() * g.count);
      if (!isZoneKind(g.kind[i]) || g.level[i] === 0 || s.fires.has(i)) continue;
      s.fires.set(i, FIRE.burnTicks);
      s.lastFireTick = s.tick;
      const covered = s.cov.fire[i] > 0.05;
      s.toast(
        covered
          ? `🔥 ${BUILDING_NAME[g.kind[i]]}에 불이 났습니다! 소방서가 출동합니다.`
          : `🔥 ${BUILDING_NAME[g.kind[i]]}에 불이 났습니다! 소방서 커버리지가 없어 전소될 위험이 큽니다.`,
        'bad',
      );
      break;
    }
  }

  // 진행
  for (const [i, left] of [...s.fires]) {
    if (!isZoneKind(g.kind[i]) || g.level[i] === 0) {
      s.fires.delete(i);
      continue;
    }
    const cov = s.cov.fire[i];
    const next = left - 1 - FIRE.coverageSpeed * cov;
    if (next > 0) {
      s.fires.set(i, next);
      continue;
    }
    s.fires.delete(i);
    if (Math.random() < cov) {
      s.toast('🚒 소방서가 화재를 진압했습니다', 'good');
    } else {
      g.level[i] = 0;
      g.progress[i] = 0;
      g.abandoned[i] = 0;
      s.dirty.buildings = true;
      s.toast('🏚️ 화재로 건물이 소실되었습니다', 'bad');
    }
  }
}
