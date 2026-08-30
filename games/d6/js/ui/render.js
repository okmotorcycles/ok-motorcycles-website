// Rendering: state -> DOM. Builds a top-down board and a persistent 3D die,
// then plays the ordered animation steps the engine produces. Swappable — the
// Godot port replaces this file while js/core stays identical.
//
// The die tumbles by pivoting about its LEADING BOTTOM EDGE (matching Unity's
// DieAnimator). A `.roller` element carries the per-step rotation while `.cube`
// inside holds the accumulated orientation; on landing we "bake" — snap to the
// new cell, fold the rotation into the cube, reset the roller. The die is
// exactly cell-pitch sized so the bake is seamless.

import { TILE } from "../core/levels.js";
import { DEFAULT_FACES } from "../core/dice.js";
import { LEVELS } from "../data/levels.js";

const CELL = 86; // tile footprint AND die size (1:1, like the original)
const STEP = CELL;
const HALF = CELL / 2;

const DUR = { roll: 260, slide: 200, spin: 220, portal: 260 };

// Accumulated orientation deltas, prepended per step (applied in the board frame
// so the visible faces stay in lockstep with the core die permutations).
const ROLL_ROT = {
  up: "rotateX(90deg)",
  down: "rotateX(-90deg)",
  right: "rotateY(90deg)",
  left: "rotateY(-90deg)",
};
// Board-local +Z points up out of the board, so a spin about Z is the vertical
// axis. spinFaces(cw) moves the FRONT face to the RIGHT (-Y -> +X), which is
// rotateZ(90deg) in this frame; ccw is the inverse. Keep these in lockstep with
// dice.js — a sign flip here silently desyncs the visible cube from the engine.
const SPIN_ROT = { cw: "rotateZ(90deg)", ccw: "rotateZ(-90deg)" };

// 90° edge-pivot rotation + the leading-bottom-edge origin, per roll direction.
const EDGE_ROT = ROLL_ROT;
const EDGE_ORIGIN = {
  up: `${HALF}px 0px ${-HALF}px`,
  down: `${HALF}px ${CELL}px ${-HALF}px`,
  right: `${CELL}px ${HALF}px ${-HALF}px`,
  left: `0px ${HALF}px ${-HALF}px`,
};
const WOBBLE_ROT = {
  up: "rotateX(15deg)", down: "rotateX(-15deg)",
  right: "rotateY(15deg)", left: "rotateY(-15deg)",
};

const ARROW = { up: "↑", down: "↓", left: "←", right: "→" };

// Which 3x3 cells hold pips for each die value (classic die layout).
const PIP_LAYOUT = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
};

function pips(value, cls = "pip") {
  return (PIP_LAYOUT[value] || []).map((n) => `<span class="${cls} p${n}"></span>`).join("");
}

function cellLeft(c) { return c * STEP; }
function cellTop(r) { return r * STEP; }

