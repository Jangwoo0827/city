import './ui/styles.css';
import { GameState } from './game/state';
import { GameView } from './render/scene';
import { ToolController, createToolbar } from './ui/toolbar';
import { InputController } from './ui/input';
import { Tooltip } from './ui/panels';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

const state = new GameState();
const view = new GameView(canvas, state);
const tools = new ToolController();
const tip = new Tooltip(ui);
createToolbar(ui, tools);

const input = new InputController(view, state, tools, tip, {
  onSelect: () => {},
  onTogglePause: () => {},
});

if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = { state, view, tools };

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.update(dt);
  view.render(dt, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
