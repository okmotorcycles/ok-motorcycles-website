// Setup + config. Thin wrapper the UI calls to start a run and advance levels.

import { createGame } from "./engine.js";
import { START_LEVEL } from "../data/levels.js";

export const CONFIG = Object.freeze({
  startLevel: START_LEVEL,
  // Roll animation duration (ms) — kept in sync with css --roll-ms so the UI
  // waits for the tumble before accepting the next input.
  rollMs: 260,
});

export function createInitialState() {
  return createGame(CONFIG.startLevel);
}

// Advance to the level chained from the one just won, carrying the die's
// current orientation, exactly like the original seamless transition.
export function advanceLevel(game) {
  const next = game.nextLevel || CONFIG.startLevel;
  return createGame(next, game.die);
}
