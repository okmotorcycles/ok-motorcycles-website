// Level parser — turns the original D6 text format into a grid of tile objects.
// Pure logic, no DOM. Format is identical to the Unity Resources/*.txt files so
// levels port 1:1.
//
// Token map (first char is the tile type; digits/letters after it are params):
//   #        floor
//   g        start (floor + player spawn)
//   G        goal
//   T<n>     top-task    — clear when the die's TOP face == n
//   B<n>     bottom-task — clear when the die's BOTTOM face == n
//   0        empty (hole / gap, no tile)
//   :name:   line naming the next level to chain to on win
//
// Action tiles (s/S spin, M<dir> move, P<id> portal) are recognised by the
// format but not yet simulated — they're the follow-up feature. Unknown tokens
// are skipped with the tile treated as empty.

export const TILE = Object.freeze({
  FLOOR: "floor",
  START: "start",
  GOAL: "goal",
  TOP_TASK: "top_task",
  BOTTOM_TASK: "bottom_task",
  SPIN: "spin",
  MOVE: "move",
  PORTAL: "portal",
});

// Move-token letter -> roll direction. Matches the Unity mapping: U=forward(up),
// D=back(down), L=left, R=right.
const MOVE_DIR = { U: "up", D: "down", L: "left", R: "right" };

function tokenToTile(token) {
  const type = token[0];
  switch (type) {
    case "#":
      return { type: TILE.FLOOR };
    case "g":
      return { type: TILE.START };
    case "G":
      return { type: TILE.GOAL };
    case "T":
      return { type: TILE.TOP_TASK, requirement: clampFace(token.slice(1)) };
    case "B":
      return { type: TILE.BOTTOM_TASK, requirement: clampFace(token.slice(1)) };
    case "s":
      return { type: TILE.SPIN, ccw: false }; // clockwise
    case "S":
      return { type: TILE.SPIN, ccw: true }; // counter-clockwise
    case "M": {
      const dir = MOVE_DIR[token[1]];
      return dir ? { type: TILE.MOVE, moveDir: dir } : { type: TILE.FLOOR };
    }
    case "P": {
      const id = parseInt(token.slice(1), 10);
      return Number.isNaN(id) ? { type: TILE.FLOOR } : { type: TILE.PORTAL, portalId: id };
    }
    case "0":
      return null; // empty space
    default:
      return null; // unrecognised
  }
}

function clampFace(numberPart) {
  const n = parseInt(numberPart, 10);
  if (Number.isNaN(n)) return 1;
  return Math.min(6, Math.max(1, n));
}

// Split a line into tokens: space-separated if it has spaces, else per-char.
function lineTokens(line) {
  if (line.includes(" ")) return line.split(/\s+/).filter(Boolean);
  return line.split("");
}

// Parse level text into a structured level.
// Returns { width, height, tiles: (Tile|null)[][], start:{r,c}, goal:{r,c}, nextLevel, taskCount }.
export function parseLevel(text) {
  const rawLines = text.split(/\r?\n/).map((l) => l.trim());
  let nextLevel = null;

  // A :name: line sets the next level; drop it from the grid rows.
  const gridLines = [];
  for (const line of rawLines) {
    if (!line) continue;
    if (line.startsWith(":") && line.endsWith(":") && line.length > 2) {
      nextLevel = line.slice(1, -1);
      continue;
    }
    gridLines.push(line);
  }

  const rows = gridLines.map(lineTokens);
  const height = rows.length;
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);

  const tiles = [];
  let start = null;
  let goal = null;
  let taskCount = 0;

  for (let r = 0; r < height; r++) {
    const row = [];
    for (let c = 0; c < width; c++) {
      const token = rows[r][c];
      const tile = token ? tokenToTile(token) : null;
      row.push(tile);
      if (!tile) continue;
      if (tile.type === TILE.START) start = { r, c };
      if (tile.type === TILE.GOAL) goal = { r, c };
      if (tile.type === TILE.TOP_TASK || tile.type === TILE.BOTTOM_TASK) taskCount++;
    }
    tiles.push(row);
  }

  return { width, height, tiles, start, goal, nextLevel, taskCount };
}
