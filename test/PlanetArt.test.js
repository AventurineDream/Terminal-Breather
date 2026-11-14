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
    "\nreturn { FIGURES, frame, composite, resolveAnimation, visualScale, ids, cycle, animation, indexOf, maxCells, emptyFrame };"
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

// --- Second-pass additions (Nov 13 2026): catalog, cycle, random,
// case handling, size parity, accent layers, mandala breath, shape,
// scale, caps, continuity. From audits/consistency-tests.md §4.1.

function approx(a, b, eps) {
  return Math.abs(a - b) < (eps === undefined ? 1e-9 : eps);
}

function layerCounts(fig) {
  // Non-space cells per layer; split/join first so "\n" is not counted.
  return fig.layers.map((l) => l.text.split("\n").join("").replace(/ /g, "").length);
}

function diskRatio(id, aspect) {
  // On-screen disk diameter as a fraction of circleMax, modelling the
  // overlay's own fit (BreatheOverlay.qml figureFontPx): ringed figures
  // (saturn, uranus) are fit by disk diameter so the disk fills the stage
  // and only the rings extend past it; all others are fit by grid extent.
  // Font-independent.
  const fig = Art.frame(id, { cells: 31, aspect: aspect, timeMs: 0, fullness: 1 });
  const need = (id === "saturn" || id === "uranus") ? 2 * fig.disk : Math.max(fig.cols * aspect, fig.rows);
  return (2 * fig.disk) / need;
}

// --- Catalog: exact, ordered, no drift ---
check("catalog is exactly 14 figures", Art.FIGURES.length === 14);
check(
  "ids is random plus the 14 figures, no duplicates",
  Art.ids().length === 15 &&
    new Set(Art.ids()).size === 15 &&
    Art.FIGURES.every((f) => Art.ids().includes(f.id))
);
check(
  "catalog order is sun..neptune then 4 mandalas",
  JSON.stringify(Art.FIGURES.map((f) => f.id)) ===
    JSON.stringify(["sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune", "iris", "orbits", "petal", "lattice"])
);
check(
  "every figure has id, name, kind body|mandala, hint",
  Art.FIGURES.every((f) => f.id && f.name && (f.kind === "body" || f.kind === "mandala") && f.hint)
);

// --- Cycle: full round-trips, both directions, rapid presses ---
check(
  "cycle: 15 forward steps return to start, every entry",
  Art.ids().every((id) => {
    let c = id;
    for (let i = 0; i < 15; i++) c = Art.cycle(c, 1);
    return c === id;
  })
);
check(
  "cycle: 15 backward steps return to start, every entry",
  Art.ids().every((id) => {
    let c = id;
    for (let i = 0; i < 15; i++) c = Art.cycle(c, -1);
    return c === id;
  })
);
check(
  "cycle: 15 forward steps from random visit every entry exactly once",
  (() => {
    let c = "random";
    const seen = new Set();
    for (let i = 0; i < 15; i++) {
      c = Art.cycle(c, 1);
      seen.add(c);
    }
    return seen.size === 15 && Art.ids().every((id) => seen.has(id));
  })()
);
check("cycle: backward wrap random -> lattice", Art.cycle("random", -1) === "lattice");
check(
  "cycle: unknown input steps from random (fwd sun, back lattice)",
  Art.cycle("nope", 1) === "sun" && Art.cycle("nope", -1) === "lattice"
);
check(
  "cycle: 100 rapid forward presses equal 10 (100 mod 15)",
  Art.ids().every((id) => {
    let a = id;
    let b = id;
    for (let i = 0; i < 100; i++) a = Art.cycle(a, 1);
    for (let i = 0; i < 10; i++) b = Art.cycle(b, 1);
    return a === b;
  })
);

// --- Random: distribution, not just "not constant" ---
check(
  "random: 13000 consecutive seeds hit all 14 figures, none dominant",
  (() => {
    const counts = {};
    for (let s = 0; s < 13000; s++) {
      const id = Art.resolveAnimation("random", s);
      counts[id] = (counts[id] || 0) + 1;
    }
    const vals = Object.values(counts);
    return Object.keys(counts).length === 14 && Math.min.apply(null, vals) > 600 && Math.max.apply(null, vals) < 1300;
  })()
);
check(
  "random: never resolves to the literal id 'random'",
  (() => {
    for (let s = 0; s < 2000; s++) if (Art.resolveAnimation("random", s) === "random") return false;
    return true;
  })()
);
check(
  "random: same seed, same figure (stable per millisecond)",
  Art.resolveAnimation("random", 1794000000123) === Art.resolveAnimation("random", 1794000000123)
);

