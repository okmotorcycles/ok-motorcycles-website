// Level data — text grids in the original D6 format (see core/levels.js).
//
// Main campaign (loops): each level teaches one mechanic and is BFS-verified
// winnable (test/solve.mjs).
//   level_0        — top/bottom face tasks
//   level_conveyor — a move/conveyor tile delivers a pre-set face onto a task
//   level_spin     — a spin tile is REQUIRED to orient the needed face
//   level_portal   — a portal is the only link between two halves
//   level_1/level_2 — ported 1:1 from the Unity Assets/Resources (floor grids)
//
// The original's debug_1/debug_2 tile-test sandboxes are gone: they were dev
// scaffolding, they were never designed to be won, and the game now leads with a
// generated daily puzzle. Their grids are in git history if a tile-test board is
// ever wanted again.

export const START_LEVEL = "level_0";

export const LEVELS = {
  // Tutorial: T3 wants top face = 3, B4 wants bottom face = 4. Clearing both
  // unlocks the goal G. (Verified solvable by test/solve.mjs.)
  level_0: `0 0 G 0 0
0 # T3 # 0
# # # # #
0 # B4 # 0
0 0 g 0 0
:level_conveyor:`,

  // Conveyor (MU) carries the die up onto the T6 task without rolling, so a top
  // face set up on the way in is preserved. Only path is up the middle.
  level_conveyor: `0 0 G 0 0
0 0 T6 0 0
# # MU # #
0 0 # 0 0
0 0 g 0 0
:level_spin:`,

  // Spin (s) is required: in this single column you cannot land top=2 on the
  // T2 task by rolling alone — you must spin to reorient first.
  level_spin: `0 0 G 0 0
0 0 T2 0 0
0 0 s 0 0
0 0 # 0 0
0 0 g 0 0
:level_portal:`,

  // Two columns with no floor between them — the P0 portal pair is the only way
  // to cross from the start (right) to the goal (left).
  level_portal: `G 0 0 0 g
# 0 0 0 #
# 0 0 0 #
# 0 0 0 #
P0 0 0 0 P0
:level_1:`,

  // Ported from Assets/Resources/level_1.txt — diamond of floor, no tasks.
  level_1: `0 0 G 0 0
0 # # # 0
# # # # #
0 # # # 0
0 0 g 0 0
:level_2:`,

  // Ported from Assets/Resources/level_2.txt — start and goal on opposite sides.
  level_2: `0 0 # 0 0
0 # # # 0
g # # # G
0 # # # 0
0 0 # 0 0
:level_0:`,
};
