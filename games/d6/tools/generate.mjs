// Daily puzzle generator.
//
// Shape of the algorithm, and why it is this shape:
//
// Task tiles never affect movement. They don't block, they don't touch the die
// — they only latch a flag that gates the goal. So the reachable graph over
// (cell, orientation) is IDENTICAL no matter what face values the tasks demand.
// That inverts the usual generate-and-pray loop: instead of guessing
// requirements and throwing away the ~95% that turn out impossible, we lay out
// the board first, ask the solver which faces can actually be shown on each
// task cell and at what cost, and then choose requirements from that set —
// biased toward the expensive ones, which is exactly where the detours (and the
// puzzle) come from.
//
// Everything after that is filtering. "Solvable" is a low bar; most solvable
// grids are boring. A candidate has to survive:
//   - par inside the day's band
//   - face pressure: par / (par if the die had no faces) — the fraction of the
//     difficulty that is actually about die orientation rather than walking
//   - every special tile load-bearing (delete it; par must change)
//   - every task load-bearing (delete it; par must drop — otherwise it was
//     being cleared incidentally on the way past)
//   - not too many equally-optimal routes, or the solution reads as mush
// and then the best-scoring survivor of a few hundred candidates ships.

import { makeRng, hashString } from "./rng.mjs";
import {
  solveText, freeParText, reachableOrientations, faceCosts, verifySolution,
} from "./solver.mjs";

// Difficulty ramps across the week: Monday is a quick coffee puzzle, Sunday is
// the one you put down and come back to. getUTCDay() indexes this (0 = Sunday).
export const TIERS = {
  1: { day: "Monday",    w: 5, h: 5, fill: [0.62, 0.84], tasks: [1, 1], palette: [],                              specials: [0, 0], par: [6, 12],  pressure: 1.25, maxRoutes: 40 },
  2: { day: "Tuesday",   w: 5, h: 5, fill: [0.60, 0.84], tasks: [2, 2], palette: [],                              specials: [0, 0], par: [9, 16],  pressure: 1.30, maxRoutes: 32 },
  3: { day: "Wednesday", w: 6, h: 6, fill: [0.52, 0.78], tasks: [2, 2], palette: ["conveyor"],                    specials: [1, 1], par: [10, 18], pressure: 1.30, maxRoutes: 32 },
  4: { day: "Thursday",  w: 6, h: 6, fill: [0.52, 0.78], tasks: [2, 2], palette: ["spin", "portal"],              specials: [1, 1], par: [12, 20], pressure: 1.35, maxRoutes: 24 },
  5: { day: "Friday",    w: 6, h: 6, fill: [0.52, 0.80], tasks: [3, 3], palette: ["conveyor", "spin", "portal"],  specials: [2, 2], par: [14, 24], pressure: 1.35, maxRoutes: 24 },
  6: { day: "Saturday",  w: 7, h: 7, fill: [0.46, 0.72], tasks: [3, 3], palette: ["conveyor", "spin", "portal"],  specials: [2, 3], par: [16, 28], pressure: 1.40, maxRoutes: 20 },
  0: { day: "Sunday",    w: 7, h: 7, fill: [0.46, 0.72], tasks: [3, 4], palette: ["conveyor", "spin", "portal"],  specials: [3, 3], par: [18, 32], pressure: 1.40, maxRoutes: 20 },
};

const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const MOVE_TOKEN = { up: "MU", down: "MD", left: "ML", right: "MR" };
const ck = (r, c) => `${r},${c}`;

// --- board shape --------------------------------------------------------------

// Grow a connected blob of `target` cells, optionally mirrored left-to-right so
// the board reads as designed rather than spilled.
function carveShape(rng, w, h, target, mirror) {
  const region = new Set();
  let r = rng.range(1, h - 2), c = rng.range(1, w - 2);
  region.add(ck(r, c));
  const edge = [[r, c]];

  while (region.size < target && edge.length) {
    const [er, ec] = edge[rng.int(edge.length)];
    const opts = rng.shuffle(DIRS4)
      .map(([dr, dc]) => [er + dr, ec + dc])
      .filter(([nr, nc]) => nr >= 0 && nr < h && nc >= 0 && nc < w && !region.has(ck(nr, nc)));
    if (!opts.length) {
      edge.splice(edge.findIndex(([a, b]) => a === er && b === ec), 1);
      continue;
    }
    const [nr, nc] = opts[0];
    region.add(ck(nr, nc));
    edge.push([nr, nc]);
  }

  if (mirror) {
    for (const k of [...region]) {
      const [rr, cc] = k.split(",").map(Number);
      region.add(ck(rr, w - 1 - cc));
    }
    if (!isConnected(region)) return null;
  }
  return region;
}

