// Rendering: state -> DOM. Builds a top-down board and a persistent 3D die,
// then plays the ordered animation steps the engine produces. Swappable — the
// Godot port replaces this file while js/core stays identical.
//
// The die tumbles by pivoting about its LEADING BOTTOM EDGE (matching Unity's
// DieAnimator). A `.roller` element carries the per-step rotation while `.cube`
// inside holds the accumulated orientation; on landing we "bake" — snap to the
// new cell, fold the rotation into the cube, reset the roller. The die is
// exactly cell-pitch sized so the bake is seamless.
//
// CAMERA. The view angle lives on a separate `.camera` wrapper that sits
// between `.stage` and `.board`; `.board` itself is never rotated. Everything
// below `.board` — ROLL_ROT, SPIN_ROT, EDGE_ORIGIN, the `.face` transforms —
// is written in the BOARD's frame and is in exact lockstep with the pure
// permutations in js/core/dice.js, so leaving the board unrotated means the die
// maths stays valid at every camera angle without a single constant changing.
// Rotating `.board` (or "fixing up" any of those constants for the camera) is
// how you get a cube showing a 4 while the engine believes it is showing a 2.
//
// The camera is anchored on the DIE. Its transform is
//     translate(anchor) rotateX(tilt) rotateZ(yaw) translate(-diePos)
// so the die's cell centre is carried onto the rotation origin, turned there,
// and placed at `anchor` on screen: the die is the pivot, and SPACE swings the
// board around it rather than the other way about. See the framing notes below
// for where the anchor comes from and why a turn must never touch it.

import { TILE } from "../core/levels.js";
import { DEFAULT_FACES } from "../core/dice.js";
import { LEVELS } from "../data/levels.js";

const CELL = 86; // tile footprint AND die size (1:1, like the original)
const STEP = CELL;
const HALF = CELL / 2;

const DUR = { roll: 260, slide: 200, spin: 220, portal: 260 };
const ROLL_EASE = "cubic-bezier(0.4, 0.15, 0.35, 1)";
// The camera's own ease for a cell-to-cell pan. Softer at both ends than the
// roll's so the view glides while the cube snaps.
const PAN_EASE = "cubic-bezier(0.33, 0.06, 0.24, 1)";

// --- Camera ------------------------------------------------------------------
// Four stops, 90 degrees apart, on a base yaw of ZERO: the camera looks straight
// down a grid axis, so the board reads as a rectangle and the die shows exactly
// two faces — its top and the one facing the camera. Its east and west faces are
// edge-on, projecting to nothing, and the ONLY way to see them is to press SPACE
// and bring them round. That hidden information is the point of the view; it is
// deliberately not isometric, which is what a 45 degree yaw would make it (all
// three cube axes foreshortened equally, two side faces always in sight).
// The pitch (--tilt) never changes; only the yaw does.
const BASE_YAW = 0;
// SPACE swings the CAMERA a quarter turn clockwise around the board — which is
// the same thing as turning the board counter-clockwise under a fixed camera,
// hence the negative sign on the yaw the board is given. Flipping this to +90
// reverses the direction of the whole feature; main.js derives its input remap
// from this same constant, so the two cannot drift apart.
export const YAW_PER_TURN = -90;
// The perspective is mild on purpose: the projection is essentially an
// orthographic elevation, but a little convergence keeps the die reading as a
// solid rather than a flat arrangement of quads.
const PERSPECTIVE = 1900;
const MIN_FIT = 0.34;

