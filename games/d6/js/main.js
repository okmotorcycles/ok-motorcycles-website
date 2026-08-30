// Bootstrap: owns UI state, maps intents to engine moves, plays the animation
// steps the engine returns, and drives level flow. All rules live in js/core.

import { CONFIG, advanceLevel } from "./core/state.js";
import { createGame, createGameFromText, tryMove } from "./core/engine.js";
import { renderScene, formatTime, DIR_CLOCKWISE, YAW_PER_TURN } from "./ui/render.js";
import { LEVELS } from "./data/levels.js";

const root = document.getElementById("app");

// The daily puzzle. tools/gen-daily.mjs generates a fresh solvable board every
// morning and a GitHub Action commits it as daily.json next to this file; the
// game just fetches it. It is deliberately a soft dependency — if the file is
// missing, stale or unreachable, the hand-made campaign loads instead and
// nothing about the game breaks.
const DAILY = "daily";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
let daily = null;

async function fetchDaily() {
  try {
    const res = await fetch("daily.json", { cache: "no-cache" });
    if (!res.ok) return null;
    const d = await res.json();
    return d && typeof d.text === "string" && d.text.length ? d : null;
  } catch {
    return null; // offline, file not deployed yet, whatever — fall back quietly
  }
}

// "2026-08-31" -> "Aug 31", split by hand rather than via Date so the label
// can't shift a day depending on the viewer's timezone.
function dailyLabel(iso) {
  const [, m, d] = String(iso || "").split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${d}` : "today";
}

// ---- Daily results ----------------------------------------------------------
// Solving today's puzzle is remembered across reloads, so the page can offer a
// retry against your own record instead of quietly forgetting you ever played.
// Best moves and best time are tracked separately — they are different runs to
// chase, and a 22-move crawl and a sloppy sprint are both worth beating.
// Everything here degrades to "no records" if storage is unavailable (private
// windows throw on access), because none of it may break the game.
const STORE_KEY = "d6.daily.results";
const KEEP_DAYS = 60;

function loadResults() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function recordSolve(date, moves, ms) {
  const all = loadResults();
  const prev = all[date];
  const result = {
    moves: Math.min(prev?.moves ?? Infinity, moves),
    ms: Math.min(prev?.ms ?? Infinity, ms),
    solves: (prev?.solves ?? 0) + 1,
  };
  const beatMoves = prev != null && moves < prev.moves;
  const beatTime = prev != null && ms < prev.ms;
  all[date] = result;
  // Keep the map from growing forever; dates sort lexically as ISO strings.
  const trimmed = {};
  for (const k of Object.keys(all).sort().slice(-KEEP_DAYS)) trimmed[k] = all[k];
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
  } catch {
    /* storage full or blocked — the run still counts for this session */
  }
  return { result, first: prev == null, beatMoves, beatTime };
}

const bestFor = (date) => loadResults()[date] || null;
const bestLabel = (b) => (b ? `best ${b.moves} moves \u00b7 ${formatTime(b.ms)}` : "");

// ---- Run clock --------------------------------------------------------------
// Starts on the first move that actually moves the die, not on load: staring at
// a fresh board working out the route is thinking time, not run time.
let clockFrom = null;
let clockMs = 0;
let clockTimer = null;

function clockElapsed() {
  return clockFrom == null ? 0 : clockTimer ? performance.now() - clockFrom : clockMs;
}
function clockStart() {
  if (clockFrom != null) return;
  clockFrom = performance.now();
  clockTimer = setInterval(() => scene && scene.setTime(clockElapsed()), 250);
}
function clockStop() {
  if (clockFrom != null && clockTimer) clockMs = performance.now() - clockFrom;
  clearInterval(clockTimer);
  clockTimer = null;
}
function clockReset() {
  clearInterval(clockTimer);
  clockTimer = null;
  clockFrom = null;
  clockMs = 0;
}

const sceneOpts = () => ({ extraLevels: daily ? [{ key: DAILY, label: "Daily" }] : [] });
const levelNames = () => [...(daily ? [DAILY] : []), ...Object.keys(LEVELS)];

const KEY_DIR = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
};

// ---- Input frame -------------------------------------------------------------
// TRUE  = camera-relative: a key means a SCREEN direction, so "up" always rolls
//         the die away from the viewer no matter which way the camera faces.
//         This is what games with a rotatable camera do, and it is the default.
// FALSE = board-fixed: a key always means the same grid direction, so after a
//         quarter turn "up" rolls sideways on screen.
// Either way the ENGINE only ever sees a plain grid direction — the rotation is
// applied here, before tryMove, so js/core stays camera-unaware.
const CAMERA_RELATIVE_INPUT = true;

// Nothing is rendered until the daily puzzle fetch settles (see the boot at the
// bottom), so both of these stay null for the first tick.
let game = null;
let scene = null;
let busy = false;
// Quarter turns of the camera, counted up forever so the transition always
// continues the same way round; only its value mod 4 matters for input.
let camTurns = 0;

// Rotate a screen-space key direction into the grid direction that currently
// points that way on screen. DIR_CLOCKWISE is the screen-clockwise order of the
// grid directions at stop 0; each quarter turn of the camera advances a key's
// meaning by one place along it. TURN_STEP is read off the camera's own yaw
// constant (+1 for a clockwise camera), so reversing the camera direction in
// render.js reverses the remap with it rather than silently inverting the keys.
const TURN_STEP = -YAW_PER_TURN / 90;
function toGridDir(keyDir) {
  if (!CAMERA_RELATIVE_INPUT) return keyDir;
  const i = DIR_CLOCKWISE.indexOf(keyDir);
  return DIR_CLOCKWISE[(((i + TURN_STEP * camTurns) % 4) + 4) % 4];
}

function rotateCamera() {
  camTurns += 1;
  scene.setCamera(camTurns);
}

// Load a level fresh (default die orientation).
function loadLevel(name) {
  if (name === DAILY && daily) {
    game = createGameFromText(daily.text, null, DAILY);
    game.displayName = `Daily \u00b7 ${dailyLabel(daily.date)}`;
  } else {
    game = createGame(name);
  }
  scene = renderScene(root, game, sceneOpts());
  // Pins the view rather than trusting the CSS default, and carries the
  // player's chosen angle across a level change.
  scene.setCamera(camTurns, false);
  clockReset();
  if (name === DAILY && daily) {
    scene.setTime(0, true);
    scene.setBest(bestLabel(bestFor(daily.date)));
  }
  busy = false;
}

// R reloads whatever you're on, rather than jumping back to the campaign start
// — otherwise restarting the daily throws you out of it.
function restart() {
  loadLevel(game ? game.levelName : CONFIG.startLevel);
}

// Advance to the chained level, carrying the die's current orientation across.
function nextLevel() {
  const carriedRot = scene.rot;
  game = advanceLevel(game);
  scene = renderScene(root, game, sceneOpts());
  scene.setCamera(camTurns, false);
  scene.setImmediate(game.pos, carriedRot);
  busy = false;
}

function handleMove(keyDir) {
  if (busy || !game || game.won) return;
  const timed = game.levelName === DAILY;

  const dir = toGridDir(keyDir); // screen -> grid; the engine only sees grid
  const res = tryMove(game, dir);
  if (!res.moved) {
    scene.wobble(dir);
    return;
  }
  if (timed) clockStart();

  // Play the roll and any follow-ups (conveyor slides, spins, portals) the
  // engine chained, reflecting tile/task/goal changes after each step.
  busy = true;
  scene.playSteps(
    res.steps,
    () => { scene.refreshTiles(game); scene.updateHud(game); },
    () => {
      busy = false;
      if (!res.won) return;
      // The daily is a one-off, not a rung on the campaign ladder: it has no
      // level to chain to, so stop here instead of dumping the player into
      // level_0 the moment they finish it.
      if (game.levelName === DAILY) {
        clockStop();
        const ms = clockElapsed();
        scene.setTime(ms);
        const { result, first, beatMoves, beatTime } = recordSolve(daily.date, game.moveCount, ms);
        scene.setBest(bestLabel(result));
        const run = `${game.moveCount} moves \u00b7 ${formatTime(ms)}`;
        let note;
        if (first) note = `${run} — your first solve today`;
        else if (beatMoves && beatTime) note = `${run} — a new best on both`;
        else if (beatMoves) note = `${run} — fewest moves yet`;
        else if (beatTime) note = `${run} — fastest yet`;
        else note = `${run} — ${bestLabel(result)}`;
        scene.showBanner("SOLVED", note, [
          { label: "Retry", primary: true, onClick: () => { scene.hideBanner(); loadLevel(DAILY); } },
          { label: "Close", onClick: () => scene.hideBanner() },
        ]);
        return;
      }
      scene.showBanner("LEVEL CLEAR", "next level loading…");
      setTimeout(() => { scene.hideBanner(); nextLevel(); }, 1100);
    }
  );
}

window.addEventListener("keydown", (e) => {
  if (!scene) return; // still fetching the daily puzzle
  // SPACE turns the camera. preventDefault first: Space scrolls the page by
  // default, and would also re-fire whichever level button was last clicked.
  if (e.code === "Space") { e.preventDefault(); rotateCamera(); return; }
  if (e.code === "KeyR") { restart(); return; }
  // Number keys jump straight to a level (handy for trying the action tiles).
  if (/^Digit[1-9]$/.test(e.code)) {
    const idx = Number(e.code.slice(5)) - 1;
    const names = levelNames();
    if (idx < names.length) loadLevel(names[idx]);
    return;
  }
  const dir = KEY_DIR[e.code];
  if (!dir) return;
  e.preventDefault();
  handleMove(dir);
});

// Test hook. The one bug this project has already shipped is the visible cube
// drifting out of step with the engine, so a headless run needs to be able to
// resolve each .face element's composite matrix and compare the face that
// points board-up against game.die.top. Read-only accessors; nothing in the
// game reads them back.
window.__d6 = {
  get game() { return game; },
  get scene() { return scene; },
  get camTurns() { return camTurns; },
  get cameraRelativeInput() { return CAMERA_RELATIVE_INPUT; },
};

// Level picker buttons.
root.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-level]");
  if (btn) { btn.blur(); loadLevel(btn.dataset.level); }
});

// Boot. Waiting on the fetch before the first render avoids showing the
// campaign for a frame and then swapping the board out from under the player.
(async () => {
  daily = await fetchDaily();
  loadLevel(daily ? DAILY : CONFIG.startLevel);
})();