// Build the whole scene into root and return a controller for live updates.
// `opts.extraLevels` prepends buttons to the level picker for levels that don't
// live in LEVELS — the generated daily puzzle, which arrives over the network.
export function renderScene(root, game, opts = {}) {
  root.innerHTML = "";

  const hud = el("div", "hud", `
    <div class="title">D<span>6</span></div>
    <div class="level"></div>
    <div class="tasks"></div>
    <div class="moves"></div>
    <div class="hint">WASD / arrows to roll · R to restart</div>
  `);
  root.appendChild(hud);

  const entries = [
    ...(opts.extraLevels || []),
    ...Object.keys(LEVELS).map((name) => ({ key: name, label: prettyLevel(name) })),
  ];
  const picker = el("div", "picker",
    entries.map(({ key, label }) => `<button data-level="${key}">${label}</button>`).join(""));
  root.appendChild(picker);

  const stage = el("div", "stage");
  const board = el("div", "board");
  board.style.width = `${game.width * STEP}px`;
  board.style.height = `${game.height * STEP}px`;
  stage.appendChild(board);
  root.appendChild(stage);

  // Tiles (with a staggered enter animation).
  const tileEls = [];
  for (let r = 0; r < game.height; r++) {
    tileEls.push([]);
    for (let c = 0; c < game.width; c++) {
      const te = el("div", "tile");
      te.style.left = `${cellLeft(c)}px`;
      te.style.top = `${cellTop(r)}px`;
      applyTileLook(te, game.tiles[r][c], game);
      if (game.tiles[r][c]) {
        te.classList.add("enter");
        te.style.animationDelay = `${(r * game.width + c) * 12}ms`;
      }
      board.appendChild(te);
      tileEls[r].push(te);
    }
  }

  // Die: .die (positioned at cell) > .roller (per-step pivot) > .cube (orientation).
  const die = el("div", "die");
  const roller = el("div", "roller");
  const cube = el("div", "cube");
  cube.innerHTML = FACE_HTML;
  const faces = [...cube.children];
  roller.appendChild(cube);
  die.appendChild(roller);
  board.appendChild(die);

  const banner = el("div", "banner", `<div class="card"><h2></h2><p></p></div>`);
  root.appendChild(banner);

  const ctrl = {
    board, tileEls, die, roller, cube, banner, hud, picker,
    rot: "",                 // accumulated cube orientation string
    pos: { ...game.pos },
    wobbleTimer: null,       // pending wobble settle-back (see cancelWobble)

    // Place the die at a cell/orientation with no animation (load, restart, carry).
    setImmediate(pos, rot) {
      this.cancelWobble();
      this.pos = { ...pos };
      this.rot = rot;
      this.setAlpha(1, 0);
      roller.style.transition = "none";
      roller.style.transform = "none";
      die.style.transition = "none";
      die.style.left = `${cellLeft(pos.c)}px`;
      die.style.top = `${cellTop(pos.r)}px`;
      cube.style.transform = rot || "rotateX(0deg)";
    },

    // Play an ordered list of engine steps, calling onSettle after each and
    // onDone at the end.
    playSteps(steps, onSettle, onDone) {
      let i = 0;
      const next = () => {
        if (i >= steps.length) { if (onDone) onDone(); return; }
        const s = steps[i++];
        const after = () => { if (onSettle) onSettle(); next(); };
        if (s.type === "roll") this.rollStep(s.dir, s.to, after);
        else if (s.type === "slide") this.slideStep(s.to, after);
        else if (s.type === "spin") this.spinStep(s.ccw, after);
        else if (s.type === "portal") this.portalStep(s.to, after);
        else after();
      };
      next();
    },

    // Roll: tumble over the leading edge, then bake the rotation into the cube.
    rollStep(dir, to, done) {
      this.cancelWobble();
      roller.style.transition = "none";
      roller.style.transform = "none";
      roller.style.transformOrigin = EDGE_ORIGIN[dir];
      void roller.offsetWidth;
      roller.style.transition = `transform ${DUR.roll}ms cubic-bezier(0.4, 0.15, 0.35, 1)`;
      roller.style.transform = EDGE_ROT[dir];
      setTimeout(() => {
        this.rot = `${ROLL_ROT[dir]} ${this.rot}`.trim();
        this.bakeRoller(to);
        done();
      }, DUR.roll + 15);
    },

    // Conveyor slide: pure translation, faces unchanged.
    slideStep(to, done) {
      die.style.transition = `left ${DUR.slide}ms ease-in-out, top ${DUR.slide}ms ease-in-out`;
      void die.offsetWidth;
      die.style.left = `${cellLeft(to.c)}px`;
      die.style.top = `${cellTop(to.r)}px`;
      setTimeout(() => {
        die.style.transition = "none";
        this.pos = { ...to };
        done();
      }, DUR.slide + 15);
    },

    // Spin: 90° about the vertical axis in place, then bake into the cube.
    spinStep(ccw, done) {
      this.cancelWobble();
      const rotStr = ccw ? SPIN_ROT.ccw : SPIN_ROT.cw;
      roller.style.transition = "none";
      roller.style.transform = "none";
      roller.style.transformOrigin = "50% 50%";
      void roller.offsetWidth;
      roller.style.transition = `transform ${DUR.spin}ms ease-in-out`;
      roller.style.transform = rotStr;
      setTimeout(() => {
        this.rot = `${rotStr} ${this.rot}`.trim();
        this.bakeRoller(this.pos);
        done();
      }, DUR.spin + 15);
    },

    // Die alpha, applied to the six .face elements — NEVER to .die/.roller/.cube.
    // Per CSS Transforms, opacity < 1 is a "grouping" property: it forces
    // transform-style: flat on the element it sits on, so putting it on any 3D
    // ancestor collapses the whole cube into the board plane for the length of
    // the fade. Under the board's rotateX tilt that reads as the die being
    // squashed vertically for a frame — which is exactly what the old portal
    // fade did. The faces have no 3D children of their own, so fading them
    // individually is free of that, and looks identical: backface-visibility
    // hides the rear faces and the visible ones tile the silhouette without
    // overlapping, so there is no double-blending seam mid-fade.
    setAlpha(a, ms, ease = "linear") {
      for (const f of faces) {
        f.style.transition = ms ? `opacity ${ms}ms ${ease}` : "none";
        f.style.opacity = `${a}`;
      }
    },

    // Portal: fade out, teleport, fade in. Orientation/faces unchanged, and the
    // cube keeps its full 3D shape the whole way through.
    portalStep(to, done) {
      const half = DUR.portal / 2;
      this.setAlpha(0, half, "ease-in");
      setTimeout(() => {
        // Invisible at this point: snap to the far portal with no transition.
        die.style.transition = "none";
        die.style.left = `${cellLeft(to.c)}px`;
        die.style.top = `${cellTop(to.r)}px`;
        this.pos = { ...to };
        void die.offsetWidth;
        this.setAlpha(1, half, "ease-out");
        setTimeout(() => {
          this.setAlpha(1, 0); // drop the transition so later steps start clean
          done();
        }, half + 15);
      }, half + 15);
    },

    // Snap die to a cell and fold the roller rotation into the cube. The
    // composite is identical so nothing visibly jumps.
    bakeRoller(to) {
      roller.style.transition = "none";
      roller.style.transform = "none";
      die.style.transition = "none";
      die.style.left = `${cellLeft(to.c)}px`;
      die.style.top = `${cellTop(to.r)}px`;
      cube.style.transform = this.rot || "rotateX(0deg)";
      this.pos = { ...to };
      void roller.offsetWidth;
    },

    // Blocked move: tip toward the edge and settle back. A wobble does NOT set
    // `busy`, so the player can (and constantly does) start a real roll before it
    // finishes — bump a wall, then immediately go the right way. The settle-back
    // is therefore cancellable: left pending it would fire mid-roll and snap the
    // roller back to none, so the die would jump a cell without ever visibly
    // tumbling and the player would lose track of which face is where.
    wobble(dir) {
      this.cancelWobble();
      roller.style.transition = "none";
      roller.style.transform = "none";
      roller.style.transformOrigin = EDGE_ORIGIN[dir] || "50% 50%";
      void roller.offsetWidth;
      roller.style.transition = "transform 0.16s ease-out";
      roller.style.transform = WOBBLE_ROT[dir] || "none";
      this.wobbleTimer = setTimeout(() => {
        this.wobbleTimer = null;
        roller.style.transition = "transform 0.24s ease-in";
        roller.style.transform = "none";
      }, 160);
    },

    // Drop a pending settle-back so it can't stomp on whatever runs next.
    cancelWobble() {
      if (this.wobbleTimer !== null) {
        clearTimeout(this.wobbleTimer);
        this.wobbleTimer = null;
      }
    },

    refreshTiles(g) {
      for (let r = 0; r < g.height; r++) {
        for (let c = 0; c < g.width; c++) applyTileLook(this.tileEls[r][c], g.tiles[r][c], g);
      }
    },
    updateHud(g) {
      hud.querySelector(".level").textContent = g.displayName || prettyLevel(g.levelName);
      hud.querySelector(".moves").textContent = `moves ${g.moveCount}`;
      const tasksEl = hud.querySelector(".tasks");
      if (g.totalTasks === 0) {
        tasksEl.textContent = "no tasks — reach the goal";
        tasksEl.classList.add("done");
      } else {
        tasksEl.textContent = `tasks ${g.completedTasks}/${g.totalTasks}`;
        tasksEl.classList.toggle("done", g.allTasksCompleted);
      }
      picker.querySelectorAll("button").forEach((b) =>
        b.classList.toggle("current", b.dataset.level === g.levelName));
    },
    showBanner(title, sub) {
      banner.querySelector("h2").textContent = title;
      banner.querySelector("p").textContent = sub;
      banner.classList.add("show");
    },
    hideBanner() { banner.classList.remove("show"); },
  };

  ctrl.updateHud(game);
  ctrl.setImmediate(game.pos, "");
  return ctrl;
}