// --- Framing -----------------------------------------------------------------
// The camera pivots on the die, which pins the die to one screen point and lets
// the board swing around it. That point — the ANCHOR — must not depend on the
// yaw: the instant it does, a turn drags the die across the screen and the
// pivot is no longer the die. So the only question framing gets to answer is
// where, as a function of the die's CELL, that point should be.
//
// It should be the centre of the frame, and the arithmetic is worth writing
// down because the obvious alternative is a trap. With the anchor fixed, the
// board's centre lands `M(yaw)*d` away from it, where d is the die's offset
// from the board's centre. Over the four stops M(yaw)*d takes four values
// spaced round a rhombus whose centre is the origin, so easing the anchor
// "toward the board's centre" — a direction that is itself different at every
// stop — buys one stop and pays for it double at the opposite one. Measured on
// a 7x7 with the die in the corner, easing the anchor all the way to the board
// leaves it perfectly framed at the stop you moved on and 730px off centre two
// SPACE presses later, against a flat 365px worst case for leaving the anchor
// where it is. Averaged over the four stops the board's centre IS the frame's
// centre; holding the anchor there is both the best it can do and the only
// choice that frames every stop alike, so a turn never springs a surprise.
//
// That leaves the board sliding around inside the frame as the die moves, and
// FRAME_ALLOW is how much of that slide the stage reserves room for: the whole
// board stays in frame while the die is within this many cells of the board's
// centre. It is a CLAMP, not the worst case. Reserving the full die-in-the-far-
// corner excursion of a 7x7 (4.2 cells) would shrink EVERY board by nearly half
// for the sake of four cells; past the allowance the board's far edge — the
// part furthest from the die, and the part the player is least interested in —
// slides out of frame instead, and it does so gradually: a cell past the
// allowance costs a cell of board. At two cells a 3x3 never loses anything, the
// four corner cells of a 5x5 cost a tenth of the board, and the extreme corner
// of a 7x7 — the worst cell on the biggest board there is — a fifth.
const FRAME_ALLOW = 2; // cells of board-slide the stage box reserves room for

// ...but only while it is affordable. The reserve is headroom for a situation
// that is not on screen yet, and it is paid for by shrinking the board in every
// situation that IS. On a narrow container (the note page iframes this at ~360px
// on a phone) the full reserve costs more than it is worth: it pushed the whole
// board off the right edge on move one. So the reserve is scaled back until it
// costs no more than this fraction of the zoom the board would get with no
// reserve at all — full headroom on a desktop, none on a phone, where the board
// is simply allowed to slide out of frame as the die wanders.
const RESERVE_FIT_KEEP = 0.8;

// Read a CSS custom property off an element as a number (deg/px/ms all parse).
function cssNum(el, name) {
  return parseFloat(getComputedStyle(el).getPropertyValue(name));
}

// Screen-clockwise order of the grid directions. main.js indexes this to turn a
// key press into a grid direction; it lives here because it is a property of
// how the camera lays the board out, not of the engine.
export const DIR_CLOCKWISE = Object.freeze(["up", "right", "down", "left"]);

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

