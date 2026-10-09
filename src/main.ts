import './ui/styles.css';
import { GameState } from './game/state';
import { tick, refreshStats } from './game/simulation';
import { GameView } from './render/scene';
import { ToolController, createToolbar } from './ui/toolbar';
import { InputController } from './ui/input';
import { InfoPanel, Tooltip } from './ui/panels';
import { Hud, confirmDialog } from './ui/hud';
import { hasSave, loadGame, saveGame } from './utils/save';
import { AUTOSAVE_SECONDS } from './utils/constants';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

const state = new GameState();
const view = new GameView(canvas, state);
const tools = new ToolController();
const tip = new Tooltip(ui);
const info = new InfoPanel(ui, state, (fp) => view.setSelection(fp));
createToolbar(ui, tools);

let lastSpeed = 1;
const hud = new Hud(ui, state, {
  onSpeed: (sp) => {
    if (state.gameOver) return;
    state.speed = sp;
    if (sp > 0) lastSpeed = sp;
    hud.update();
  },
  onNewGame: async () => {
    if (!state.gameOver && !(await confirmDialog(ui, '새 게임을 시작할까요? 저장하지 않은 진행 상황은 사라집니다.', '새 게임'))) return;
    startNewGame();
  },
  onSave: () => {
    if (state.gameOver) return state.toast('파산한 도시는 저장할 수 없습니다', 'bad');
    state.toast(saveGame(state) ? '💾 저장했습니다' : '저장에 실패했습니다 (브라우저 저장소 사용 불가)', 'info');
  },
  onLoad: async () => {
    if (!hasSave()) return;
    if (!state.gameOver && !(await confirmDialog(ui, '저장된 도시를 불러올까요? 현재 진행 상황은 사라집니다.', '불러오기'))) return;
    if (loadGame(state)) {
      hud.update();
      state.toast('📂 저장된 도시를 불러왔습니다', 'good');
    } else state.toast('저장 데이터를 불러올 수 없습니다', 'bad');
  },
  hasSave,
});

function startNewGame(): void {
  state.reset();
  refreshStats(state);
  saveGame(state);
  hud.hideGameOver();
  hud.update();
  state.toast('도로를 깔고 → 구역을 지정하고 → 발전소를 연결해 보세요!', 'info');
}

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
refreshStats(state);
if (loadGame(state)) {
  state.toast('📂 저장된 도시를 불러왔습니다', 'good');
} else {
  state.toast('도로를 깔고 → 구역을 지정하고 → 발전소를 연결해 보세요!', 'info');
}
hud.update();

// 자동 저장: 30초마다 + 탭을 닫거나 새로고침/숨길 때
let autosaveTimer = 0;
const autosave = (): void => {
  if (!state.gameOver) saveGame(state);
};
window.addEventListener('beforeunload', autosave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') autosave();
});

if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = { state, view, tools, tick };

let last = performance.now();
let simAcc = 0;
let infoTimer = 0;
function frame(now: number): void {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.1, rawDt);
  last = now;

  // 시뮬레이션: 1초 = 1틱 × 배속
  if (state.speed > 0 && !state.gameOver) {
    simAcc += Math.min(1, rawDt) * state.speed;
    let steps = 0;
    while (simAcc >= 1 && steps < 6) {
      tick(state);
      simAcc -= 1;
      steps++;
    }
    if (steps === 6) simAcc = 0;
  }

  autosaveTimer += rawDt;
  if (autosaveTimer >= AUTOSAVE_SECONDS) {
    autosaveTimer = 0;
    autosave();
  }

  infoTimer += dt;
  if (infoTimer > 0.25) {
    infoTimer = 0;
    info.render();
    hud.update();
  }

  input.update(dt);
  view.render(dt, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