// --- Case + unknown handling ---
check("frame: uppercase id renders that figure, not earth", Art.frame("JUPITER", { cells: 21 }).id === "jupiter");
check("frame: unknown id falls back to earth", Art.frame("nope", { cells: 21 }).id === "earth");
check("animation: 'RANDOM' is the Random choice", Art.animation("RANDOM") && Art.animation("RANDOM").name === "Random");
check(
  "animation: unknown id is null (panel shows 'Random' fallback)",
  Art.animation("garbage") === null && Art.animation("earth ") === null
);
check(
  "resolveAnimation: unknown id falls back to earth, not random",
  Art.resolveAnimation("garbage", 1) === "earth" && Art.resolveAnimation("earth ", 1) === "earth"
);

// --- On-screen size parity (the headline gap) ---
check(
  "size parity: every figure's on-screen disk is 0.70..1.00 of circleMax (aspect 0.5)",
  Art.FIGURES.every((f) => {
    const r = diskRatio(f.id, 0.5);
    return r >= 0.7 && r <= 1.0;
  })
);
check(
  "size parity: same band at aspect 0.46 (JetBrainsMono-ish)",
  Art.FIGURES.every((f) => {
    const r = diskRatio(f.id, 0.46);
    return r >= 0.7 && r <= 1.0;
  })
);
// Ringed planets are fit by disk diameter (BreatheOverlay.qml figureFontPx),
// so the disk fills the stage and the font escapes the 8px floor; these two
// pin the font and the rings-on-screen. adv/line 0.6/1.3 are the
// JetBrainsMono assumption — re-measure on the live machine if they differ.
check(
  "size parity: saturn's disk-fit font escapes the 8px floor at 1080p",
  (() => {
    const circleMax = 410;
    const line = 1.3;
    const aspect = 0.46;
    const fig = Art.frame("saturn", { maxCells: Art.maxCells(circleMax), aspect: aspect, timeMs: 0, fullness: 1 });
    return circleMax / (2 * fig.disk * line) >= 8;
  })()
);
check(
  "size parity: saturn's rings stay on a 1920-wide screen at 1080p",
  (() => {
    const circleMax = 410;
    const adv = 0.6;
    const line = 1.3;
    const aspect = 0.46;
    const fig = Art.frame("saturn", { maxCells: Art.maxCells(circleMax), aspect: aspect, timeMs: 0, fullness: 1 });
    const fontPx = Math.max(8, circleMax / (2 * fig.disk * line));
    return fig.cols * adv * fontPx <= 1920;
  })()
);

// --- Accent layers: every body must show its signature sometimes ---
check(
  "accent: mercury shows its bright layer in >=25% of frames over a full spin",
  (() => {
    let lit = 0;
    let n = 0;
    for (let t = 0; t <= 80000; t += 1000) {
      n++;
      if (layerCounts(Art.frame("mercury", { cells: 31, aspect: 0.5, timeMs: t, fullness: 1 }))[1] > 0) lit++;
    }
    return lit / n >= 0.25;
  })()
);
check(
  "accent: every body shows an accent layer (L1 or L2) at some point in its spin",
  ["sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune"].every((id) => {
    const period = { sun: 90000, mercury: 80000, venus: 74000, earth: 52000, moon: 70000, mars: 56000, jupiter: 34000, saturn: 42000, uranus: 64000, neptune: 38000 }[id];
    for (let t = 0; t <= period; t += Math.round(period / 12)) {
      const c = layerCounts(Art.frame(id, { cells: 31, aspect: 0.5, timeMs: t, fullness: 1 }));
      if (c[1] + c[2] > 0) return true;
    }
    return false;
  })
);
check(
  "accent: moon keeps Tycho/rays visible across its libration",
  (() => {
    for (let t = 0; t <= 70000; t += 5000)
      if (layerCounts(Art.frame("moon", { cells: 31, aspect: 0.5, timeMs: t, fullness: 1 }))[1] < 5) return false;
    return true;
  })()
);

