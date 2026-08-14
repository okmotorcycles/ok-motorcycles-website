// Die-face orientation model — the heart of D6. Pure logic, no DOM.
//
// A D6 is modelled as the six pip values currently facing each direction. We
// track orientation as which pip sits on each of the six sides rather than a
// full quaternion; the four roll permutations and two spin permutations below
// reproduce exactly how a real cube reorients when it tumbles one cell.
//
// This is the port spec: the Godot version should implement the same six-slot
// model and the same permutations.
//
// Coordinate convention (world, matching the Unity original):
//   +X = right, -X = left, +Z = forward (screen "up"), -Z = back, +Y = up.
// Opposite faces of a real die sum to 7.

// Classic die start config (from the Unity Cube prefab).
export const DEFAULT_FACES = Object.freeze({
  top: 1,
  bottom: 6,
  left: 2,
  right: 5,
  front: 3,
  back: 4,
});

export function makeDie() {
  return { ...DEFAULT_FACES };
}

// Directions the die can roll. Screen "up" is world +Z (forward).
export const DIRS = Object.freeze(["up", "down", "left", "right"]);

// Roll the die one cell in a direction, returning a NEW face object. The die
// tumbles 90° about its leading bottom edge; each mapping reads from the
// pre-roll faces (values quoted from the original DiceFaceManager).
export function rollFaces(f, dir) {
  switch (dir) {
    // Forward (+Z): Top<-Back, Bottom<-Front, Front<-Top, Back<-Bottom.
    case "up":
      return { top: f.back, bottom: f.front, left: f.left, right: f.right, front: f.top, back: f.bottom };
    // Back (-Z): Top<-Front, Bottom<-Back, Front<-Bottom, Back<-Top.
    case "down":
      return { top: f.front, bottom: f.back, left: f.left, right: f.right, front: f.bottom, back: f.top };
    // Left (-X): Top<-Right, Bottom<-Left, Left<-Top, Right<-Bottom.
    case "left":
      return { top: f.right, bottom: f.left, left: f.top, right: f.bottom, front: f.front, back: f.back };
    // Right (+X): Top<-Left, Bottom<-Right, Left<-Bottom, Right<-Top.
    case "right":
      return { top: f.left, bottom: f.right, left: f.bottom, right: f.top, front: f.front, back: f.back };
    default:
      throw new Error(`rollFaces: unknown direction "${dir}"`);
  }
}

// Spin the die 90° about the vertical (Y) axis in place; Top/Bottom unchanged.
// Used by spin action tiles (follow-up feature) but part of the port spec.
export function spinFaces(f, counterClockwise) {
  if (counterClockwise) {
    // CCW: Left<-Front, Front<-Right, Right<-Back, Back<-Left.
    return { top: f.top, bottom: f.bottom, left: f.front, right: f.back, front: f.right, back: f.left };
  }
  // CW: Right<-Front, Back<-Right, Left<-Back, Front<-Left.
  return { top: f.top, bottom: f.bottom, left: f.back, right: f.front, front: f.left, back: f.right };
}

// Grid delta for each direction. Rows increase downward on screen, so "up"
// (world +Z / forward) decreases the row index.
export const DIR_DELTA = Object.freeze({
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
});
