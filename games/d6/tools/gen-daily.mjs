#!/usr/bin/env node
// Writes the puzzle of the day to daily.json, which the game fetches on load.
//
//   node tools/gen-daily.mjs                      # today (Pacific) -> ./daily.json
//   node tools/gen-daily.mjs --date 2026-09-04    # a specific day
//   node tools/gen-daily.mjs --preview            # print it, write nothing
//   node tools/gen-daily.mjs --check 30           # self-test the next 30 days
//
// The daily GitHub Action runs the plain form. Nothing is written unless the
// puzzle has been solved AND replayed from the emitted text, so a bad run fails
// the job instead of publishing an unsolvable board.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateForDate, asciiBoard } from "./generate.mjs";
import { solveText, verifySolution } from "./solver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(HERE, "..", "daily.json");
const HISTORY = 90; // days of board hashes kept, so puzzles don't repeat

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

// The puzzle's date is the AUDIENCE's date, not UTC. The site publishes on a
// Pacific schedule and the board is labelled "Daily · Sep 1" to a Pacific
// reader, so a run landing after UTC midnight — an evening manual run, or the
// cron once daylight saving shifts it — must not publish tomorrow's board while
// it is still today where the players are. Override with D6_TZ if that ever
// stops being the right assumption.
const ZONE = process.env.D6_TZ || "America/Los_Angeles";
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date());

// Independent second opinion on whatever we're about to ship: re-solve the
// emitted text from scratch and replay the solution through the engine. The
// generator already checked itself; this checks the generator.
function audit(puzzle) {
  const re = solveText(puzzle.text, puzzle.date);
  if (!re.solvable) throw new Error(`${puzzle.date}: emitted text is not solvable`);
  if (re.par !== puzzle.par) throw new Error(`${puzzle.date}: par ${puzzle.par} but re-solve says ${re.par}`);
  const v = verifySolution(puzzle.text, puzzle.solution.split(" "), puzzle.par, puzzle.date);
  if (!v.ok) throw new Error(`${puzzle.date}: solution replay failed — ${v.why}`);
}

function loadPrevious(out) {
  if (!existsSync(out)) return { history: [] };
  try {
    return JSON.parse(readFileSync(out, "utf8"));
  } catch {
    return { history: [] };
  }
}

const check = arg("check");
if (check) {
  // Self-test: generate a run of days and audit every one. Used by the test
  // suite and by hand when the tiers are retuned.
  const n = Number(check) || 30;
  const from = arg("date") || today();
  const recent = [];
  let worstPass = 0;
  for (let i = 0; i < n; i++) {
    const date = new Date(new Date(`${from}T00:00:00Z`).getTime() + i * 86400000).toISOString().slice(0, 10);
    const p = generateForDate(date, { recentHashes: recent });
    audit(p);
    recent.push(p.hash);
    worstPass = Math.max(worstPass, p.pass);
    console.log(`${p.date} ${p.day.padEnd(9)} par ${String(p.par).padStart(2)}  pressure ${p.stats.pressure}  routes ${String(p.stats.optimalRoutes).padStart(2)}  ${p.stats.size}  tasks ${p.stats.tasks}  ${p.stats.tiles.join(",") || "-"}${p.pass ? `  [relaxed to pass ${p.pass}]` : ""}`);
  }
  console.log(`\n${n} days audited, all solvable and replay-verified (worst relaxation: pass ${worstPass}).`);
  process.exit(0);
}

const date = arg("date") || today();
const out = resolve(String(arg("out") || DEFAULT_OUT));
const prev = loadPrevious(out);

// Anti-repeat, minus this date's own past entry — otherwise regenerating a day
// would see its own board in the history and deliberately pick a different one,
// so the same date would stop being reproducible.
const recentHashes = (prev.history || []).filter((h) => h.date !== date).map((h) => h.hash);

const puzzle = generateForDate(date, { recentHashes });
audit(puzzle);

if (arg("preview")) {
  console.log(`${puzzle.date} (${puzzle.day})  par ${puzzle.par}  pass ${puzzle.pass}`);
  console.log(JSON.stringify(puzzle.stats));
  console.log(asciiBoard(puzzle.text));
  console.log(`solution: ${puzzle.solution}`);
  process.exit(0);
}

const history = [
  ...(prev.history || []).filter((h) => h.date !== date),
  { date: puzzle.date, hash: puzzle.hash },
].slice(-HISTORY);

// The solution is deliberately NOT published — the file sits next to the game
// on a public site.
const payload = {
  date: puzzle.date,
  day: puzzle.day,
  par: puzzle.par,
  text: puzzle.text,
  generated: new Date().toISOString(),
  stats: puzzle.stats,
  history,
};

writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`${puzzle.date} (${puzzle.day}) par ${puzzle.par} — ${puzzle.stats.size}, ${puzzle.stats.tasks} tasks, tiles [${puzzle.stats.tiles.join(", ") || "none"}], pressure ${puzzle.stats.pressure}`);
console.log(asciiBoard(puzzle.text));
console.log(`wrote ${out}`);