// --- Mandala breath + thin features ---
function irisEmpty(f) {
  const fig = Art.frame("iris", { cells: 31, aspect: 0.5, timeMs: 0, fullness: f });
  const rows = Art.composite(fig).split("\n");
  const mx = Math.round((fig.cols - 1) / 2);
  const my = Math.round((fig.rows - 1) / 2);
  let n = 0;
  for (let y = -7; y <= 7; y++)
    for (let x = -7; x <= 7; x++) if ((rows[my + y] || "")[mx + x] === " ") n++;
  return n;
}
check(
  "iris: pupil opens gradually, empty count strictly increases with fullness",
  (() => {
    let prev = -1;
    for (let f = 0; f <= 1.0001; f += 0.1) {
      const e = irisEmpty(f);
      if (e <= prev) return false;
      prev = e;
    }
    return true;
  })()
);
check(
  "lattice: inner ring moves outward as fullness rises",
  (() => {
    function ringAt(f) {
      const fig = Art.frame("lattice", { cells: 45, aspect: 0.5, timeMs: 0, fullness: f });
      const rows = Art.composite(fig).split("\n");
      const my = Math.round((fig.rows - 1) / 2);
      const mx = Math.round((fig.cols - 1) / 2);
      const line = rows[my];
      for (let c = mx + 1; c < line.length; c++) if (line[c] === "·" || line[c] === "o") return c - mx;
      return -1;
    }
    return ringAt(0) < ringAt(1);
  })()
);
check(
  "orbits: all 7 moons drawn (as 'o' or '+') in every sampled frame",
  (() => {
    for (let t = 0; t < 120000; t += 5000) {
      const comp = Art.composite(Art.frame("orbits", { cells: 31, aspect: 0.5, timeMs: t, fullness: 1 }));
      const moons = comp.split("o").length - 1 + (comp.split("+").length - 1);
      if (moons < 7) return false;
    }
    return true;
  })()
);
check(
  "thin features survive at the smallest overlay size (cells=21)",
  (() => {
    function counts(id, chs) {
      const comp = Art.composite(Art.frame(id, { cells: 21, aspect: 0.5, timeMs: 0, fullness: 0.6 }));
      return chs.reduce((n, ch) => n + (comp.split(ch).length - 1), 0);
    }
    return (
      counts("uranus", ["-"]) >= 8 &&
      counts("orbits", ["·"]) >= 50 &&
      counts("lattice", ["-", "|", "/", "\\"]) >= 40 &&
      counts("saturn", ["=", "-"]) >= 100
    );
  })()
);