function round1(n) { return Math.round(n * 10) / 10; }
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
    <div class="time" hidden></div>
    <div class="best" hidden></div>
    <div class="hint">WASD / arrows to roll · R to restart</div>
    <div class="hint">SPACE turns the view</div>
  `);
  root.appendChild(hud);

  const entries = [
    ...(opts.extraLevels || []),
    ...Object.keys(LEVELS).map((name) => ({ key: name, label: prettyLevel(name) })),
  ];
  const picker = el("div", "picker",
    entries.map(({ key, label }) => `<button data-level="${key}">${label}</button>`).join(""));
  root.appendChild(picker);

  // .stage (flat, holds the perspective) > .camera (view angle) > .board (grid).
  const stage = el("div", "stage");
  const camera = el("div", "camera");
  const board = el("div", "board");
  camera.appendChild(board);
  stage.appendChild(camera);
  root.appendChild(stage);
  sizeStage(stage, board, game);

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
  die.appendChild(el("div", "die-shadow")); // ground shadow, outside .roller so it never tumbles
  const roller = el("div", "roller");
  const cube = el("div", "cube");
  cube.innerHTML = FACE_HTML;
  const faces = [...cube.children];
  roller.appendChild(cube);
  die.appendChild(roller);
  board.appendChild(die);

  const banner = el("div", "banner",
    `<div class="card"><h2></h2><p></p><div class="actions" hidden></div></div>`);
  root.appendChild(banner);

  // Camera constants, read off the stylesheet so there is one source of truth
  // for the turn's timing (the counter-rotating tile labels share --cam-ms and
  // --cam-ease, and a JS copy of either would drift from them).
  const TURN_MS = cssNum(stage, "--cam-ms");
  const TURN_EASE = getComputedStyle(stage).getPropertyValue("--cam-ease").trim();

  const ctrl = {
    stage, camera, board, tileEls, die, roller, cube, banner, hud, picker,
    rot: "",                 // accumulated cube orientation string
    pos: { ...game.pos },
    wobbleTimer: null,       // pending wobble settle-back (see cancelWobble)
    camTurns: 0,             // quarter turns of the camera, unbounded (see setCamera)

    // Aim the camera at the die's cell: move the PIVOT, which is the die's cell
    // centre in board space measured from the board's centre. `ms` of 0 snaps.
    // The anchor is not touched — it is a per-level constant (see the framing
    // notes at the top of the file), which is precisely why a camera turn can
    // leave both translations alone and rotate about the die exactly.
    aimCamera(pos, ms = 0, ease = PAN_EASE) {
      const px = cellLeft(pos.c) + HALF - (game.width * STEP) / 2;
      const py = cellTop(pos.r) + HALF - (game.height * STEP) / 2;
      camera.style.transition = ms ? `transform ${ms}ms ${ease}` : "none";
      stage.style.setProperty("--die-px", `${round1(px)}px`);
      stage.style.setProperty("--die-py", `${round1(py)}px`);
      if (!ms) void camera.offsetWidth; // flush, so the next move animates from here
    },

    // Point the camera at quarter-turn `turns`. `turns` is deliberately NOT
    // wrapped to 0..3: driving --yaw from the running total means the fourth
    // press keeps going round instead of unwinding 270 degrees back to the
    // start. Nothing below .board is touched, so the die stays in sync with the
    // engine by construction.
    setCamera(turns, animate = true) {
      this.camTurns = turns;
      camera.style.transition = animate ? `transform ${TURN_MS}ms ${TURN_EASE}` : "none";
      // Killing the duration (rather than the transition shorthand) also stops
      // the counter-rotating tile labels, which share --cam-ms.
      if (!animate) stage.style.setProperty("--cam-ms", "0ms");
      // ONLY the yaw. The anchor and the pivot are left exactly as they are, so
      // the transform's two translations are identical either side of the turn
      // and the interpolation is a pure rotation about the die. Re-framing here
      // — however well justified by where the board ends up — would slide the
      // die across the screen and the pivot would no longer be the die.
      stage.style.setProperty("--yaw", `${BASE_YAW + YAW_PER_TURN * turns}deg`);
      if (!animate) {
        void stage.offsetWidth; // flush, so the restored duration can't animate this
        stage.style.removeProperty("--cam-ms");
      }
    },

    // Uniform zoom so the turned board still fits its container. A 45 degree
    // board is ~1.4x wider than a square-on one, and this thing is iframed into
    // a note page at whatever width the note is.
    fitToContainer() {
      const cs = getComputedStyle(root);
      const availW = root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const top = stage.getBoundingClientRect().top;
      const availH = Math.max(240, window.innerHeight - top - 16);

      // The box without any slide reserve, and the reserve sizeStage measured.
      const baseW = parseFloat(stage.style.getPropertyValue("--base-w"));
      const baseH = parseFloat(stage.style.getPropertyValue("--base-h"));
      const resW = parseFloat(stage.style.getPropertyValue("--reserve-w")) || 0;
      const resH = parseFloat(stage.style.getPropertyValue("--reserve-h")) || 0;

      // How much of the reserve this container can afford. The box grows
      // linearly with the reserve and the zoom is inversely proportional to the
      // box, so the largest affordable share solves directly — no search.
      const fit0 = Math.min(1, availW / baseW, availH / baseH);
      const floor = Math.max(MIN_FIT, RESERVE_FIT_KEEP * fit0);
      const room = (avail, base, res) => (res > 0 ? (avail / floor - base) / (2 * res) : 1);
      const share = Math.max(0, Math.min(1, room(availW, baseW, resW), room(availH, baseH, resH)));

      const w = Math.ceil(baseW + 2 * share * resW);
      const h = Math.ceil(baseH + 2 * share * resH);
      const fit = `${Math.round(Math.max(MIN_FIT, Math.min(1, availW / w, availH / h)) * 1000) / 1000}`;

      // No-ops when unchanged: this runs from a ResizeObserver on #app, and
      // #app's height follows the stage's, so writing unconditionally would loop.
      if (`${w}px` !== stage.style.getPropertyValue("--stage-w")) stage.style.setProperty("--stage-w", `${w}px`);
      if (`${h}px` !== stage.style.getPropertyValue("--stage-h")) stage.style.setProperty("--stage-h", `${h}px`);
      if (fit !== stage.style.getPropertyValue("--fit")) stage.style.setProperty("--fit", fit);
    },

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
      this.aimCamera(pos, 0);
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
      roller.style.transition = `transform ${DUR.roll}ms ${ROLL_EASE}`;
      roller.style.transform = EDGE_ROT[dir];
      // Pan with the roll, and pan to the CELL: the roller lifts the cube and
      // arcs it over its leading edge, and a camera tracking that would heave
      // the whole board up and down on every move. Starting the pan on the same
      // frame as the tumble is what makes the two read as one movement.
      this.aimCamera(to, DUR.roll);
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
      // Same duration AND easing as the die's own slide, so the die holds its
      // place in the frame and the board is what visibly moves.
      this.aimCamera(to, DUR.slide, "ease-in-out");
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
        // Snap the camera in the same invisible instant. A portal pair can span
        // the whole board, and gliding across it would be a long disorienting
        // swoop over ground the die never travelled.
        this.aimCamera(to, 0);
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
      // The pan has already landed on this cell; this only drops its transition
      // so the next step starts clean.
      this.aimCamera(to, 0);
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
    // `actions` is [{ label, onClick, primary }]. The banner's scrim is
    // pointer-events: none so the board stays clickable behind it, which also
    // means the card is the ONLY thing that can carry an affordance — without
    // one the win screen reads as a dead end, since every control behind it is
    // dimmed and blurred, the restart hint included.
    showBanner(title, sub, actions = []) {
      banner.querySelector("h2").textContent = title;
      banner.querySelector("p").textContent = sub;
      const row = banner.querySelector(".actions");
      row.innerHTML = "";
      for (const a of actions) {
        const b = el("button", a.primary ? "primary" : "", a.label);
        b.addEventListener("click", () => { b.blur(); a.onClick(); });
        row.appendChild(b);
      }
      row.hidden = actions.length === 0;
      banner.classList.add("show");
    },

    // Run clock. Deliberately separate from updateHud: the clock ticks several
    // times a second and the rest of the HUD only changes on a move.
    setTime(ms, show = true) {
      const t = hud.querySelector(".time");
      t.hidden = !show;
      if (show) t.textContent = formatTime(ms);
    },

    // "best 22 moves · 1:34" — the record to beat, or hidden if there isn't one.
    setBest(text) {
      const b = hud.querySelector(".best");
      b.hidden = !text;
      b.textContent = text || "";
    },
    hideBanner() { banner.classList.remove("show"); },
  };

  ctrl.updateHud(game);
  ctrl.setImmediate(game.pos, "");
  ctrl.fitToContainer();
  watchResize(root, ctrl);
  return ctrl;
}

// Size the stage to the board's PROJECTION and centre that projection in it.
//
// Rather than deriving the bounding box from the tilt/yaw/perspective by hand
// (easy to get subtly wrong, and wrong means a clipped board), this measures it:
// the browser is asked for the projected box of the board plane and of a probe
// plane one cube-height above it — together the shadow of the whole volume the
// die can ever occupy — and it does that at all FOUR stops and takes the union.
// A single box that already fits every stop is why the layout never resizes and
// the view never lurches as the camera turns.
//
// The camera's transform-origin is its own centre, which sits at the stage's
// centre, so every measurement is taken relative to that point; --cam-ax/ay —
// the anchor the die is held at — is then the offset that lands the measured
// box dead centre. The box is finally grown by the room the die-anchored camera
// needs to slide the board around in; see FRAME_ALLOW.
const PAD = 8;
function sizeStage(stage, board, game) {
  const bw = game.width * STEP;
  const bh = game.height * STEP;
  stage.style.setProperty("--board-w", `${bw}px`);
  stage.style.setProperty("--board-h", `${bh}px`);
  stage.style.setProperty("--persp", `${PERSPECTIVE}px`);
  stage.style.setProperty("--fit", "1");
  // Measure with the camera parked on the board's centre and no anchor offset,
  // i.e. the plain rotateX/rotateZ view the box is defined against.
  stage.style.setProperty("--die-px", "0px");
  stage.style.setProperty("--die-py", "0px");
  stage.style.setProperty("--cam-ax", "0px");
  stage.style.setProperty("--cam-ay", "0px");

  // A plane one cube-height above the board: the ceiling of the die's reach.
  const probe = el("div", "probe");
  probe.style.cssText =
    `position:absolute;left:0;top:0;width:${bw}px;height:${bh}px;` +
    `transform:translateZ(${CELL}px);visibility:hidden;`;
  board.appendChild(probe);

  const savedYaw = stage.style.getPropertyValue("--yaw");
  stage.style.setProperty("--cam-ms", "0ms"); // measure, don't animate
  let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
  for (let k = 0; k < 4; k++) {
    stage.style.setProperty("--yaw", `${BASE_YAW + 90 * k}deg`);
    const s = stage.getBoundingClientRect();
    const cx = s.left + s.width / 2;   // == the camera's transform origin
    const cy = s.top + s.height / 2;
    for (const el of [board, probe]) {
      const q = el.getBoundingClientRect(); // projected box, ancestors included
      l = Math.min(l, q.left - cx); r = Math.max(r, q.right - cx);
      t = Math.min(t, q.top - cy);  b = Math.max(b, q.bottom - cy);
    }
  }
  probe.remove();
  if (savedYaw) stage.style.setProperty("--yaw", savedYaw);
  else stage.style.removeProperty("--yaw");

  // ...then reserve room for the board to slide about inside that box, because
  // the camera holds the die still and lets the board move. The board's centre
  // sits M(yaw) * d from the frame's, d being the die's offset from the board's
  // centre; over every cell and every stop that traces an ellipse of semi-axes
  // (|d|, |d| cos tilt), so the reservation is symmetric on each side and
  // flattened vertically by the pitch. FRAME_ALLOW clamps |d|: the full reach
  // of a 7x7 would shrink every 7x7 board by nearly half for the sake of its
  // corner cells, so past the allowance the board's far edge leaves the frame
  // instead. Small boards never reach the clamp and always fit whole.
  const cosTilt = Math.cos((cssNum(stage, "--tilt") * Math.PI) / 180);
  const reach = Math.hypot(bw / 2 - HALF, bh / 2 - HALF) / CELL; // cells to the corner cell
  const slack = Math.min(reach, FRAME_ALLOW) * CELL;

  // Published separately so fitToContainer can decide how much of the reserve
  // the container can actually afford (see RESERVE_FIT_KEEP). The anchor below
  // is measured from the box alone and does not move with the reserve — the
  // reserve is symmetric on both sides — so trimming it only ever changes how
  // much empty room surrounds the board, never where the die sits.
  stage.style.setProperty("--base-w", `${Math.ceil(r - l) + PAD}px`);
  stage.style.setProperty("--base-h", `${Math.ceil(b - t) + PAD}px`);
  stage.style.setProperty("--reserve-w", `${Math.round(slack)}px`);
  stage.style.setProperty("--reserve-h", `${Math.round(slack * cosTilt)}px`);
  stage.style.setProperty("--stage-w", `${Math.ceil(r - l + 2 * slack) + PAD}px`);
  stage.style.setProperty("--stage-h", `${Math.ceil(b - t + 2 * slack * cosTilt) + PAD}px`);
  // The anchor. Aiming the camera here puts the measured box dead centre, so a
  // die standing on the board's centre sits in the middle of the picture and
  // the framing matches the old board-centred camera exactly.
  stage.style.setProperty("--cam-ax", `${Math.round(-(l + r) / 2)}px`);
  stage.style.setProperty("--cam-ay", `${Math.round(-(t + b) / 2)}px`);
  void stage.offsetWidth;
  stage.style.removeProperty("--cam-ms");
}

// One observer for the life of the page. renderScene wipes and rebuilds root on
// every level change, so the listener tracks whichever controller is current
// instead of stacking up a new observer per level.
let liveCtrl = null;
let resizeWatched = false;
function watchResize(root, ctrl) {
  liveCtrl = ctrl;
  if (resizeWatched) return;
  resizeWatched = true;
  const refit = () => { if (liveCtrl) liveCtrl.fitToContainer(); };
  window.addEventListener("resize", refit);
  if (typeof ResizeObserver === "function") new ResizeObserver(refit).observe(root);
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

// m:ss — the scale a puzzle run lives on.
export function formatTime(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function prettyLevel(name) {
  if (name.startsWith("debug_")) return `Debug ${name.slice(6)}`;
  const rest = name.replace(/^level_/, "");
  if (/^\d+$/.test(rest)) return `Level ${rest}`;
  return rest.charAt(0).toUpperCase() + rest.slice(1); // e.g. "conveyor" -> "Conveyor"
}
