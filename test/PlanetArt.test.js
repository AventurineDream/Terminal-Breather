// Node harness for PlanetArt.js — run with `node test/PlanetArt.test.js`.
// Strips the `.pragma library` line and checks the figures the overlay draws:
// catalog, random pick, breath scale, sphere shape, Saturn's rings, and that
// the mandalas are not 5- or 6-fold stars. Motion checks follow those.

const fs = require("fs");
const path = require("path");
const src = fs
  .readFileSync(path.join(__dirname, "..", "PlanetArt.js"), "utf8")
  .replace(/^\.pragma library\n/, "");
const Art = new Function(
  src +
    "\nreturn { FIGURES, frame, composite, resolveAnimation, visualScale, ids, cycle, animation, indexOf, maxCells, paintBody, paintMandala, ringGlyph, ringTilt, prominence, project, orbitMoons, idSeed, motionClock, spinOf, periodOf };"
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

const ALL = BODIES.concat(MANDALAS);
const OPTS = { cells: 31, aspect: 0.5 };

function figAt(id, timeMs, fullness) {
  return Art.frame(id, { cells: OPTS.cells, aspect: OPTS.aspect, timeMs, fullness });
}

function inkOf(fig) {
  return fig.layers.map((layer) => layer.text).join("\n");
}

function diskPoints() {
  const pts = [];
  for (let y = -0.8; y <= 0.8; y += 0.16) {
    for (let x = -0.8; x <= 0.8; x += 0.16) {
      if (x * x + y * y <= 0.72) pts.push([x, y]);
    }
  }
  return pts;
}

function sig(hit) {
  return hit && hit.ch !== " " ? hit.ch + hit.layer : "";
}

function clockFor(timeMs, fullness, spin) {
  const clock = Art.motionClock(timeMs, fullness);
  if (spin != null) clock.moons = Art.orbitMoons(spin, clock.fullness);
  return clock;
}

function bodyDelta(id, spinA, spinB, timeA, timeB, fullA, fullB) {
  const seed = Art.idSeed(id);
  const clockA = Art.motionClock(timeA, fullA);
  const clockB = Art.motionClock(timeB, fullB);
  let n = 0;
  for (const [sx, sy] of diskPoints()) {
    const a = Art.paintBody(id, sx, sy, 7, 5, spinA, timeA, seed, fullA, clockA);
    const b = Art.paintBody(id, sx, sy, 7, 5, spinB, timeB, seed, fullB, clockB);
    if (sig(a) !== sig(b)) n++;
  }
  return n;
}

function mandalaDelta(id, spin, timeA, timeB, fullness, step) {
  const clockA = clockFor(timeA, fullness, spin);
  const clockB = clockFor(timeB, fullness, spin);
  let n = 0;
  for (let y = -0.94; y <= 0.94; y += step) {
    for (let x = -0.94; x <= 0.94; x += step) {
      const a = Art.paintMandala(id, x, y, 2, 3, spin, fullness, timeA, clockA);
      const b = Art.paintMandala(id, x, y, 2, 3, spin, fullness, timeB, clockB);
      if (sig(a) !== sig(b)) n++;
    }
  }
  return n;
}

for (const id of ALL) {
  check(id + " moves within a few seconds", inkOf(figAt(id, 0, 0.7)) !== inkOf(figAt(id, 2700, 0.7)));
  const exhaled = figAt(id, 2700, 0);
  const inhaled = figAt(id, 2700, 1);
  check(
    id + " fullness changes ink",
    exhaled.cols === inhaled.cols &&
      exhaled.rows === inhaled.rows &&
      inhaled.scale > exhaled.scale &&
      inkOf(exhaled) !== inkOf(inhaled)
  );
}

check(
  "motion stays markup-free",
  ALL.every((id) => [0, 2700, 6000].every((t) => [0, 1].every((f) => markupFree(figAt(id, t, f)))))
);

for (const id of ["sun", "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"]) {
  check(id + " spin is legible", bodyDelta(id, 0.15, 0.15 + Math.PI / 2, 1200, 1200, 1, 1) >= 3);
}

check("moon does not spin", bodyDelta("moon", 0.2, 2.7, 1500, 1500, 1, 1) === 0);
const moonStill = Art.composite(figAt("moon", 0, 0.8));
const moonPeak = Art.composite(figAt("moon", 3000, 0.8));
check("moon librates within a breath", moonStill !== moonPeak);
check("moon libration stays bounded", (() => {
  for (let t = 4000; t <= 30000; t += 500) {
    if (Art.composite(figAt("moon", t, 0.8)) === moonStill) return true;
  }
  return false;
})());

check("mercury grain shimmers with spin fixed", bodyDelta("mercury", 0.4, 0.4, 0, 5200, 1, 1) >= 3);
check("mars dust drifts with spin fixed", bodyDelta("mars", 0.4, 0.4, 0, 5100, 1, 1) >= 3);
const marsSeed = Art.idSeed("mars");
const mars0 = Art.motionClock(0, 1);
const marsLate = Art.motionClock(8000, 1);
const wedge = Art.paintBody("mars", 0.85, 0.2, 4, 6, 0, 0, marsSeed, 1, mars0);
const wedgeLater = Art.paintBody("mars", 0.85, 0.2, 4, 6, 0, 8000, marsSeed, 1, marsLate);
const cap = Art.paintBody("mars", 0, 0.94, 4, 6, 0.2, 0, marsSeed, 1, mars0);
const capLater = Art.paintBody("mars", 0, 0.94, 4, 6, 0.2, 8000, marsSeed, 1, marsLate);
check(
  "mars wedge and cap stay while dust drifts",
  wedge &&
    wedgeLater &&
    wedge.layer === 2 &&
    wedgeLater.layer === 2 &&
    wedge.ch === wedgeLater.ch &&
    cap &&
    capLater &&
    cap.layer === 1 &&
    capLater.layer === 1 &&
    cap.ch === capLater.ch
);

check("jupiter belts undulate with spin fixed", bodyDelta("jupiter", 0.25, 0.25, 0, 2400, 1, 1) >= 3);
function spotCells(timeMs) {
  const seed = Art.idSeed("jupiter");
  const clock = Art.motionClock(timeMs, 1);
  let n = 0;
  for (let sy = -0.7; sy <= 0.1; sy += 0.08) {
    for (let sx = -0.15; sx <= 0.85; sx += 0.08) {
      const hit = Art.paintBody("jupiter", sx, sy, 8, 9, 0.15, timeMs, seed, 1, clock);
      if (hit && hit.layer === 2) n++;
    }
  }
  return n;
}
check("jupiter spot stays a spot while it drifts", spotCells(0) >= 2 && spotCells(2400) >= 2);

check("neptune clouds drift with spin fixed", bodyDelta("neptune", 0.3, 0.3, 0, 4500, 1, 1) >= 3);
check("uranus hood breathes with spin fixed", bodyDelta("uranus", 0.1, 0.1, 0, 2700, 1, 1) >= 2);

function ringShimmered() {
  const tilt = Art.ringTilt("saturn", 1);
  let changed = 0;
  for (let t = 1000; t <= 7000; t += 1000) {
    for (let rr = 1.3; rr <= 2.1; rr += 0.1) {
      for (const sign of [-1, 1]) {
        const a = Art.ringGlyph("saturn", sign * rr, 0, 0, 1, tilt);
        const b = Art.ringGlyph("saturn", sign * rr, 0, t, 1, tilt);
        if (a && b && a.ch !== b.ch) changed++;
      }
    }
  }
  return changed >= 1;
}
check("saturn ring shimmers in place", ringShimmered());

function gapHolds(timeMs, fullness) {
  const tilt = Art.ringTilt("saturn", fullness);
  for (let rr = 1.74; rr <= 1.84; rr += 0.02) {
    if (Art.ringGlyph("saturn", rr, 0, timeMs, fullness, tilt)) return false;
  }
  return !!(
    Art.ringGlyph("saturn", 1.55, 0, timeMs, fullness, tilt) &&
    Art.ringGlyph("saturn", 2.0, 0, timeMs, fullness, tilt)
  );
}
check("cassini gap stays open", [0, 2500, 6000, 9000].every((t) => gapHolds(t, 0) && gapHolds(t, 1)));
function tiltMoves(id) {
  const low = Art.ringTilt(id, 0);
  const high = Art.ringTilt(id, 1);
  let changed = 0;
  for (let sy = 0.12; sy <= 0.48; sy += 0.06) {
    for (let sx = -1.5; sx <= 1.5; sx += 0.1) {
      const a = Art.ringGlyph(id, sx, sy, 0, 0, low);
      const b = Art.ringGlyph(id, sx, sy, 0, 1, high);
      if (sig(a) !== sig(b)) changed++;
    }
  }
  return changed >= 2;
}
check("ring tilt opens on inhale", tiltMoves("saturn") && tiltMoves("uranus"));

function ringSide(timeMs, fullness) {
  const fig = Art.frame("saturn", { cells: 31, aspect: 0.5, timeMs, fullness });
  const layers = fig.layers.map((layer) => layer.text.split("\n"));
  const clock = Art.motionClock(timeMs, fullness);
  const spin = Art.spinOf("saturn", timeMs);
  const seed = Art.idSeed("saturn");
  const cx = (fig.cols - 1) / 2;
  const cy = (fig.rows - 1) / 2;
  let far = 0;
  let near = 0;
  for (let r = 0; r < fig.rows; r++) {
    for (let c = 0; c < fig.cols; c++) {
      const sx = ((c - cx) * fig.aspect) / fig.disk;
      const sy = (cy - r) / fig.disk;
      const body = Art.paintBody("saturn", sx, sy, c, r, spin, timeMs, seed, fullness, clock);
      const ring = Art.ringGlyph("saturn", sx, sy, timeMs, fullness);
      if (!body || !ring || Math.abs(sy) < 0.02) continue;
      let actual = null;
      for (let L = 0; L < layers.length; L++) {
        const ch = cell(layers[L], c, r);
        if (ch !== " ") actual = { ch, layer: L };
      }
      // '+' is also body stipple: compare the actual layer and ink instead
      // of treating every '+' on the far hemisphere as a leaked ring.
      const expected = sy > 0 ? body : ring;
      if (sig(actual) !== sig(expected)) return false;
      if (sy > 0) far++;
      else near++;
    }
  }
  return far > 0 && near > 0;
}
check("saturn rings keep front occlusion", ringSide(0, 1) && ringSide(2500, 0.4));

function uranusRingOffDisk() {
  const fig = Art.frame("uranus", { cells: 31, aspect: 0.5, timeMs: 0, fullness: 1 });
  const rows = grid(fig);
  const cx = (fig.cols - 1) / 2;
  const cy = (fig.rows - 1) / 2;
  let off = false;
  let on = false;
  for (let r = 0; r < fig.rows; r++) {
    for (let c = 0; c < fig.cols; c++) {
      if (cell(rows, c, r) !== "-") continue;
      const sx = ((c - cx) * fig.aspect) / fig.disk;
      const sy = (cy - r) / fig.disk;
      if (sx * sx + sy * sy <= 1.01) on = true;
      else off = true;
    }
  }
  return off && !on;
}
check("uranus ring stays off the disk", uranusRingOffDisk());

function symmetryOk(id, timeMs, fullness) {
  const fig = figAt(id, timeMs, fullness);
  const text = Art.composite(fig);
  if (text.includes("<") || text.includes(">") || text.includes("&")) return false;
  const h5 = harmonic(fig, 5);
  const h6 = harmonic(fig, 6);
  const dominant = Math.max(harmonic(fig, 4), harmonic(fig, 8), harmonic(fig, 12), harmonic(fig, 1), 0.02);
  return h5 < dominant && h6 < dominant;
}
for (const id of MANDALAS) {
  check(
    id + " symmetry holds in motion",
    [0, 1800, 4200].every((t) => [0, 0.45, 1].every((f) => symmetryOk(id, t, f)))
  );
}

check("lattice spokes shimmer", mandalaDelta("lattice", 0.2, 0, 2200, 0.8, 0.04) >= 2);
check(
  "lattice inner ring still tracks fullness",
  (() => {
    const ang = 0.26;
    const radius = 0.23;
    const sx = Math.cos(ang) * radius;
    const sy = Math.sin(ang) * radius;
    const shut = Art.paintMandala("lattice", sx, sy, 1, 1, 0, 0, 0, clockFor(0, 0));
    const open = Art.paintMandala("lattice", sx, sy, 1, 1, 0, 1, 0, clockFor(0, 1));
    return !!(shut && !open);
  })()
);
check("petal sways without breaking eightfold", mandalaDelta("petal", 0.3, 0, 2500, 1, 0.04) >= 2 && symmetryOk("petal", 2500, 0.8));

check("orbits moons ride every track", (() => {
  const spin = 0.4;
  const moons = Art.orbitMoons(spin, 1);
  const clock = clockFor(0, 1, spin);
  const tracks = new Set(moons.map((m) => m.track));
  if (tracks.size !== 3 || moons.length !== 7) return false;
  return moons.every((m) => {
    const hit = Art.paintMandala("orbits", m.x, m.y, 1, 1, spin, 1, 0, clock);
    return hit && hit.ch === "o" && hit.layer === 2;
  });
})());
check("moons outrank track dots", (() => {
  const spin = 1.1;
  const clock = clockFor(800, 0.2, spin);
  return Art.orbitMoons(spin, 0.2).every((m) => {
    const hit = Art.paintMandala("orbits", m.x, m.y, 1, 1, spin, 0.2, 800, clock);
    return hit && hit.ch !== "·" && hit.layer === 2;
  });
})());
check("orbits moons answer fullness", (() => {
  const spin = 0.7;
  const small = Art.orbitMoons(spin, 0);
  const clockOut = clockFor(0, 0, spin);
  const clockIn = clockFor(0, 1, spin);
  const moonish = (hit) => hit && (hit.ch === "o" || hit.ch === "+") && hit.layer === 2;
  return small.some((m) => {
    const rad = Math.hypot(m.x, m.y) || 1;
    for (let d = 0.03; d <= 0.08; d += 0.004) {
      const sx = m.x * (1 + d / rad);
      const sy = m.y * (1 + d / rad);
      const out = Art.paintMandala("orbits", sx, sy, 1, 1, spin, 0, 0, clockOut);
      const inn = Art.paintMandala("orbits", sx, sy, 1, 1, spin, 1, 0, clockIn);
      if (!moonish(out) && moonish(inn)) return true;
    }
    return false;
  });
})());
check("orbits moons travel on every track", (() => {
  const a = Art.orbitMoons(Art.spinOf("orbits", 0), 1);
  const b = Art.orbitMoons(Art.spinOf("orbits", 5000), 1);
  const tracks = [0.28, 0.54, 0.82];
  return tracks.every((track) => {
    const ma = a.filter((m) => Math.abs(m.track - track) < 1e-6);
    const mb = b.filter((m) => Math.abs(m.track - track) < 1e-6);
    return ma.length > 0 && ma.length === mb.length && ma.every((m, i) => Math.hypot(m.x - mb[i].x, m.y - mb[i].y) > 0.04);
  });
})());

check(
  "exhaled prominence keeps its crest",
  Art.prominence(Math.cos(-2.25) * 1.065, Math.sin(-2.25) * 1.065, 0, 0, Art.motionClock(0, 0))
);

check("sun prominences grow on inhale", (() => {
  function maxReach(fullness) {
    const clock = Art.motionClock(1000, fullness);
    let maxR = 0;
    for (let k = 0; k < 240; k++) {
      const ang = (k / 240) * Math.PI * 2;
      const cx = Math.cos(ang);
      const sy = Math.sin(ang);
      for (let r = 1.03; r <= 1.26; r += 0.012) {
        if (Art.prominence(cx * r, sy * r, 1000, fullness, clock) && r > maxR) maxR = r;
      }
    }
    return maxR;
  }
  return maxReach(1) > maxReach(0) + 0.03;
})());

console.log(`PlanetArt tests: ${pass} passed${process.exitCode ? " (WITH FAILURES)" : ""}`);