// --- Shape, scale, caps, continuity ---
check(
  "shape: every figure has odd cols and rows at cells 15/21/31/45",
  [15, 21, 31, 45].every((cells) =>
    Art.FIGURES.every((f) => {
      const fig = Art.frame(f.id, { cells: cells, aspect: 0.5, timeMs: 0, fullness: 1 });
      return fig.cols % 2 === 1 && fig.rows % 2 === 1;
    })
  )
);
check(
  "shape: composite and every layer are fig.rows lines of fig.cols chars",
  Art.FIGURES.every((f) => {
    const fig = Art.frame(f.id, { cells: 31, aspect: 0.5, timeMs: 0, fullness: 1 });
    const rows = Art.composite(fig).split("\n");
    if (rows.length !== fig.rows || rows.some((r) => r.length !== fig.cols)) return false;
    return fig.layers.every((l) => {
      const lr = l.text.split("\n");
      return lr.length === fig.rows && lr.every((r) => r.length === fig.cols);
    });
  })
);
check(
  "scale: every figure is 0.42 exhaled, 0.71 half, 1 inhaled",
  Art.FIGURES.every(
    (f) =>
      approx(Art.frame(f.id, { cells: 21, aspect: 0.5, timeMs: 0, fullness: 0 }).scale, 0.42) &&
      approx(Art.frame(f.id, { cells: 21, aspect: 0.5, timeMs: 0, fullness: 0.5 }).scale, 0.71) &&
      Art.frame(f.id, { cells: 21, aspect: 0.5, timeMs: 0, fullness: 1 }).scale === 1
  )
);
check("frame: huge cells request is capped at 45 rows", Art.frame("earth", { cells: 200 }).rows <= 45);
check("frame: NaN fullness still yields a finite scale", Number.isFinite(Art.frame("earth", { fullness: NaN }).scale));
check("visualScale: NaN yields a finite scale", Number.isFinite(Art.visualScale(NaN)));
check(
  "visualScale: out-of-range fullness clamps (not NaN, not <0.42, not >1)",
  Art.visualScale(-1) === 0.42 && Art.visualScale(2) === 1
);
check(
  "emptyFrame: 1x1 transparent blank",
  (() => {
    const e = Art.emptyFrame();
    return e.cols === 1 && e.rows === 1 && e.layers.length === 1 && e.layers[0].color === "transparent" && e.layers[0].text === " ";
  })()
);
// The hard rule, as a test: adjacent 50ms frames (the overlay's timer tick)
// must change only a small fraction of cells — no skipping, jumping, or
// restarting. Jupiter mean 2.7 changed chars/tick, max 12 of 1891 (0.6%);
// Earth clouds mean 8.1, max 19 (1.0%).
check(
  "continuity: no jumps — adjacent 50ms frames change <3% of cells (jupiter, earth, 5s)",
  (() => {
    const ids = ["jupiter", "earth"];
    for (let k = 0; k < ids.length; k++) {
      let prev = Art.composite(Art.frame(ids[k], { cells: 31, aspect: 0.5, timeMs: 0, fullness: 1 }));
      const total = 31 * 61;
      for (let t = 50; t <= 5000; t += 50) {
        const cur = Art.composite(Art.frame(ids[k], { cells: 31, aspect: 0.5, timeMs: t, fullness: 1 }));
        let ch = 0;
        for (let i = 0; i < cur.length; i++) if (cur[i] !== prev[i]) ch++;
        if (ch / total >= 0.03) return false;
        prev = cur;
      }
    }
    return true;
  })()
);
check(
  "maxCells: bounds 21..45",
  Art.maxCells(1) === 21 && Art.maxCells(100) === 21 && Art.maxCells(300) === 25 && Art.maxCells(540) === 45 && Art.maxCells(10000) === 45
);
check(
  "determinism: all figures identical across repeat frames",
  Art.FIGURES.every((f) =>
    [0, 12345].every((t) =>
      [0, 0.5, 1].every(
        (fl) =>
          Art.composite(Art.frame(f.id, { cells: 21, aspect: 0.5, timeMs: t, fullness: fl })) ===
          Art.composite(Art.frame(f.id, { cells: 21, aspect: 0.5, timeMs: t, fullness: fl }))
      )
    )
  )
);

// --- Grok polish (Sun, Mercury, Venus, Earth, Moon) ---
// Pins the features this pass made readable. Does not replace the
// second-pass accent/continuity checks above.

function southTaper(id, cells) {
  const fig = Art.frame(id, { cells: cells, aspect: 0.5, timeMs: 0, fullness: 1 });
  const rows = Art.composite(fig).split("\n");
  const widths = rows.map((line) => {
    let a = -1;
    let b = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== " ") {
        if (a < 0) a = i;
        b = i;
      }
    }
    return b < 0 ? 0 : b - a + 1;
  });
  const ink = [];
  widths.forEach((v, i) => {
    if (v) ink.push([i, v]);
  });
  const mid = ink[Math.floor(ink.length / 2)][0];
  for (let k = 1; k < ink.length; k++) {
    if (ink[k][0] !== ink[k - 1][0] + 1) return false;
    if (ink[k][0] > mid && ink[k][1] > ink[k - 1][1] + 1) return false;
  }
  return ink.length > 4;
}

