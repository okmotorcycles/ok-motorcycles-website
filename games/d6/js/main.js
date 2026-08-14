// Bootstrap: owns UI state, maps intents to engine moves, plays the animation
// steps the engine returns, and drives level flow. All rules live in js/core.

import { CONFIG, advanceLevel } from "./core/state.js";
import { createGame, tryMove } from "./core/engine.js";
import { renderScene } from "./ui/render.js";
import { LEVELS } from "./data/levels.js";

const root = document.getElementById("app");
const LEVEL_NAMES = Object.keys(LEVELS);

const KEY_DIR = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
};

let game = createGame(CONFIG.startLevel);
let scene = renderScene(root, game);
let busy = false;

// Load a level fresh (default die orientation).
function loadLevel(name) {
  game = createGame(name);
  scene = renderScene(root, game);
  busy = false;
}

function restart() {
  loadLevel(CONFIG.startLevel);
}

// Advance to the chained level, carrying the die's current orientation across.
function nextLevel() {
  const carriedRot = scene.rot;
  game = advanceLevel(game);
  scene = renderScene(root, game);
  scene.setImmediate(game.pos, carriedRot);
  busy = false;
}

function handleMove(dir) {
  if (busy || game.won) return;

  const res = tryMove(game, dir);
  if (!res.moved) {
    scene.wobble(dir);
    return;
  }

  // Play the roll and any follow-ups (conveyor slides, spins, portals) the
  // engine chained, reflecting tile/task/goal changes after each step.
  busy = true;
  scene.playSteps(
    res.steps,
    () => { scene.refreshTiles(game); scene.updateHud(game); },
    () => {
      busy = false;
      if (res.won) {
        scene.showBanner("LEVEL CLEAR", "next level loading…");
        setTimeout(() => { scene.hideBanner(); nextLevel(); }, 1100);
      }
    }
  );
}

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyR") { restart(); return; }
  // Number keys jump straight to a level (handy for trying the action tiles).
  if (/^Digit[1-9]$/.test(e.code)) {
    const idx = Number(e.code.slice(5)) - 1;
    if (idx < LEVEL_NAMES.length) loadLevel(LEVEL_NAMES[idx]);
    return;
  }
  const dir = KEY_DIR[e.code];
  if (!dir) return;
  e.preventDefault();
  handleMove(dir);
});

// Level picker buttons.
root.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-level]");
  if (btn) loadLevel(btn.dataset.level);
});
