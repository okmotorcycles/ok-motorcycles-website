// Exhaustive solver over the REAL engine. Everything the generator claims about
// a puzzle — solvable, par, how many optimal routes, whether a tile matters —
// is decided here, by driving js/core/engine.js itself. There is deliberately
// no second copy of the rules: a reimplementation would be free to disagree
// with the game the player actually loads, which is the one failure mode a
// daily generator cannot survive.
//
// State = (position, die orientation, which tasks are cleared). Position is at
// most ~49 cells, orientation is 24 real states, and the cleared set is a
// bitmask over <=4 task tiles, so the whole space is ~19k states — small enough
// to enumerate exactly. No heuristics, no sampling: "unsolvable" here means
// unsolvable, not "we didn't find it".
//
// NOTE on the state key: it encodes WHICH tasks are cleared, not how many.
// test/solve.mjs used to key on the count (audit finding D6-BFS) — two states
// with different tasks cleared collided, so the search could prune the only
// route to the goal and call a fine level unwinnable. A generator built on that
// would quietly throw away its best puzzles.

import { DIRS } from "../js/core/dice.js";
import { tryMove, createGameFromText } from "../js/core/engine.js";
import { TILE } from "../js/core/levels.js";

const MAX_WAYS = 1e9; // cap on the optimal-route count so it can't overflow

export function isTask(t) {
  return t && (t.type === TILE.TOP_TASK || t.type === TILE.BOTTOM_TASK);
}

// Task tile positions in row-major order — this fixed order defines the bit
// index of each task in the state mask.
export function taskCells(game) {
  const out = [];
  for (let r = 0; r < game.height; r++)
    for (let c = 0; c < game.width; c++)
      if (isTask(game.tiles[r][c])) out.push({ r, c });
  return out;
}

export function goalCell(game) {
  for (let r = 0; r < game.height; r++)
    for (let c = 0; c < game.width; c++)
      if (game.tiles[r][c]?.type === TILE.GOAL) return { r, c };
  return null;
}

const dieKey = (d) => `${d.top}${d.bottom}${d.left}${d.right}${d.front}${d.back}`;

// Load a search state back into the shared game object. The BFS reuses ONE game
// rather than deep-cloning per expansion (~76k expansions per solve); a game is
// fully described by pos + die + the tasks' cleared flags, so restoring is a
// dozen field writes instead of rebuilding a 49-cell tile grid.
function loadState(game, tasks, st) {
  game.pos = { r: st.r, c: st.c };
  game.die = { ...st.die };
  game.won = false;
  game.moveCount = 0;
  let done = 0;
  for (let i = 0; i < tasks.length; i++) {
    const on = (st.mask >> i) & 1;
    game.tiles[tasks[i].r][tasks[i].c].cleared = on === 1;
    if (on) done++;
  }
  game.completedTasks = done;
  game.allTasksCompleted = done >= game.totalTasks;
}

function readMask(game, tasks) {
  let mask = 0;
  for (let i = 0; i < tasks.length; i++)
    if (game.tiles[tasks[i].r][tasks[i].c].cleared) mask |= 1 << i;
  return mask;
}

// Breadth-first over the full state space.
// Returns { solvable, par, path, optimalCount, states } where `states` is the
// number of reachable states (a rough complexity signal) and optimalCount is
// how many distinct shortest move sequences win.
export function solve(game) {
  const tasks = taskCells(game);
  const startDie = { ...game.die };
  const start = { r: game.pos.r, c: game.pos.c, die: startDie, mask: 0, ways: 1, parent: -1, move: null };

  start.d = 0;
  const nodes = [start];
  const seen = new Map([[`${start.r},${start.c}|${dieKey(startDie)}|0`, 0]]);
  let frontier = [0];
  let depth = 0;
  let winWays = 0;
  let winNode = -1;

  while (frontier.length) {
    const next = [];
    for (const idx of frontier) {
      const st = nodes[idx];
      for (const dir of DIRS) {
        loadState(game, tasks, st);
        const res = tryMove(game, dir);
        if (!res.moved) continue;

        if (game.won) {
          // Shortest win found at this depth; keep scanning the rest of the
          // frontier so optimalCount sees every equally-short route.
          winWays = Math.min(MAX_WAYS, winWays + st.ways);
          if (winNode < 0) winNode = nodes.push({ r: game.pos.r, c: game.pos.c, die: { ...game.die }, mask: 0, ways: 0, parent: idx, move: dir }) - 1;
          continue;
        }
        if (winNode >= 0) continue; // already at the winning depth — don't expand further

        const die = { ...game.die };
        const mask = readMask(game, tasks);
        const key = `${game.pos.r},${game.pos.c}|${dieKey(die)}|${mask}`;
        const hit = seen.get(key);
        if (hit === undefined) {
          const n = nodes.push({ r: game.pos.r, c: game.pos.c, die, mask, ways: st.ways, parent: idx, move: dir, d: depth + 1 }) - 1;
          seen.set(key, n);
          next.push(n);
        } else if (nodes[hit].d === depth + 1) {
          // Re-reached at the same depth: another equally short route in.
          nodes[hit].ways = Math.min(MAX_WAYS, nodes[hit].ways + st.ways);
        }
      }
    }
    if (winNode >= 0) {
      return { solvable: true, par: depth + 1, path: tracePath(nodes, winNode), optimalCount: winWays, states: nodes.length };
    }
    frontier = next;
    depth++;
  }
  return { solvable: false, par: Infinity, path: null, optimalCount: 0, states: nodes.length };
}

function tracePath(nodes, idx) {
  const out = [];
  while (idx >= 0 && nodes[idx].move) {
    out.push(nodes[idx].move);
    idx = nodes[idx].parent;
  }
  return out.reverse();
}

