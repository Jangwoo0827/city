import './ui/styles.css';
import { GameState } from './game/state';
import { tick, refreshStats } from './game/simulation';
import { applyAction } from './game/actions';
import { buySection, isSectionAdjacent, sectionCost } from './game/progression';
import { GameView } from './render/scene';
import { ToolController, createToolbar } from './ui/toolbar';
import { InputController } from './ui/input';
import { InfoPanel, Tooltip } from './ui/panels';
import { Hud, confirmDialog } from './ui/hud';
import { ProgressPanel } from './ui/progress';
import { hasSave, loadGame, saveGame } from './utils/save';
import { AUTOSAVE_SECONDS } from './utils/constants';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

const state = new GameState();
const view = new GameView(canvas, state);
const tools = new ToolController();
const tip = new Tooltip(ui);
const info = new InfoPanel(ui, state, (fp) => view.setSelection(fp));
const toolbar = createToolbar(ui, tools, state);

const progress = new ProgressPanel(ui, state, () => {
  toolbar.refresh();
  hud.update();
});

let lastSpeed = 1;
const hud: Hud = new Hud(ui, state, {
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
  onOpenProgress: () => progress.toggle(),
  onOverlay: (mode) => view.city.setServiceMode(mode),
});

function startNewGame(): void {
  state.reset();
  refreshStats(state);
  saveGame(state);
  hud.hideGameOver();
  hud.update();
  state.toast('도로를 깔고 → 취수장·하수 배출구·풍력 터빈을 연결한 뒤 → 구역을 지정해 보세요!', 'info');
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
  onLockedSection: async (section) => {
    if (!isSectionAdjacent(state, section)) {
      state.toast('해금된 구획과 맞닿은 구획만 살 수 있습니다', 'bad');
      return;
    }
    const cost = sectionCost(state);
    if (!(await confirmDialog(ui, `이 구획(16×16칸)을 ₩${cost.toLocaleString('ko-KR')}에 해금할까요?`, '해금'))) return;
    const r = buySection(state, section);
    state.toast(r.message, r.ok ? 'good' : 'bad');
    hud.update();
  },
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat) progress.toggle();
});

state.on('reset', () => {
  view.city.resetAnimations();
  view.city.setServiceMode('none');
  toolbar.refresh();
  hud.update();
});
state.on('levelup', () => {
  toolbar.refresh();
  hud.update();
});

refreshStats(state);
if (loadGame(state)) {
  state.toast('📂 저장된 도시를 불러왔습니다', 'good');
} else {
  state.toast('도로를 깔고 → 취수장·하수 배출구·풍력 터빈을 연결한 뒤 → 구역을 지정해 보세요!', 'info');
}
hud.update();

// 자동 저장: 30초마다 + 탭을 닫거나 새로고침/숨길 때
const autosave = (): void => {
  if (!state.gameOver) saveGame(state);
};
window.addEventListener('beforeunload', autosave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') autosave();
});

if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = { state, view, tools, tick, applyAction };

// ── 시뮬레이션: 렌더링(rAF)과 분리 ──────────────────────
// 다른 탭/창을 보는 동안에는 rAF 가 멈추므로 타이머로 계속 진행하고,
// 브라우저가 타이머를 늦추더라도 실제 경과 시간만큼 틱을 따라잡는다.
const MAX_CATCHUP_SECONDS = 600;
const MAX_STEPS_PER_CALL = 600;
let lastSim = performance.now();
let simAcc = 0;
let autosaveTimer = 0;

function advance(): void {
  const now = performance.now();
  const elapsed = Math.max(0, Math.min(MAX_CATCHUP_SECONDS, (now - lastSim) / 1000));
  lastSim = now;

  if (state.speed > 0 && !state.gameOver) {
    simAcc += elapsed * state.speed;
    let steps = 0;
    while (simAcc >= 1 && steps < MAX_STEPS_PER_CALL && !state.gameOver) {
      tick(state);
      simAcc -= 1;
      steps++;
    }
    if (steps === MAX_STEPS_PER_CALL) simAcc = 0;
  }

  autosaveTimer += elapsed;
  if (autosaveTimer >= AUTOSAVE_SECONDS) {
    autosaveTimer = 0;
    autosave();
  }
}
setInterval(advance, 250);

let last = performance.now();
let infoTimer = 0;
let toolbarTimer = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  advance();

  infoTimer += dt;
  if (infoTimer > 0.25) {
    infoTimer = 0;
    info.render();
    hud.update();
  }
  toolbarTimer += dt;
  if (toolbarTimer > 1) {
    toolbarTimer = 0;
    toolbar.refresh();
  }

  input.update(dt);
  view.render(dt, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