function applyTileLook(te, tile, game) {
  te.className = "tile";
  te.innerHTML = "";
  if (!tile) { te.classList.add("empty"); return; }

  switch (tile.type) {
    case TILE.START:
      te.classList.add("start");
      break;
    case TILE.GOAL:
      te.classList.add("goal");
      if (game.allTasksCompleted) te.classList.add("live");
      break;
    case TILE.TOP_TASK:
    case TILE.BOTTOM_TASK: {
      te.classList.add("task");
      if (tile.cleared) te.classList.add("cleared");
      const label = tile.type === TILE.TOP_TASK ? "TOP" : "BTM";
      te.innerHTML = `<div class="req"><span class="badge">${label}</span>
        <div class="mini-die">${pips(tile.requirement, "pip")}</div></div>`;
      break;
    }
    case TILE.MOVE:
      te.classList.add("move");
      te.innerHTML = `<span class="glyph arrow">${ARROW[tile.moveDir]}</span>`;
      break;
    case TILE.SPIN:
      te.classList.add("spin");
      te.innerHTML = `<span class="glyph">${tile.ccw ? "↺" : "↻"}</span>`;
      break;
    case TILE.PORTAL:
      te.classList.add("portal", `portal-${tile.portalId % 2 === 0 ? "a" : "b"}`);
      te.innerHTML = `<span class="portal-mark"><i></i><b>${tile.portalId}</b></span>`;
      break;
    default:
      break; // floor
  }
}

// Cube skeleton: each face painted with its DEFAULT_FACES pip. The accumulated
// rotation carries these into place, in lockstep with the core permutations.
const FACE_HTML = ["top", "bottom", "left", "right", "front", "back"]
  .map((side) => `<div class="face ${side}">${pips(DEFAULT_FACES[side])}</div>`).join("");

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function prettyLevel(name) {
  if (name.startsWith("debug_")) return `Debug ${name.slice(6)}`;
  const rest = name.replace(/^level_/, "");
  if (/^\d+$/.test(rest)) return `Level ${rest}`;
  return rest.charAt(0).toUpperCase() + rest.slice(1); // e.g. "conveyor" -> "Conveyor"
}
