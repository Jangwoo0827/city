import './ui/styles.css';
import { GameState } from './game/state';
import { tick, refreshStats } from './game/simulation';
import { GameView } from './render/scene';
import { ToolController, createToolbar } from './ui/toolbar';
import { InputController } from './ui/input';
import { InfoPanel, Tooltip } from './ui/panels';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

const state = new GameState();
const view = new GameView(canvas, state);
const tools = new ToolController();
const tip = new Tooltip(ui);
const info = new InfoPanel(ui, state, (fp) => view.setSelection(fp));
createToolbar(ui, tools);

let lastSpeed = 1;
const togglePause = (): void => {
  if (state.gameOver) return;
  if (state.speed > 0) {
    lastSpeed = state.speed;
    state.speed = 0;
  } else {
    state.speed = lastSpeed || 1;
  }
};

const input = new InputController(view, state, tools, tip, {
  onSelect: (tile) => info.select(tile),
  onTogglePause: togglePause,
});

state.on('reset', () => view.city.resetAnimations());
state.on('toast', (msg) => console.info('[toast]', msg));
refreshStats(state);

if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = { state, view, tools, tick };

let last = performance.now();
let simAcc = 0;
let infoTimer = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  // 시뮬레이션: 1초 = 1틱 × 배속
  if (state.speed > 0 && !state.gameOver) {
    simAcc += dt * state.speed;
    let steps = 0;
    while (simAcc >= 1 && steps < 6) {
      tick(state);
      simAcc -= 1;
      steps++;
    }
    if (steps === 6) simAcc = 0;
  }

  infoTimer += dt;
  if (infoTimer > 0.25) {
    infoTimer = 0;
    info.render();
  }

  input.update(dt);
  view.render(dt, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
