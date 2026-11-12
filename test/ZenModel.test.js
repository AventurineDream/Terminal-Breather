// Node harness for ZenModel.js — run with `node test/ZenModel.test.js`.
// Strips the `.pragma library` line, loads the pure functions in node,
// and asserts built-ins, custom merge, validation, ramp, and purity.
// No shell needed; the QML layer (FileView timing, panel wiring) is
// reviewed by diff and verified on dooracle instead.
const fs = require("fs");
const path = require("path");
const src = fs
  .readFileSync(path.join(__dirname, "..", "ZenModel.js"), "utf8")
  .replace(/^\.pragma library\n/, "");
const factory = new Function(
  src +
    "\nreturn { PATTERNS, PATTERN_ORDER, pattern, cycleSeconds, breathAt, rampScale, rampBaseTime, parseCustomPatterns, resolvePatterns, parseStats, addMinutes, streakDays, weekSeries, formatRemaining };"
);
const M = factory();

let pass = 0;
function check(name, cond) {
  if (!cond) {
    console.error("FAIL:", name);
    process.exitCode = 1;
  } else {
    pass++;
  }
}
function approx(a, b, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

// --- Built-ins unchanged ---
check("box name", M.pattern("box").name === "Box breathing");
check("box cycle 16", M.cycleSeconds(M.pattern("box")) === 16);
check("478 cycle 19", M.cycleSeconds(M.pattern("478")) === 19);
check("coherent cycle 11", M.cycleSeconds(M.pattern("coherent")) === 11);
check("unknown falls back to box", M.pattern("nope").key === "box");
check("case-insensitive", M.pattern("BOX").key === "box");
check("empty falls back to box", M.pattern("").key === "box");
check("breathAt box t=0", M.breathAt(M.pattern("box"), 0).label === "Breathe in");
check("breathAt box t=5 hold", M.breathAt(M.pattern("box"), 5).label === "Hold");

// --- Empty / missing config ---
let r0 = M.resolvePatterns("");
check("empty config order", JSON.stringify(r0.order) === '["box","478","coherent"]');
check("empty config customs", r0.customs.length === 0);
check("null config", M.resolvePatterns(null).order.length === 3);
check("malformed JSON", M.resolvePatterns("{oops").order.length === 3);
check("patterns not array", M.resolvePatterns('{"patterns": {}}').order.length === 3);

// --- Example file ---
const exampleRaw = fs.readFileSync(
  path.join(__dirname, "..", "patterns.example.json"),
  "utf8"
);
let r1 = M.resolvePatterns(exampleRaw);
check(
  "example order",
  JSON.stringify(r1.order) ===
    '["box","478","coherent","slow-6","calm-466","breath-of-fire"]'
);
check("slow-6 name", r1.map["slow-6"].name === "Slow 6");
check("slow-6 cycle 12", M.cycleSeconds(r1.map["slow-6"]) === 12);
check("calm-466 cycle 16", M.cycleSeconds(r1.map["calm-466"]) === 16);
let b1 = M.breathAt(r1.map["slow-6"], 3);
check("slow-6 t=3 inhale", b1.label === "Breathe in" && approx(b1.fullness, 0.5));
let b2 = M.breathAt(r1.map["slow-6"], 9);
check("slow-6 t=9 exhale", b2.label === "Breathe out" && approx(b2.fullness, 0.5));
let b3 = M.breathAt(r1.map["calm-466"], 5);
check("calm-466 t=5 hold", b3.label === "Hold" && b3.secsLeft === 5);
check(
  "pattern() resolves custom with map",
  M.pattern("slow-6", r1.map).name === "Slow 6"
);
check(
  "pattern() without map still falls back",
  M.pattern("slow-6").key === "box"
);

// --- Validation: every bad entry skipped, good ones kept ---
const bad = JSON.stringify({
  patterns: [
    { key: "box", name: "Hijack", phases: [{ label: "In", secs: 1, to: 1 }, { label: "Out", secs: 1, to: 0 }] },
    { key: "BAD KEY!", name: "Bad", phases: [{ label: "In", secs: 1, to: 1 }, { label: "Out", secs: 1, to: 0 }] },
    { key: "one-phase", name: "One", phases: [{ label: "In", secs: 1, to: 1 }] },
    { key: "zero-secs", name: "Zero", phases: [{ label: "In", secs: 0, to: 1 }, { label: "Out", secs: 1, to: 0 }] },
    { key: "bad-to", name: "BadTo", phases: [{ label: "In", secs: 1, to: 2 }, { label: "Out", secs: 1, to: 0 }] },
    { key: "no-name", phases: [{ label: "In", secs: 1, to: 1 }, { label: "Out", secs: 1, to: 0 }] },
    { key: 42, name: "Num", phases: [{ label: "In", secs: 1, to: 1 }, { label: "Out", secs: 1, to: 0 }] },
    { key: "dup", name: "First", phases: [{ label: "In", secs: 2, to: 1 }, { label: "Out", secs: 2, to: 0 }] },
    { key: "DUP", name: "Second", phases: [{ label: "In", secs: 3, to: 1 }, { label: "Out", secs: 3, to: 0 }] },
    { key: "good-one", name: "Good", hint: "kept", phases: [{ label: "In", secs: 4, to: 1 }, { label: "Out", secs: 4, to: 0 }] },
  ],
});
let r2 = M.resolvePatterns(bad);
check(
  "bad entries skipped, good kept",
  JSON.stringify(r2.order) === '["box","478","coherent","dup","good-one"]'
);
check("dup keeps first", M.cycleSeconds(r2.map["dup"]) === 4);
check("good-one hint kept", r2.map["good-one"].hint === "kept");
check("box not hijacked", M.pattern("box", r2.map).name === "Box breathing");

// --- Purity: no accumulation across reloads ---
let ra = M.resolvePatterns(exampleRaw);
let rb = M.resolvePatterns(exampleRaw);
check("repeat resolve identical", JSON.stringify(ra.order) === JSON.stringify(rb.order));
let rc = M.resolvePatterns("");
check("resolve empty after custom resets", JSON.stringify(rc.order) === '["box","478","coherent"]');

// --- Tempo ramp + breath of fire ---
const fire = r1.map["breath-of-fire"];
check("fire exists", !!fire && fire.name === "Breath of Fire");
check("fire cycle 1", M.cycleSeconds(fire) === 1);
check(
  "fire ramp kept",
  JSON.stringify(fire.ramp) === '{"from":2,"to":0.5,"overSecs":60}'
);
check("rampScale t=0", M.rampScale(fire, 0) === 2);
check("rampScale t=30", approx(M.rampScale(fire, 30), 1.25));
check("rampScale t=60", M.rampScale(fire, 60) === 0.5);
check("rampScale t=120 holds", M.rampScale(fire, 120) === 0.5);
check("no ramp scale 1", M.rampScale(M.pattern("box"), 30) === 1);
check("rampBaseTime no ramp", M.rampBaseTime(M.pattern("box"), 42) === 42);
check("rampBaseTime t=30", approx(M.rampBaseTime(fire, 30), 18.8001, 0.01));
check("rampBaseTime t=60", approx(M.rampBaseTime(fire, 60), 55.4518, 0.01));
check("rampBaseTime t=120", approx(M.rampBaseTime(fire, 120), 175.4518, 0.01));
const constRamp = {
  phases: [{ label: "In", secs: 1, to: 1 }, { label: "Out", secs: 1, to: 0 }],
  ramp: { from: 2, to: 2, overSecs: 60 },
};
check("constant ramp halves", M.rampBaseTime(constRamp, 60) === 30);
const slowDown = {
  phases: [{ label: "In", secs: 1, to: 1 }, { label: "Out", secs: 1, to: 0 }],
  ramp: { from: 0.5, to: 2, overSecs: 60 },
};
check("rampScale slowing", M.rampScale(slowDown, 0) === 0.5 && M.rampScale(slowDown, 60) === 2);
check("rampBaseTime slowing", approx(M.rampBaseTime(slowDown, 60), 55.4518, 0.01));
let f0 = M.breathAt(fire, 0);
check("fire t=0 inhale", f0.label === "In" && approx(f0.fullness, 0) && f0.secsLeft === 1);
let f30 = M.breathAt(fire, 30);
check("fire t=30 exhale", f30.label === "Out" && approx(f30.fullness, 0.3455, 0.01));
let f120 = M.breathAt(fire, 120);
check("fire t=120 inhale", f120.label === "In");
// Invalid ramp is dropped, pattern kept; valid ramp is copied, extra fields not leaked.
const rampBad = M.parseCustomPatterns(
  JSON.stringify({
    patterns: [
      { key: "bad-ramp", name: "BadRamp", phases: [{ label: "In", secs: 1, to: 1 }, { label: "Out", secs: 1, to: 0 }], ramp: { from: 0, to: 1, overSecs: 10 } },
      { key: "good-ramp", name: "GoodRamp", phases: [{ label: "In", secs: 1, to: 1 }, { label: "Out", secs: 1, to: 0 }], ramp: { from: 2, to: 0.5, overSecs: 60, junk: true } },
    ],
  })
);
check("bad ramp dropped, pattern kept", rampBad.length === 2 && rampBad[0].ramp === undefined);
check(
  "good ramp copied clean",
  JSON.stringify(rampBad[1].ramp) === '{"from":2,"to":0.5,"overSecs":60}'
);

// --- Stats helpers untouched (regression) ---
let s = M.addMinutes({ days: {} }, "2026-11-11", 5);
check("addMinutes", s.days["2026-11-11"] === 5);
check(
  "streakDays",
  M.streakDays({ days: { "2026-11-10": 5, "2026-11-11": 16 } }, "2026-11-11") === 2
);
check("formatRemaining", M.formatRemaining(65) === "1:05");

console.log(`ZenModel tests: ${pass} passed${process.exitCode ? " (WITH FAILURES)" : ""}`);