check(
  "grok: sun has no @ blob at 21/37/45",
  [21, 37, 45].every(
    (cells) => !Art.composite(Art.frame("sun", { cells: cells, aspect: 0.5, timeMs: 0, fullness: 1 })).includes("@")
  )
);
check(
  "grok: sun prominences attach at the limb and do not form a corona blob",
  (() => {
    function promo(cells) {
      const fig = Art.frame("sun", { cells: cells, aspect: 0.5, timeMs: 0, fullness: 1 });
      const rows = fig.layers[1].text.split("\n");
      const cx = (fig.cols - 1) / 2;
      const cy = (fig.rows - 1) / 2;
      let n = 0;
      let minR = 9;
      let maxR = 0;
      for (let r = 0; r < fig.rows; r++) {
        for (let c = 0; c < fig.cols; c++) {
          if (rows[r][c] === " ") continue;
          const sx = ((c - cx) * fig.aspect) / fig.disk;
          const sy = (cy - r) / fig.disk;
          const rr = Math.sqrt(sx * sx + sy * sy);
          if (rr <= 1.02) continue;
          n++;
          if (rr < minR) minR = rr;
          if (rr > maxR) maxR = rr;
        }
      }
      return n >= (cells < 30 ? 12 : 40) && n <= (cells < 30 ? 90 : 180) && minR < 1.08 && maxR < 1.28;
    }
    return promo(21) && promo(37);
  })()
);
check(
  "grok: mercury shows crater floors and rims at 21 and 37",
  [21, 37].every((cells) => {
    const c = layerCounts(Art.frame("mercury", { cells: cells, aspect: 0.5, timeMs: 0, fullness: 1 }));
    return c[1] >= 20 && c[2] >= 15;
  })
);
check(
  "grok: venus chevron opens into the lit half and has both arms",
  (() => {
    const fig = Art.frame("venus", { cells: 37, aspect: 0.5, timeMs: 0, fullness: 1 });
    const rows = fig.layers[2].text.split("\n");
    const cx = (fig.cols - 1) / 2;
    const cy = (fig.rows - 1) / 2;
    let n = 0;
    let sx = 0;
    let above = 0;
    let below = 0;
    for (let r = 0; r < fig.rows; r++) {
      for (let c = 0; c < fig.cols; c++) {
        if (rows[r][c] === " ") continue;
        n++;
        sx += c;
        if (r < cy - 1) above++;
        if (r > cy + 1) below++;
      }
    }
    return n >= 40 && sx / n < cx - 4 && above >= 15 && below >= 15;
  })()
);
check(
  "grok: earth south limb tapers with no detached arc at 21 and 37",
  [21, 37].every((cells) => southTaper("earth", cells))
);
check(
  "grok: earth near side has two landmasses and no specular @",
  (() => {
    const fig = Art.frame("earth", { cells: 37, aspect: 0.5, timeMs: 0, fullness: 1 });
    if (Art.composite(fig).includes("@")) return false;
    const land = fig.layers[1].text.split("\n");
    let split = 0;
    for (let r = Math.floor(fig.rows * 0.35); r < Math.floor(fig.rows * 0.7); r++) {
      let runs = 0;
      let on = false;
      for (let c = 0; c < land[r].length; c++) {
        const ink = land[r][c] !== " ";
        if (ink && !on) runs++;
        on = ink;
      }
      if (runs >= 2) split++;
    }
    return split >= 4;
  })()
);
check(
  "grok: earth far side keeps land, not a blank ocean",
  layerCounts(Art.frame("earth", { cells: 37, aspect: 0.5, timeMs: 26000, fullness: 1 }))[1] >= 40
);
check(
  "grok: earth cloud deck is on the near-side ocean",
  (() => {
    const fig = Art.frame("earth", { cells: 37, aspect: 0.5, timeMs: 0, fullness: 1 });
    const rows = fig.layers[2].text.split("\n");
    let n = 0;
    const a = Math.floor(rows.length * 0.25);
    const b = Math.floor(rows.length * 0.75);
    for (let r = a; r < b; r++) n += rows[r].replace(/ /g, "").length;
    return n >= 20;
  })()
);
check(
  "grok: moon maria sit on the dark layer",
  layerCounts(Art.frame("moon", { cells: 37, aspect: 0.5, timeMs: 0, fullness: 1 }))[2] >= 80
);

console.log(`PlanetArt tests: ${pass} passed${process.exitCode ? " (WITH FAILURES)" : ""}`);
