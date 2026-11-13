// Node harness for PlanetArt.js — run with `node test/PlanetArt.test.js`.
// Strips the `.pragma library` line and checks the figures the overlay draws:
// catalog, random pick, breath scale, sphere shape, Saturn's rings, and that
// the mandalas are not 5- or 6-fold stars.

const fs = require("fs");
const path = require("path");
const src = fs
  .readFileSync(path.join(__dirname, "..", "PlanetArt.js"), "utf8")
  .replace(/^\.pragma library\n/, "");
const Art = new Function(
  src +
    "\nreturn { FIGURES, frame, composite, resolveAnimation, visualScale, ids, cycle, animation, indexOf, maxCells };"
)();

let pass = 0;
function check(name, cond) {
  if (cond) pass++;
  else {
    console.error("FAIL", name);
    process.exitCode = 1;
  }
}

const BODIES = ["sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune"];
const MANDALAS = ["iris", "orbits", "petal", "lattice"];

check("ids start with random", Art.ids()[0] === "random");
check("ids cover every figure", BODIES.concat(MANDALAS).every((id) => Art.ids().includes(id)));
check("animation random name", Art.animation("random").name === "Random");
check("animation jupiter", Art.animation("JUPITER").name === "Jupiter");
check("unknown explicit falls back to earth", Art.resolveAnimation("nope", 1) === "earth");
check("empty is random", BODIES.concat(MANDALAS).includes(Art.resolveAnimation("", 7)));
check("random is stable", Art.resolveAnimation("random", 42) === Art.resolveAnimation("random", 42));
const rolled = new Set();
for (let s = 0; s < 40; s++) rolled.add(Art.resolveAnimation("random", s * 17 + 3));
check("random is not a constant", rolled.size > 1);
check("cycle wraps", Art.cycle(Art.ids()[Art.ids().length - 1], 1) === "random");
check("visualScale exhaled", Math.abs(Art.visualScale(0) - 0.42) < 1e-9);
check("visualScale inhaled", Art.visualScale(1) === 1);
check("maxCells odd", Art.maxCells(400) % 2 === 1);

function weight(ch) {
  if (!ch || ch === " ") return 0;
  const ramp = "·:+*#@";
  const i = ramp.indexOf(ch);
  if (i >= 0) return (i + 1) / ramp.length;
  return 0.7;
}

function grid(fig) {
  return Art.composite(fig).split("\n");
}

function cell(rows, c, r) {
  const line = rows[r] || "";
  return c < line.length ? line[c] : " ";
}

const earth = Art.frame("earth", { cells: 31, aspect: 0.5, timeMs: 0, fullness: 1 });
const earthRows = grid(earth);
const cx = (earth.cols - 1) / 2;
const cy = (earth.rows - 1) / 2;
check("earth center is ink", cell(earthRows, Math.round(cx), Math.round(cy)) !== " ");
check("earth corner is empty", cell(earthRows, 0, 0) === " ");
check("earth is wider than tall", earth.cols > earth.rows);
check("earth uses more than one layer", earth.layers.some((layer, i) => i > 0 && layer.text.trim() !== ""));

const j0 = Art.composite(Art.frame("jupiter", { cells: 31, aspect: 0.5, timeMs: 0, fullness: 1 }));
const j1 = Art.composite(Art.frame("jupiter", { cells: 31, aspect: 0.5, timeMs: 17000, fullness: 1 }));
check("jupiter rotates", j0 !== j1);
check("jupiter deterministic", j0 === Art.composite(Art.frame("jupiter", { cells: 31, aspect: 0.5, timeMs: 0, fullness: 1 })));

const saturn = Art.frame("saturn", { cells: 31, aspect: 0.5, timeMs: 0, fullness: 1 });
const saturnRows = grid(saturn);
check("saturn wider than a bare disk", saturn.cols > earth.cols);
let ringPastDisk = false;
const mid = Math.floor(saturn.rows / 2);
const diskEdge = saturn.disk / saturn.aspect;
for (let c = 0; c < saturn.cols; c++) {
  const ch = cell(saturnRows, c, mid);
  if ((ch === "-" || ch === "=" || ch === ":") && Math.abs(c - (saturn.cols - 1) / 2) > diskEdge + 0.5) ringPastDisk = true;
}
check("saturn ring glyph sits outside the disk", ringPastDisk);
check("saturn draws a ring glyph", saturnRows.some((line) => line.includes("=") || line.includes("-")));

function markupFree(fig) {
  return !Art.composite(fig).includes("<") && !Art.composite(fig).includes(">") && !Art.composite(fig).includes("&");
}
check(
  "no markup glyphs",
  BODIES.concat(MANDALAS).every((id) => markupFree(Art.frame(id, { cells: 21, aspect: 0.5, timeMs: 1000, fullness: 0.5 })))
);

function harmonic(fig, k) {
  const rows = grid(fig);
  const mx = (fig.cols - 1) / 2;
  const my = (fig.rows - 1) / 2;
  let re = 0;
  let im = 0;
  const samples = 96;
  const radius = Math.min(mx, my) * 0.62;
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    const c = Math.round(mx + Math.cos(theta) * radius / 0.5);
    const r = Math.round(my - Math.sin(theta) * radius);
    const w = weight(cell(rows, c, r));
    re += w * Math.cos(k * theta);
    im += w * Math.sin(k * theta);
  }
  return Math.sqrt(re * re + im * im) / samples;
}

for (const id of MANDALAS) {
  const fig = Art.frame(id, { cells: 31, aspect: 0.5, timeMs: 0, fullness: 0.6 });
  const h5 = harmonic(fig, 5);
  const h6 = harmonic(fig, 6);
  const h8 = harmonic(fig, 8);
  const h12 = harmonic(fig, 12);
  const dominant = Math.max(h8, h12, harmonic(fig, 4), harmonic(fig, 1), 0.02);
  check(id + " is not a 5-fold star", h5 < dominant);
  check(id + " is not a 6-fold star", h6 < dominant);
}

const irisShut = Art.frame("iris", { cells: 31, aspect: 0.5, timeMs: 0, fullness: 0 });
const irisOpen = Art.frame("iris", { cells: 31, aspect: 0.5, timeMs: 0, fullness: 1 });
function emptyNearCenter(fig) {
  const rows = grid(fig);
  const mx = Math.round((fig.cols - 1) / 2);
  const my = Math.round((fig.rows - 1) / 2);
  let n = 0;
  for (let y = -2; y <= 2; y++) {
    for (let x = -3; x <= 3; x++) if (cell(rows, mx + x, my + y) === " ") n++;
  }
  return n;
}
check("iris opens on inhale", emptyNearCenter(irisOpen) > emptyNearCenter(irisShut));

const sun = grid(Art.frame("sun", { cells: 31, aspect: 0.5, timeMs: 0, fullness: 1 }));
const sunCx = Math.round((Art.frame("sun", { cells: 31, aspect: 0.5, timeMs: 0, fullness: 1 }).cols - 1) / 2);
const sunCy = 15;
check("sun center brighter than a high-latitude limb", weight(cell(sun, sunCx, sunCy)) >= weight(cell(sun, sunCx, 4)));

console.log(`PlanetArt tests: ${pass} passed${process.exitCode ? " (WITH FAILURES)" : ""}`);
