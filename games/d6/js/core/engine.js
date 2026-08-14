// Game engine — movement, tile resolution, task tracking, win detection.
// Pure logic, no DOM. All rendering reads from the game object this produces.
//
// A single player input produces an ordered list of animation STEPS: the roll,
// then any follow-ups triggered by the tile it lands on (conveyor slides, spins,
// portal teleports), chained per the original's retrigger rules:
//   - roll  : changes faces, RE-triggers the landed tile
//   - slide : keeps faces,  RE-triggers the landed tile (conveyors chain)
//   - spin  : changes faces, does NOT re-trigger (would spin forever)
//   - portal: moves,         does NOT re-trigger (paired portals would ping-pong)

import { makeDie, rollFaces, spinFaces, DIR_DELTA } from "./dice.js";
import { parseLevel, TILE } from "./levels.js";
import { LEVELS } from "../data/levels.js";

const MAX_CHAIN = 64; // safety cap so a conveyor loop can't hang the browser

// Build a fresh game for a named level. `carryDie` lets the die keep its
// orientation across a level transition (the original does the same).
export function createGame(levelName, carryDie = null) {
  const text = LEVELS[levelName];
  if (text == null) throw new Error(`createGame: no level named "${levelName}"`);
  return buildGame(levelName, text, carryDie);
}

// Build a game directly from level text (used for testing candidate levels).
export function createGameFromText(text, carryDie = null, name = "(inline)") {
  return buildGame(name, text, carryDie);
}

function buildGame(levelName, text, carryDie) {
  const level = parseLevel(text);

  // Deep-copy tiles so per-level state ("cleared") doesn't mutate level data.
  const tiles = level.tiles.map((row) =>
    row.map((t) => (t ? { ...t, cleared: false } : null))
  );

  linkPortals(tiles);

  return {
    levelName,
    width: level.width,
    height: level.height,
    tiles,
    nextLevel: level.nextLevel,
    die: carryDie ? { ...carryDie } : makeDie(),
    pos: { ...level.start },
    totalTasks: level.taskCount,
    completedTasks: 0,
    allTasksCompleted: level.taskCount === 0,
    moveCount: 0,
    won: false,
  };
}

// Pair up portal tiles sharing an id: each gets the other's position as `dest`.
function linkPortals(tiles) {
  const byId = {};
  for (let r = 0; r < tiles.length; r++) {
    for (let c = 0; c < tiles[r].length; c++) {
      const t = tiles[r][c];
      if (t && t.type === TILE.PORTAL && t.portalId != null) {
        (byId[t.portalId] ||= []).push({ tile: t, pos: { r, c } });
      }
    }
  }
  for (const id of Object.keys(byId)) {
    const grp = byId[id];
    if (grp.length === 2) {
      grp[0].tile.dest = grp[1].pos;
      grp[1].tile.dest = grp[0].pos;
    }
  }
}

function tileAt(game, r, c) {
  if (r < 0 || r >= game.height || c < 0 || c >= game.width) return null;
  return game.tiles[r][c];
}

// Attempt to roll the die one cell in `dir`.
// Returns { moved, dir, wobble?, steps, events, won }. A blocked move (edge or
// hole) is a harmless wobble with no state change, exactly like the original.
export function tryMove(game, dir) {
  if (game.won) return { moved: false, steps: [], events: [] };

  const delta = DIR_DELTA[dir];
  const tr = game.pos.r + delta.dr;
  const tc = game.pos.c + delta.dc;

  if (!tileAt(game, tr, tc)) {
    return { moved: false, wobble: dir, steps: [], events: [] };
  }

  game.die = rollFaces(game.die, dir);
  game.pos = { r: tr, c: tc };
  game.moveCount++;

  const steps = [{ type: "roll", dir, to: { ...game.pos } }];
  const events = [];
  resolveTile(game, steps, events, 0);

  return { moved: true, dir, steps, events, won: game.won };
}

// Apply the effect of the tile the die is now on, appending animation steps and
// events. Conveyor slides recurse (retrigger); spins and portals are terminal.
function resolveTile(game, steps, events, depth) {
  if (game.won || depth > MAX_CHAIN) return;
  const tile = tileAt(game, game.pos.r, game.pos.c);
  if (!tile) return;

  switch (tile.type) {
    case TILE.TOP_TASK:
    case TILE.BOTTOM_TASK:
      checkTask(game, tile, events);
      checkGoalUnlock(game, events);
      break;

    case TILE.GOAL:
      if (game.allTasksCompleted) {
        game.won = true;
        events.push({ type: "win", nextLevel: game.nextLevel });
      } else {
        events.push({ type: "goal-locked", remaining: game.totalTasks - game.completedTasks });
      }
      break;

    case TILE.SPIN:
      game.die = spinFaces(game.die, tile.ccw);
      steps.push({ type: "spin", ccw: tile.ccw });
      break; // terminal — no retrigger

    case TILE.MOVE: {
      const d = DIR_DELTA[tile.moveDir];
      const tr = game.pos.r + d.dr;
      const tc = game.pos.c + d.dc;
      if (tileAt(game, tr, tc)) {
        game.pos = { r: tr, c: tc };
        steps.push({ type: "slide", dir: tile.moveDir, to: { ...game.pos } });
        resolveTile(game, steps, events, depth + 1); // retrigger detection
      }
      break;
    }

    case TILE.PORTAL:
      if (tile.dest) {
        game.pos = { ...tile.dest };
        steps.push({ type: "portal", to: { ...game.pos } });
      }
      break; // terminal — no retrigger

    default:
      break; // floor / start
  }
}

// Task tiles latch permanently once satisfied (top or bottom face == requirement).
function checkTask(game, tile, events) {
  if (tile.cleared) return;
  const value = tile.type === TILE.TOP_TASK ? game.die.top : game.die.bottom;
  if (value === tile.requirement) {
    tile.cleared = true;
    game.completedTasks++;
    events.push({ type: "task", face: tile.type === TILE.TOP_TASK ? "top" : "bottom", value });
  }
}

function checkGoalUnlock(game, events) {
  const was = game.allTasksCompleted;
  game.allTasksCompleted = game.completedTasks >= game.totalTasks;
  if (game.allTasksCompleted && !was) events.push({ type: "goal-unlocked" });
}