function isConnected(region) {
  const [first] = region;
  const seen = new Set([first]);
  const stack = [first];
  while (stack.length) {
    const [r, c] = stack.pop().split(",").map(Number);
    for (const [dr, dc] of DIRS4) {
      const k = ck(r + dr, c + dc);
      if (region.has(k) && !seen.has(k)) { seen.add(k); stack.push(k); }
    }
  }
  return seen.size === region.size;
}

// Shift the blob so it sits flush against the top-left; the emitted level text
// then has no empty border rows or columns.
function trim(region) {
  let minR = Infinity, minC = Infinity, maxR = -1, maxC = -1;
  for (const k of region) {
    const [r, c] = k.split(",").map(Number);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  const out = new Set();
  for (const k of region) {
    const [r, c] = k.split(",").map(Number);
    out.add(ck(r - minR, c - minC));
  }
  return { region: out, h: maxR - minR + 1, w: maxC - minC + 1 };
}

// Step distance between floor cells, walking the region only.
function walkDistances(region, from) {
  const dist = new Map([[from, 0]]);
  let frontier = [from];
  let d = 0;
  while (frontier.length) {
    const next = [];
    for (const k of frontier) {
      const [r, c] = k.split(",").map(Number);
      for (const [dr, dc] of DIRS4) {
        const nk = ck(r + dr, c + dc);
        if (region.has(nk) && !dist.has(nk)) { dist.set(nk, d + 1); next.push(nk); }
      }
    }
    frontier = next;
    d++;
  }
  return dist;
}

// --- tile placement -----------------------------------------------------------

// Conveyors chain: landing on one slides you to the next tile, which is then
// resolved in turn. A ring of them would slide the die forever (the engine only
// stops at MAX_CHAIN, leaving the player somewhere arbitrary), so reject any
// conveyor cycle. Portals can't extend a chain — the engine treats a portal as
// terminal and does not resolve the exit tile — so only conveyor-to-conveyor
// links can close a loop.
function hasConveyorCycle(convey) {
  const state = new Map(); // 0 = visiting, 1 = done
  const walk = (k) => {
    if (state.get(k) === 0) return true;
    if (state.get(k) === 1) return false;
    state.set(k, 0);
    const nxt = convey.get(k);
    const cyc = nxt !== undefined && convey.has(nxt) && walk(nxt);
    state.set(k, 1);
    return cyc;
  };
  for (const k of convey.keys()) if (walk(k)) return true;
  return false;
}

// Build one candidate layout: shape, start, goal, special tiles. Task tiles are
// added later, once the solver has told us which faces each cell can show.
function layout(rng, tier) {
  const target = Math.round(tier.w * tier.h * (tier.fill[0] + rng() * (tier.fill[1] - tier.fill[0])));
  const raw = carveShape(rng, tier.w, tier.h, target, rng.chance(0.5));
  if (!raw || raw.size < 10) return null;
  const { region, w, h } = trim(raw);
  if (w < 4 || h < 4) return null;

  const cells = [...region];
  const start = rng.pick(cells);
  const dist = walkDistances(region, start);
  if (dist.size !== region.size) return null; // region must be fully walkable

  // Goal wants to be a real trip away, not next door.
  const minSep = Math.max(3, Math.round(Math.max(...dist.values()) * 0.55));
  const far = cells.filter((k) => (dist.get(k) ?? 0) >= minSep);
  if (!far.length) return null;
  const goal = rng.pick(far);

  const used = new Set([start, goal]);
  const specials = [];
  const convey = new Map();
  const nSpecial = rng.range(tier.specials[0], tier.specials[1]);
  const free = () => rng.shuffle(cells.filter((k) => !used.has(k)));

  for (let i = 0; i < nSpecial; i++) {
    const kind = tier.palette.length ? rng.pick(tier.palette) : null;
    if (!kind) break;

    if (kind === "portal") {
      if (specials.some((s) => s.kind === "portal")) continue; // one pair at most
      const opts = free();
      if (opts.length < 2) break;
      const a = opts[0];
      const bDist = walkDistances(region, a);
      const b = opts.slice(1).find((k) => (bDist.get(k) ?? 0) >= 3);
      if (!b) continue;
      used.add(a); used.add(b);
      specials.push({ kind: "portal", cells: [a, b], token: "P0" });
    } else if (kind === "spin") {
      const at = free()[0];
      if (!at) break;
      used.add(at);
      specials.push({ kind: "spin", cells: [at], token: rng.chance(0.5) ? "s" : "S" });
    } else {
      // Conveyor: must actually deliver somewhere, so it has to point at a tile.
      const at = free()[0];
      if (!at) break;
      const [r, c] = at.split(",").map(Number);
      const dirs = rng.shuffle([["up", -1, 0], ["down", 1, 0], ["left", 0, -1], ["right", 0, 1]])
        .filter(([, dr, dc]) => region.has(ck(r + dr, c + dc)));
      if (!dirs.length) continue;
      const [dir, dr, dc] = dirs[0];
      convey.set(at, ck(r + dr, c + dc));
      if (hasConveyorCycle(convey)) { convey.delete(at); continue; }
      used.add(at);
      specials.push({ kind: "conveyor", cells: [at], token: MOVE_TOKEN[dir] });
    }
  }

  return { region, w, h, start, goal, specials, used, cells };
}

// Render a layout (plus optional task assignments) as level text. `omitGoal`
// produces the movement probe: no goal means nothing can win, so a search over
// it maps the whole board instead of stopping at the first solution.
function toText(lay, tasks = [], omitGoal = false) {
  const grid = Array.from({ length: lay.h }, () => Array(lay.w).fill("0"));
  for (const k of lay.region) {
    const [r, c] = k.split(",").map(Number);
    grid[r][c] = "#";
  }
  for (const s of lay.specials)
    for (const k of s.cells) {
      const [r, c] = k.split(",").map(Number);
      grid[r][c] = s.token;
    }
  for (const t of tasks) {
    const [r, c] = t.cell.split(",").map(Number);
    grid[r][c] = `${t.slot === "top" ? "T" : "B"}${t.value}`;
  }
  if (!omitGoal) {
    const [gr, gc] = lay.goal.split(",").map(Number);
    grid[gr][gc] = "G";
  }
  const [sr, sc] = lay.start.split(",").map(Number);
  grid[sr][sc] = "g";
  return grid.map((row) => row.join(" ")).join("\n");
}

// Same board with one cell downgraded to plain floor — the "does this tile
// actually matter?" probe.
function textWithout(lay, tasks, cellsToDrop) {
  const drop = new Set(cellsToDrop);
  const keptSpecials = lay.specials.filter((s) => !s.cells.some((k) => drop.has(k)));
  const keptTasks = tasks.filter((t) => !drop.has(t.cell));
  return toText({ ...lay, specials: keptSpecials }, keptTasks);
}

// --- candidate assembly + scoring --------------------------------------------

function chooseTasks(rng, lay, tier) {
  // The movement graph doesn't depend on the tasks, so probe it with the goal
  // flattened to floor (nothing to win, nothing to stop the search early) and
  // read off which faces each cell can be reached showing.
  const probe = toText(lay, [], true);
  const byCell = reachableOrientations(probe);

  const n = rng.range(tier.tasks[0], tier.tasks[1]);
  const spots = rng.shuffle(lay.cells.filter((k) => !lay.used.has(k)));
  const tasks = [];

  for (const cell of spots) {
    if (tasks.length >= n) break;
    const [r, c] = cell.split(",").map(Number);
    const slot = rng.chance(0.5) ? "top" : "bottom";
    const costs = faceCosts(byCell, r, c, slot);
    if (costs.size < 2) continue; // a cell with one achievable face is a freebie

    // Prefer the expensive faces: those are the ones that force a detour rather
    // than falling out of the walk you were doing anyway.
    const ranked = [...costs.entries()].sort((a, b) => b[1] - a[1]);
    const pool = ranked.slice(0, Math.max(2, Math.ceil(ranked.length / 2)));
    const [value] = rng.weighted(pool.map(([v, d], i) => [[v, d], pool.length - i]));
    tasks.push({ cell, slot, value });
  }
  return tasks.length === n ? tasks : null;
}

// Full evaluation of one candidate. Returns null if it fails the bars for this
// strictness level.
function evaluate(lay, tasks, tier, strict) {
  const text = toText(lay, tasks);
  const sol = solveText(text);
  if (!sol.solvable) return null;
  if (sol.par < strict.par[0] || sol.par > strict.par[1]) return null;

  const free = freeParText(text);
  if (!Number.isFinite(free) || free <= 0) return null;
  const pressure = sol.par / free;
  if (pressure < strict.pressure) return null;
  if (sol.optimalCount > strict.maxRoutes) return null;

  // Load-bearing checks. Each is one more exhaustive solve of a ~19k state
  // space, which is cheap, and they are what separate a designed board from a
  // grid with decorations sprinkled on it.
  let neededSpecials = 0;
  for (const s of lay.specials) {
    const alt = solveText(textWithout(lay, tasks, s.cells));
    if (!alt.solvable || alt.par !== sol.par) neededSpecials++;
  }
  if (lay.specials.length && neededSpecials < Math.ceil(lay.specials.length * strict.specialsNeeded))
    return null;

  if (strict.tasksNeeded) {
    for (const t of tasks) {
      const alt = solveText(textWithout(lay, tasks, [t.cell]));
      // Dropping a task must make the puzzle strictly easier. If par is
      // unchanged the task was being satisfied for free en route — it reads as
      // a requirement but costs the player nothing.
      if (alt.solvable && alt.par >= sol.par) return null;
    }
  }

  const band = strict.par;
  const centre = 1 - Math.abs(sol.par - (band[0] + band[1]) / 2) / ((band[1] - band[0]) / 2 || 1);
  const score =
    3.0 * pressure +
    1.0 * centre +
    0.6 * neededSpecials -
    0.5 * Math.log2(1 + sol.optimalCount);

  return {
    text, par: sol.par, path: sol.path, score, pressure,
    optimalCount: sol.optimalCount, freePar: free, neededSpecials,
    tiles: lay.specials.map((s) => s.kind), tasks: tasks.length,
    width: lay.w, height: lay.h, states: sol.states,
  };
}

// Progressive relaxation. Pass 0 is the real bar; each later pass gives up one
// thing, in the order that costs the puzzle least. A day must always produce
// SOMETHING, but it should only ever be a weak puzzle after we've demonstrably
// tried for a good one — and the pass that produced it is recorded in the
// output so a run of bad days is visible rather than silent.
function passes(tier) {
  return [
    { ...tier, specialsNeeded: 1, tasksNeeded: true },
    { ...tier, pressure: tier.pressure - 0.12, maxRoutes: tier.maxRoutes * 3, specialsNeeded: 0.5, tasksNeeded: true },
    { ...tier, par: [Math.max(5, tier.par[0] - 4), tier.par[1] + 6], pressure: tier.pressure - 0.25, maxRoutes: 1e9, specialsNeeded: 0, tasksNeeded: false },
    { ...tier, par: [4, 1e9], pressure: 0, maxRoutes: 1e9, specialsNeeded: 0, tasksNeeded: false },
  ];
}

// Generate the puzzle for one ISO date. Deterministic: same date in, same
// puzzle out, forever. `recentHashes` lets the caller veto anything that
// repeats a board from the last few months.
export function generateForDate(dateStr, { recentHashes = [], candidates = 220 } = {}) {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  const tier = TIERS[day];
  const recent = new Set(recentHashes);
  const ladder = passes(tier);

  for (let p = 0; p < ladder.length; p++) {
    const strict = ladder[p];
    const rng = makeRng(`d6-daily|${dateStr}|pass${p}`);
    let best = null;
    let bestFresh = null;

    for (let i = 0; i < candidates; i++) {
      const lay = layout(rng, tier);
      if (!lay) continue;
      const tasks = chooseTasks(rng, lay, tier);
      if (!tasks) continue;
      const ev = evaluate(lay, tasks, tier, strict);
      if (!ev) continue;
      ev.hash = puzzleHash(ev.text);
      if (!best || ev.score > best.score) best = ev;
      if (!recent.has(ev.hash) && (!bestFresh || ev.score > bestFresh.score)) bestFresh = ev;
    }

    const chosen = bestFresh || best;
    if (chosen) {
      const check = verifySolution(chosen.text, chosen.path, chosen.par, dateStr);
      if (!check.ok) throw new Error(`generated puzzle for ${dateStr} failed replay: ${check.why}`);
      return {
        date: dateStr,
        day: tier.day,
        text: chosen.text,
        par: chosen.par,
        solution: chosen.path.join(" "),
        hash: chosen.hash,
        repeat: !bestFresh,
        pass: p,
        stats: {
          pressure: +chosen.pressure.toFixed(2),
          freePar: chosen.freePar,
          optimalRoutes: chosen.optimalCount,
          tiles: chosen.tiles,
          tasks: chosen.tasks,
          size: `${chosen.width}x${chosen.height}`,
          states: chosen.states,
        },
      };
    }
  }
  throw new Error(`no puzzle could be generated for ${dateStr}`);
}

export function puzzleHash(text) {
  return hashString(text.replace(/\s+/g, " ").trim()).toString(16);
}

// Human-readable board, for --preview and for failure output.
export function asciiBoard(text) {
  const cols = [];
  const rows = text.split("\n").map((l) => l.trim().split(/\s+/));
  rows.forEach((row) => row.forEach((tk, i) => { cols[i] = Math.max(cols[i] || 0, tk.length); }));
  return rows.map((row) =>
    row.map((tk, i) => (tk === "0" ? "·" : tk).padEnd(cols[i] + 1)).join("")).join("\n");
}
