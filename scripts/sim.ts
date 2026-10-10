// 헤드리스 시뮬레이터: 브라우저 없이 N틱을 돌려 인구·자금·XP 곡선을 출력한다.
//   npm run sim            (기본 900틱, 100틱마다 출력)
//   npm run sim -- 3000 250
import { GameState } from '../src/game/state';
import { tick } from '../src/game/simulation';
import { buildStarterCity } from './scenario';

const ticks = Number(process.argv[2] ?? 900);
const every = Number(process.argv[3] ?? 100);

// 재현 가능한 결과를 위해 시드 고정 난수
let seed = 12345;
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const s = new GameState();
buildStarterCity(s);

console.log('tick,money,pop,jobs,buildings,happy,level,xp,devP,powerDem/Sup,waterDem/Sup,sewDem/Cap,income,expense');
for (let t = 1; t <= ticks; t++) {
  tick(s);
  if (t % every === 0 || t === ticks) {
    const st = s.stats;
    console.log(
      [
        t,
        Math.floor(s.money),
        st.pop,
        st.jobs,
        st.buildings,
        Math.round(s.happiness),
        s.level,
        s.xp,
        s.devPoints,
        `${st.powerDemand.toFixed(1)}/${st.powerSupply.toFixed(1)}`,
        `${st.waterDemand.toFixed(1)}/${st.waterSupply.toFixed(1)}`,
        `${st.sewageDemand.toFixed(1)}/${st.sewageCap.toFixed(1)}`,
        st.income.toFixed(1),
        st.expense.toFixed(1),
      ].join(','),
    );
  }
  if (s.gameOver) {
    console.log('GAME OVER at tick', t);
    break;
  }
}