// Solve straight from level text. `solve` drives the game object it is given to
// destruction (that is the point — it reuses one game for every expansion), so
// callers hand it a throwaway.
export function solveText(text, name = "(candidate)") {
  return solve(createGameFromText(text, null, name));
}

// --- Positional analysis ------------------------------------------------------
// Which tiles a single input actually RESOLVES, in order. The engine resolves
// the tile it rolls onto and every tile a conveyor slides it onto, but NOT a
// portal's exit (portal is terminal — see resolveTile). Mirroring that rule
// here is only ever used for the difficulty *metric* below, never to decide
// solvability, so it can't put a broken puzzle on the site.
function resolvedStops(steps) {
  const stops = [];
  for (const s of steps) {
    if (s.type === "roll" || s.type === "slide") stops.push(s.to);
  }
  return stops;
}

// Shortest solution if the die had no faces to manage — i.e. treat every task
// as satisfied by simply stepping on it. This is the pure-navigation floor of
// the puzzle; par divided by it is how much of the difficulty is actually about
// the die. A maze with a die on it scores ~1.0; a real D6 puzzle scores higher.
export function freeParText(text) {
  const game = createGameFromText(text, null, "(free)");
  const tasks = taskCells(game);
  const taskIdx = new Map(tasks.map((t, i) => [`${t.r},${t.c}`, i]));
  const full = (1 << tasks.length) - 1;
  const goal = goalCell(game);
  if (!goal) return Infinity;

  const startKey = `${game.pos.r},${game.pos.c}|0`;
  let frontier = [{ r: game.pos.r, c: game.pos.c, mask: 0 }];
  const seen = new Set([startKey]);
  let depth = 0;

  while (frontier.length) {
    const next = [];
    for (const st of frontier) {
      for (const dir of DIRS) {
        game.pos = { r: st.r, c: st.c };
        game.won = false;
        game.allTasksCompleted = false; // never auto-win inside the probe
        const res = tryMove(game, dir);
        if (!res.moved) continue;

        let mask = st.mask;
        let won = false;
        for (const stop of resolvedStops(res.steps)) {
          const ti = taskIdx.get(`${stop.r},${stop.c}`);
          if (ti !== undefined) mask |= 1 << ti;
          if (stop.r === goal.r && stop.c === goal.c && mask === full) won = true;
        }
        if (won) return depth + 1;

        const key = `${game.pos.r},${game.pos.c}|${mask}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ r: game.pos.r, c: game.pos.c, mask });
      }
    }
    frontier = next;
    depth++;
    if (depth > 200) break;
  }
  return Infinity;
}

// Every (cell, orientation) the die can ever be in, with the fewest moves to get
// there. The generator uses this to pick task requirements that are actually
// achievable — and to prefer the ones that cost a detour.
//
// Task tiles and the goal are irrelevant here: neither blocks movement nor
// touches the die (tasks only latch a flag that gates the goal), so the
// movement graph is identical no matter what the tasks demand. That's what lets
// requirements be chosen AFTER the layout, instead of guessed and thrown away.
export function reachableOrientations(probeText) {
  const game = createGameFromText(probeText, null, "(probe)");
  const startDie = { ...game.die };
  const byCell = new Map(); // "r,c" -> Map(dieKey -> dist)
  const record = (r, c, die, d) => {
    const ck = `${r},${c}`;
    let m = byCell.get(ck);
    if (!m) byCell.set(ck, (m = new Map()));
    const k = dieKey(die);
    if (!m.has(k)) { m.set(k, { die: { ...die }, dist: d }); return true; }
    return false;
  };

  record(game.pos.r, game.pos.c, startDie, 0);
  let frontier = [{ r: game.pos.r, c: game.pos.c, die: startDie }];
  let depth = 0;

  while (frontier.length) {
    const next = [];
    for (const st of frontier) {
      for (const dir of DIRS) {
        game.pos = { r: st.r, c: st.c };
        game.die = { ...st.die };
        game.won = false;
        const res = tryMove(game, dir);
        if (!res.moved) continue;
        if (record(game.pos.r, game.pos.c, game.die, depth + 1))
          next.push({ r: game.pos.r, c: game.pos.c, die: { ...game.die } });
      }
    }
    frontier = next;
    depth++;
    if (depth > 400) break;
  }
  return byCell;
}

// For one cell: face value -> cheapest number of moves to arrive there showing
// it. `slot` is "top" or "bottom".
export function faceCosts(byCell, r, c, slot) {
  const m = byCell.get(`${r},${c}`);
  const out = new Map();
  if (!m) return out;
  for (const { die, dist } of m.values()) {
    const v = die[slot];
    if (!out.has(v) || out.get(v) > dist) out.set(v, dist);
  }
  return out;
}

// Replay a solution through a fresh game and confirm it really wins in exactly
// `par` moves. The generator's own search could in principle be wrong; this
// re-derives the answer from the shipped level text the browser will parse, so
// nothing reaches the site that hasn't been played through end to end.
export function verifySolution(text, path, par, name = "(verify)") {
  const game = createGameFromText(text, null, name);
  if (!Array.isArray(path) || path.length !== par) {
    return { ok: false, why: `path length ${path?.length} != par ${par}` };
  }
  for (let i = 0; i < path.length; i++) {
    const res = tryMove(game, path[i]);
    if (!res.moved) return { ok: false, why: `move ${i + 1} (${path[i]}) was blocked` };
    if (game.won && i < path.length - 1) return { ok: false, why: `won early at move ${i + 1}` };
  }
  if (!game.won) return { ok: false, why: "replay finished without winning" };
  return { ok: true };
}
