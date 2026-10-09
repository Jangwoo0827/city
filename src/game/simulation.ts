import { GameState } from './state';

/** 통계(인구·일자리·전력·수요 등)를 현재 맵 기준으로 다시 계산한다. */
export function refreshStats(_s: GameState): void {
  // M3~M4 에서 구현
}

/** 1틱(게임 내 하루) 진행 */
export function tick(s: GameState): void {
  s.tick++;
}
