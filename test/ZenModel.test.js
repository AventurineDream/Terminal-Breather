// Node harness for ZenModel.js — run with `node test/ZenModel.test.js`.
// Strips the `.pragma library` line, loads the pure functions in node,
// and asserts built-ins, custom merge, validation, ramp, and purity.
// No shell needed; the QML layer (FileView timing, panel wiring) is
// reviewed by diff and verified on dooracle instead.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync, spawnSync } = require("child_process");
const src = fs
  .readFileSync(path.join(__dirname, "..", "ZenModel.js"), "utf8")
  .replace(/^\.pragma library\n/, "");
const factory = new Function(
  src +
    "\nreturn { PATTERNS, PATTERN_ORDER, pattern, cycleSeconds, breathAt, rampScale, rampBaseTime, parseCustomPatterns, resolvePatterns, patternOptions, minuteOptions, parseStats, addMinutes, streakDays, weekSeries, formatRemaining, MEDITATION_LOG_HEADER, meditationLogPath, normalizeLogPath, logRow, appendLogCommand, flagSetting, barEntrySettings, sessionSettings, dndQueryCommand, dndEngageCommand, dndRestoreCommand, dndState, dndInitial, dndStep, DND_MARKER_BODY, persistStatsCommand, localPathOf };"
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
// A ratio to/from that underflows to 0 or overflows to Infinity must drop the ramp (log would fail), keeping the pattern.
const rampRatio = M.parseCustomPatterns(
  JSON.stringify({
    patterns: [
      { key: "under", name: "Under", phases: [{ label: "In", secs: 1, to: 1 }, { label: "Out", secs: 1, to: 0 }], ramp: { from: 1e300, to: 1e-300, overSecs: 60 } },
      { key: "over", name: "Over", phases: [{ label: "In", secs: 1, to: 1 }, { label: "Out", secs: 1, to: 0 }], ramp: { from: 1e-300, to: 1e300, overSecs: 60 } },
    ],
  })
);
check("ratio underflow and overflow drop ramp, keep pattern", rampRatio.length === 2 && rampRatio[0].ramp === undefined && rampRatio[1].ramp === undefined);
check("ratio-dropped pattern is real time", M.rampBaseTime(rampRatio[0], 30) === 30 && M.rampBaseTime(rampRatio[1], 30) === 30);
// Phase seconds and ramp factors are bounded so breathAt's secsLeft stays finite: 1e308 phase or factor is dropped.
const huge = (phases, ramp) => M.parseCustomPatterns(JSON.stringify({ patterns: [
  { key: "huge", name: "Huge", phases: phases, ramp: ramp },
] }));
const ph = (secs) => [{ label: "In", secs: secs, to: 1 }, { label: "Out", secs: 1, to: 0 }];
check("1e308 phase secs is dropped", huge(ph(1e308), undefined).length === 0);
check("1e308 ramp factor drops ramp, keeps pattern", (() => {
  const r = huge(ph(1), { from: 2, to: 1e308, overSecs: 60 });
  return r.length === 1 && r[0].ramp === undefined;
})());
check("bounded extremes keep pattern and give finite secsLeft", (() => {
  const r = huge(ph(3600), { from: 100, to: 0.01, overSecs: 3600 });
  const b = M.breathAt(r[0], 1000);
  return r.length === 1 && r[0].ramp !== undefined && Number.isFinite(b.secsLeft);
})());

// --- Object.prototype key names are plain keys, not inherited members ---
const protoRaw = JSON.stringify({ patterns: [
  { key: "constructor", name: "Ctor", phases: [{ label: "In", secs: 2, to: 1 }, { label: "Out", secs: 2, to: 0 }] },
  { key: "tostring", name: "Str", phases: [{ label: "In", secs: 2, to: 1 }, { label: "Out", secs: 2, to: 0 }] },
  { key: "tostring", name: "Dup", phases: [{ label: "In", secs: 2, to: 1 }, { label: "Out", secs: 2, to: 0 }] },
] });
const protoCustoms = M.parseCustomPatterns(protoRaw);
check("constructor custom key parsed", protoCustoms.length === 2 && protoCustoms[0].key === "constructor");
check("toString-like key parsed, duplicate still dropped", protoCustoms[1].key === "tostring" && protoCustoms[1].name === "Str");
const protoResolved = M.resolvePatterns(protoRaw);
check("custom constructor selected by pattern()", M.pattern("constructor", protoResolved.map).name === "Ctor");
check("custom tostring selected by pattern()", M.pattern("tostring", protoResolved.map).name === "Str");
check("unknown constructor falls back to box", M.pattern("constructor", M.resolvePatterns("").map).key === "box");
check("unknown toString falls back to box", M.pattern("toString", M.resolvePatterns("").map).key === "box");
check("constructor falls back to box without a map", M.pattern("constructor").key === "box");
check("toString falls back to box without a map", M.pattern("toString").key === "box");
check("constructor option label is custom name", M.patternOptions(protoResolved).some((o) => o.value === "constructor" && o.label === "Ctor"));

// --- Dropdown options (panel pickers) ---
check(
  "patternOptions built-ins",
  JSON.stringify(M.patternOptions(M.resolvePatterns(""))) ===
    '[{"value":"box","label":"Box breathing"},{"value":"478","label":"4-7-8"},{"value":"coherent","label":"Coherent"}]'
);
check(
  "patternOptions include customs in file order",
  JSON.stringify(M.patternOptions(r1).map((o) => o.value)) ===
    '["box","478","coherent","slow-6","calm-466","breath-of-fire"]'
);
check(
  "patternOptions custom label",
  M.patternOptions(r1)[3].label === "Slow 6"
);
check(
  "patternOptions default to built-ins without resolved",
  M.patternOptions().length === 3 && M.patternOptions()[0].value === "box"
);
check(
  "minuteOptions default",
  JSON.stringify(M.minuteOptions()) ===
    '[{"value":"5","label":"5 min"},{"value":"10","label":"10 min"},{"value":"15","label":"15 min"},{"value":"20","label":"20 min"}]'
);
check(
  "minuteOptions values are strings, labels carry min",
  M.minuteOptions([1, 30])[1].value === "30" &&
    M.minuteOptions([1, 30])[1].label === "30 min"
);

// --- Stats helpers untouched (regression) ---
let s = M.addMinutes({ days: {} }, "2026-11-11", 5);
check("addMinutes", s.days["2026-11-11"] === 5);
check(
  "streakDays",
  M.streakDays({ days: { "2026-11-10": 5, "2026-11-11": 16 } }, "2026-11-11") === 2
);
check("formatRemaining", M.formatRemaining(65) === "1:05");

// --- Meditation log ---
check(
  "log path default",
  M.meditationLogPath("/home/aven") ===
    "/home/aven/Projects/Obsidian/Aventurine/20_Practices/Meditation/Meditation Log.md"
);
check(
  "normalizeLogPath: empty means vault default",
  M.normalizeLogPath("", "/home/aven") === ""
);
check(
  "normalizeLogPath: whitespace-only is rejected",
  M.normalizeLogPath("   ", "/home/aven") === null
);
check(
  "normalizeLogPath: trims surrounding whitespace",
  M.normalizeLogPath("  /home/aven/notes/meditation.md  ", "/home/aven") ===
    "/home/aven/notes/meditation.md"
);
check(
  "normalizeLogPath: expands leading ~/",
  M.normalizeLogPath("~/notes/meditation.md", "/home/aven") ===
    "/home/aven/notes/meditation.md"
);
check(
  "normalizeLogPath: bare ~ expands to home",
  M.normalizeLogPath("~", "/home/aven") === "/home/aven"
);
check(
  "normalizeLogPath: relative path is rejected",
  M.normalizeLogPath("notes/meditation.md", "/home/aven") === null
);
check(
  "normalizeLogPath: absolute path passes through",
  M.normalizeLogPath("/home/aven/notes/meditation.md", "/home/aven") ===
    "/home/aven/notes/meditation.md"
);
check(
  "normalizeLogPath: null input is empty (default)",
  M.normalizeLogPath(null, "/home/aven") === ""
);
check(
  "logRow completed",
  M.logRow("2026-11-11", "Breath of Fire", 5, true) ===
    "| 2026-11-11 | Breath of Fire | 5 | yes |"
);
check(
  "logRow early end",
  M.logRow("2026-11-11", "Box breathing", 2, false) ===
    "| 2026-11-11 | Box breathing | 2 | no |"
);
check(
  "logRow scrubs pipe and newline",
  M.logRow("2026-11-11", "We|ird\nName", 3, true) ===
    "| 2026-11-11 | We ird Name | 3 | yes |"
);
check(
  "logRow empty name",
  M.logRow("2026-11-11", "", 1, true) ===
    "| 2026-11-11 | Unknown | 1 | yes |"
);
const logCmd = M.appendLogCommand(
  "/home/aven/log.md",
  "| 2026-11-11 | Box breathing | 5 | yes |"
);
check("appendLogCommand argv", logCmd[0] === "sh" && logCmd[1] === "-c" && logCmd[3] === "sh");
check("appendLogCommand path arg", logCmd[4] === "/home/aven/log.md");
check(
  "appendLogCommand row arg",
  logCmd[5] === "| 2026-11-11 | Box breathing | 5 | yes |"
);
check("appendLogCommand header arg", logCmd[6] === M.MEDITATION_LOG_HEADER);
check(
  "appendLogCommand values are args, not syntax",
  !logCmd[2].includes("/home/aven/log.md") && !logCmd[2].includes("Box breathing")
);
check(
  "appendLogCommand uses positional refs",
  logCmd[2].includes('"$1"') && logCmd[2].includes('"$2"') && logCmd[2].includes('"$3"')
);
// Run the real command: missing file gets header + row; existing file gets
// the row appended without a second header; a missing folder fails silently.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zen-log-"));
const logFile = path.join(tmp, "Meditation Log.md");
execFileSync(logCmd[0], logCmd.slice(1).map((a, i) => (i === 3 ? logFile : a)), {
  stdio: "ignore",
});
let logged = fs.readFileSync(logFile, "utf8");
check(
  "missing log file created with header + row",
  logged ===
    M.MEDITATION_LOG_HEADER + "\n| 2026-11-11 | Box breathing | 5 | yes |\n"
);
const row2 = M.logRow("2026-11-12", "Slow 6", 10, true);
const logCmd2 = M.appendLogCommand(logFile, row2);
execFileSync(logCmd2[0], logCmd2.slice(1), { stdio: "ignore" });
logged = fs.readFileSync(logFile, "utf8");
check(
  "second row appended, header not duplicated",
  logged ===
    M.MEDITATION_LOG_HEADER +
      "\n| 2026-11-11 | Box breathing | 5 | yes |\n| 2026-11-12 | Slow 6 | 10 | yes |\n"
);
const missingDirCmd = M.appendLogCommand(
  path.join(tmp, "no-such-dir", "log.md"),
  "| 2026-11-11 | Box breathing | 1 | yes |"
);
let missingThrew = false;
try {
  execFileSync(missingDirCmd[0], missingDirCmd.slice(1), { stdio: "ignore" });
} catch (e) {
  missingThrew = true;
}
check(
  "missing folder fails silently, nothing created",
  !missingThrew && !fs.existsSync(path.join(tmp, "no-such-dir"))
);

// --- Saved settings and summon payloads (BreatheOverlay merges them) ---
check("flagSetting: string false is false", M.flagSetting("false", true) === false);
check("flagSetting: boolean false is false", M.flagSetting(false, true) === false);
check("flagSetting: string true is true", M.flagSetting("true", false) === true);
check("flagSetting: absent takes the fallback",
  M.flagSetting(undefined, false) === false && M.flagSetting(undefined, true) === true);
check("flagSetting: junk takes the fallback", M.flagSetting("nope", true) === true);
const savedRaw = JSON.stringify([
  { id: "omarchy.clock" },
  { id: "aven.terminal-breather", pattern: "478", minutes: 15, animation: "saturn", bell: "false", dnd: false, meditationLogPath: "/tmp/m.md" },
]);
const saved = M.barEntrySettings(savedRaw);
check("barEntrySettings: finds the aven.terminal-breather entry", saved.pattern === "478" && saved.animation === "saturn");
check("barEntrySettings: ignores the pre-rename luotao.zen entry",
  JSON.stringify(M.barEntrySettings('[{"id":"luotao.zen","pattern":"478"}]')) === "{}");
check("barEntrySettings: junk gives empty", JSON.stringify(M.barEntrySettings("not json")) === "{}");
check("barEntrySettings: no entry gives empty", JSON.stringify(M.barEntrySettings('{"bar": []}')) === "{}");
const bare = M.sessionSettings({}, {});
check("sessionSettings: no payload and no saved entry use the defaults",
  bare.pattern === "box" && bare.minutes === 10 && bare.bell === true && bare.dnd === true &&
  bare.animation === "random" && bare.logPath === "");
const fromSaved = M.sessionSettings({}, saved);
check("sessionSettings: an empty summon takes every saved setting",
  fromSaved.pattern === "478" && fromSaved.minutes === 15 && fromSaved.animation === "saturn" &&
  fromSaved.bell === false && fromSaved.dnd === false && fromSaved.logPath === "/tmp/m.md");
const overridden = M.sessionSettings(
  { pattern: "box", minutes: 5, bell: true, dnd: true, animation: "moon", logPath: "/tmp/p.md" }, saved);
check("sessionSettings: payload keys win over saved ones",
  overridden.pattern === "box" && overridden.minutes === 5 && overridden.bell === true &&
  overridden.dnd === true && overridden.animation === "moon" && overridden.logPath === "/tmp/p.md");
check("sessionSettings: junk minutes fall back to saved minutes", M.sessionSettings({ minutes: "abc" }, saved).minutes === 15);
check("sessionSettings: huge finite payload minutes clamp to 120",
  M.sessionSettings({ minutes: 1e308 }, {}).minutes === 120 &&
  M.sessionSettings({ minutes: 35800000 }, {}).minutes === 120 &&
  M.sessionSettings({ minutes: 121 }, {}).minutes === 120);
check("sessionSettings: huge finite saved minutes clamp to 120 when the payload is silent",
  M.sessionSettings({}, { minutes: 1e308 }).minutes === 120);
check("sessionSettings: minutes at or under the 120 cap are kept",
  M.sessionSettings({ minutes: 120 }, {}).minutes === 120 &&
  M.sessionSettings({ minutes: 60 }, {}).minutes === 60 &&
  M.sessionSettings({ minutes: 0.5 }, {}).minutes === 0.5);
check("sessionSettings: the clamped value times 60 stays within int32",
  M.sessionSettings({ minutes: 1e308 }, {}).minutes * 60 <= 2147483647);
check("sessionSettings: an empty payload log path falls back to the saved one",
  M.sessionSettings({ logPath: "" }, saved).logPath === "/tmp/m.md");
// Log paths are normalized against HOME. The test HOME is a throwaway string,
// never the real home directory, and nothing is read or written under it.
const TEST_HOME = "/tmp/zen-test-home";
check("sessionSettings: a ~/ payload log path expands against HOME",
  M.sessionSettings({ logPath: "~/notes/m.md" }, {}, TEST_HOME).logPath === TEST_HOME + "/notes/m.md");
check("sessionSettings: an absolute payload log path is kept",
  M.sessionSettings({ logPath: "/tmp/p.md" }, {}, TEST_HOME).logPath === "/tmp/p.md");
check("sessionSettings: a relative payload log path falls through to the saved one",
  M.sessionSettings({ logPath: "notes/p.md" }, saved, TEST_HOME).logPath === "/tmp/m.md");
check("sessionSettings: a relative payload with nothing saved gives the default (empty)",
  M.sessionSettings({ logPath: "notes/p.md" }, {}, TEST_HOME).logPath === "");
check("sessionSettings: a whitespace-only payload log path is unusable",
  M.sessionSettings({ logPath: "   " }, {}, TEST_HOME).logPath === "");
check("sessionSettings: a ~/ saved log path expands against HOME",
  M.sessionSettings({}, { meditationLogPath: "~/m.md" }, TEST_HOME).logPath === TEST_HOME + "/m.md");
check("sessionSettings: a relative saved log path gives the default (empty)",
  M.sessionSettings({}, { meditationLogPath: "m.md" }, TEST_HOME).logPath === "");
check("sessionSettings: ~ with no HOME is unusable",
  M.sessionSettings({ logPath: "~/x.md" }, {}, undefined).logPath === "");
check("sessionSettings: an array payload log path is unusable, so the saved one applies",
  M.sessionSettings({ logPath: ["/tmp/a.md"] }, saved, TEST_HOME).logPath === "/tmp/m.md");
check("sessionSettings: an array payload log path with nothing saved gives the default (empty)",
  M.sessionSettings({ logPath: ["/tmp/a.md"] }, {}, TEST_HOME).logPath === "");
check("sessionSettings: a numeric payload log path is unusable",
  M.sessionSettings({ logPath: 42 }, {}, TEST_HOME).logPath === "");
check("sessionSettings: an object saved log path is unusable",
  M.sessionSettings({}, { meditationLogPath: { path: "/tmp/m.md" } }, TEST_HOME).logPath === "");
check("sessionSettings: null and undefined payload log paths are absent, so the saved one applies",
  M.sessionSettings({ logPath: null }, saved, TEST_HOME).logPath === "/tmp/m.md" &&
  M.sessionSettings({ logPath: undefined }, saved, TEST_HOME).logPath === "/tmp/m.md");

// Shared stats: the bar hands this session's minutes to the terminal guide's
// --record-stats mode, which merges them into the file on disk. The real helper runs
// against a temp stats file, so the merge and the byte format are checked together.
const shareRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zen-share-"));
const shareStats = path.join(shareRoot, "stats.json");
const guideFile = path.join(__dirname, "..", "cli", "tb-guide");
const persist = M.persistStatsCommand(guideFile, shareStats, "2026-11-11", 5);
check("persistStatsCommand: argv runs the guide's --record-stats mode",
  JSON.stringify(persist) ===
    JSON.stringify(["python3", guideFile, "--record-stats", shareStats, "2026-11-11", "5"]));
fs.writeFileSync(shareStats, '{"days":{"2026-11-10":3}}');
const persistRun = spawnSync(persist[0], persist.slice(1), {
  encoding: "utf8",
  env: { ...process.env, HOME: shareRoot },
});
check("persistStatsCommand: merges into the file on disk, in the Zen byte format",
  persistRun.status === 0 &&
  fs.readFileSync(shareStats, "utf8") === '{"days":{"2026-11-10":3,"2026-11-11":5}}');
fs.rmSync(shareRoot, { recursive: true, force: true });
check("localPathOf: decodes a file URL to a local path",
  M.localPathOf("file:///home/a%20b/cli/tb-guide") === "/home/a b/cli/tb-guide");
check("localPathOf: anything else gives an empty path",
  M.localPathOf("/tmp/x") === "" && M.localPathOf(undefined) === "" &&
  M.localPathOf("file:///%E0%A4%A") === "");
check("sessionSettings: the meditation log is on by default",
  M.sessionSettings({}, {}).logEnabled === true);
check("sessionSettings: a saved Off turns the log off, as a boolean or a string",
  M.sessionSettings({}, { meditationLogEnabled: false }).logEnabled === false &&
  M.sessionSettings({}, { meditationLogEnabled: "false" }).logEnabled === false);
check("sessionSettings: a payload logEnabled wins over the saved value",
  M.sessionSettings({ logEnabled: false }, { meditationLogEnabled: true }).logEnabled === false &&
  M.sessionSettings({ logEnabled: true }, { meditationLogEnabled: false }).logEnabled === true);
check("sessionSettings: junk logEnabled falls back to the saved value",
  M.sessionSettings({ logEnabled: 0 }, { meditationLogEnabled: false }).logEnabled === false);
check("sessionSettings: the saved Off is read from the bar entry",
  M.sessionSettings({ minutes: 5 }, M.barEntrySettings(JSON.stringify([
    { id: "aven.terminal-breather", meditationLogEnabled: false },
  ]))).logEnabled === false);

// DND goes through the notifications IPC; a regression to the in-process service
// lookup (which returns null for a non-bar plugin) would leave DND silently off.
// A fake omarchy-shell in a throwaway dir stands in for the real one: it logs its
// argv, prints FAKE_OUT and exits with FAKE_STATUS.
const dndDir = fs.mkdtempSync(path.join(os.tmpdir(), "zen-dnd-"));
const dndArgvLog = path.join(dndDir, "argv.log");
const fakeShell = path.join(dndDir, "omarchy-shell");
fs.writeFileSync(
  fakeShell,
  '#!/bin/sh\necho "$@" >> "' + dndArgvLog + '"\nprintf "%s" "$FAKE_OUT"\nexit "$FAKE_STATUS"\n'
);
fs.chmodSync(fakeShell, 0o755);
function runShell(argv, out, status) {
  return spawnSync(argv[0], argv.slice(1), {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: dndDir + path.delimiter + process.env.PATH,
      FAKE_OUT: out,
      FAKE_STATUS: String(status),
    },
  });
}
function runWithFakeShell(argv, out, status) {
  return runShell(argv, out, status).stdout;
}
check("dndQueryCommand: queries the notifications IPC under a timeout",
  M.dndQueryCommand()[2].includes("timeout 5 omarchy-shell notifications isDnd"));
check("dndState: only the bare words on and off count",
  M.dndState("on\n") === "on" && M.dndState(" off ") === "off" && M.dndState("") === "unknown" &&
  M.dndState(undefined) === "unknown" && M.dndState("off on") === "unknown" &&
  M.dndState("Target not found.") === "unknown");
check("dndQuery: a shell that answers off reads as off",
  M.dndState(runWithFakeShell(M.dndQueryCommand(), "off\n", 0)) === "off");
check("dndQuery: a shell that answers on reads as on",
  M.dndState(runWithFakeShell(M.dndQueryCommand(), "on\n", 0)) === "on");
check("dndQuery: a failing shell reads as unknown even when it printed off",
  M.dndState(runWithFakeShell(M.dndQueryCommand(), "off\n", 3)) === "unknown");
check("dndQuery: an empty answer reads as unknown",
  M.dndState(runWithFakeShell(M.dndQueryCommand(), "", 0)) === "unknown");
check("dndQuery: error text reads as unknown",
  M.dndState(runWithFakeShell(M.dndQueryCommand(), "Target not found.\n", 0)) === "unknown");
// Engage writes the marker before turning DND on, and restore removes it only when
// the IPC succeeds, so a plugin that dies mid-session leaves the marker for the next
// load. The real commands run against the fake shell and a temp state dir.
const markerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zen-marker-"));
const markerPath = path.join(markerRoot, "state", "omarchy", "zen", "dnd-engaged.json");
function argvLines() {
  return fs.existsSync(dndArgvLog) ? fs.readFileSync(dndArgvLog, "utf8").trim().split("\n") : [];
}
function clearArgvLog() {
  fs.rmSync(dndArgvLog, { force: true });
}
const engage = M.dndEngageCommand(markerPath);
check("dndEngageCommand: sh -c with the marker path and body as arguments",
  engage[0] === "sh" && engage[1] === "-c" && engage[3] === "sh" &&
  engage[4] === markerPath && engage[5] === M.DND_MARKER_BODY);
check("DND_MARKER_BODY: the restore target is off",
  JSON.parse(M.DND_MARKER_BODY).restoreTo === "off");
clearArgvLog();
let engageRun = runShell(engage, "", 0);
check("dndEngageCommand: writes the marker, then turns DND on",
  engageRun.status === 0 && fs.readFileSync(markerPath, "utf8") === M.DND_MARKER_BODY &&
  argvLines().join("|") === "notifications setDnd on");
const blocker = path.join(markerRoot, "blocker");
fs.writeFileSync(blocker, "");
clearArgvLog();
engageRun = runShell(M.dndEngageCommand(path.join(blocker, "dnd-engaged.json")), "", 0);
check("dndEngageCommand: an unwritable marker keeps DND off",
  engageRun.status !== 0 && argvLines().length === 0);
const restore = M.dndRestoreCommand(markerPath, 0);
check("dndRestoreCommand: argv carries the marker path and a zero wait pid",
  restore[4] === markerPath && restore[5] === "0");
clearArgvLog();
let restoreRun = runShell(restore, "", 3);
check("dndRestoreCommand: a failed IPC keeps the marker for the next load",
  restoreRun.status !== 0 && fs.existsSync(markerPath));
clearArgvLog();
restoreRun = runShell(restore, "", 0);
check("dndRestoreCommand: a successful IPC turns DND off and removes the marker",
  restoreRun.status === 0 && !fs.existsSync(markerPath) &&
  argvLines().join("|") === "notifications setDnd off");
// A restore given the pid of a still-running engage waits for it to exit, so a late
// engage cannot switch DND on after the restore has switched it off. The background
// sleep starts after waitStart, so the restore must return at least 600 ms later.
fs.writeFileSync(markerPath, M.DND_MARKER_BODY);
const waitStart = Date.now();
const sleeper = spawnSync("sh", ["-c", "sleep 0.6 >/dev/null 2>&1 & echo $!"], { encoding: "utf8" });
const enginePid = Number(sleeper.stdout.trim());
clearArgvLog();
restoreRun = runShell(M.dndRestoreCommand(markerPath, enginePid), "", 0);
check("dndRestoreCommand: waits for a running engage before turning DND off",
  restoreRun.status === 0 && Date.now() - waitStart >= 600 && !fs.existsSync(markerPath) &&
  argvLines().join("|") === "notifications setDnd off");
fs.rmSync(dndDir, { recursive: true, force: true });
fs.rmSync(markerRoot, { recursive: true, force: true });

// DND ownership transitions. dndRun feeds [event, live, wanted, arg] steps through
// dndStep and returns each step's effects and the state after it.
function dndRun(steps) {
  let st = M.dndInitial();
  return steps.map(([event, live, wanted, arg]) => {
    const r = M.dndStep(st, event, live, wanted, arg);
    st = r.state;
    return { fx: r.effects, st };
  });
}
// 1. An unknown probe engages nothing, so no restore is ever owed for it.
const unknownProbe = dndRun([
  ["start", true, true],
  ["probed", true, true, "unknown"],
  ["end", false, true],
]);
check("dnd: a session start probes before anything else", unknownProbe[0].fx.join() === "probe");
check("dnd: an unknown probe engages nothing", unknownProbe[1].fx.length === 0 && !unknownProbe[1].st.owned);
check("dnd: an unknown probe owes no restore at the end", unknownProbe[2].fx.length === 0);
// 2. The user's own DND on is never touched.
const userOn = dndRun([
  ["start", true, true],
  ["probed", true, true, "on"],
  ["end", false, true],
]);
check("dnd: the user's DND on is left alone from start to end",
  userOn[1].fx.length === 0 && userOn[2].fx.length === 0);
// 3. An explicit off engages, and the end restores it.
const happy = dndRun([
  ["start", true, true],
  ["probed", true, true, "off"],
  ["end", false, true],
  ["restored", false, true, true],
]);
check("dnd: an off probe engages and refreshes", happy[1].fx.join() === "engage,refresh" && happy[1].st.owned);
check("dnd: the end restores DND", happy[2].fx.join() === "restore" && happy[2].st.busy);
check("dnd: a successful restore clears ownership",
  happy[3].fx.join() === "refresh" && !happy[3].st.owned && !happy[3].st.busy);
// 4. A query that never answers (its process failed to start) changes nothing, and the next start probes again.
const noAnswer = dndRun([["start", true, true], ["start", true, true]]);
check("dnd: a query that never answers is probed again on the next start", noAnswer[1].fx.join() === "probe");
// 5. A failed restore keeps DND owed, is not retried in a loop, and is retried at the next start.
const failedRestore = dndRun([
  ["start", true, true],
  ["probed", true, true, "off"],
  ["end", false, true],
  ["restored", false, true, false],
  ["start", true, true],
  ["restored", true, true, false],
  ["start", true, true],
  ["restored", true, true, true],
  ["probed", true, true, "off"],
]);
check("dnd: a failed restore keeps DND owed and idle", failedRestore[3].st.owned && !failedRestore[3].st.busy);
check("dnd: a failed restore is not retried by itself", failedRestore[3].fx.join() === "refresh");
check("dnd: the next start retries the owed restore",
  failedRestore[4].fx.join() === "restore" && failedRestore[4].st.pendingProbe);
check("dnd: a failed retry does not loop", failedRestore[5].fx.join() === "refresh");
check("dnd: a successful retry probes, then re-engages on off",
  failedRestore[7].fx.join() === "refresh,probe" && failedRestore[8].fx.join() === "engage,refresh");
// 6. A repeat restore report (runningChanged after exited) is ignored.
const dupReport = dndRun([
  ["start", true, true],
  ["probed", true, true, "off"],
  ["end", false, true],
  ["restored", false, true, true],
  ["restored", false, true, false],
]);
check("dnd: a repeat restore report after the exit is ignored",
  dupReport[4].fx.length === 0 && !dupReport[4].st.owned);
// 7. A start during an in-flight restore waits for it before probing.
const midRestore = dndRun([
  ["start", true, true],
  ["probed", true, true, "off"],
  ["end", false, true],
  ["start", true, true],
  ["restored", true, true, true],
]);
check("dnd: a start during an in-flight restore does not probe early", midRestore[3].fx.length === 0);
check("dnd: the probe runs once the restore settles", midRestore[4].fx.join() === "refresh,probe");
// 8. A probe answering after its session ended engages nothing.
const lateProbe = dndRun([["start", true, true], ["end", false, true], ["probed", false, true, "off"]]);
check("dnd: a probe answering after the session ends engages nothing",
  lateProbe[2].fx.length === 0 && !lateProbe[2].st.owned);
// 9. A session that opts out of DND never probes or engages.
const optOut = dndRun([["start", true, false], ["probed", true, false, "off"], ["end", false, false]]);
check("dnd: an opted-out session never probes or engages",
  optOut.every((o) => o.fx.length === 0));

// 10. Load-time recovery: an engage marker from an earlier run owes a restore before
// any session starts, and a failed restore is retried by the next start.
const recovered = dndRun([
  ["recover", false, true, true],
  ["restored", false, true, true],
  ["start", true, true],
]);
check("dnd: a leftover engage marker restores DND at load",
  recovered[0].fx.join() === "restore" && recovered[0].st.owned && recovered[0].st.busy);
check("dnd: the recovered restore clears ownership", recovered[1].fx.join() === "refresh" && !recovered[1].st.owned);
check("dnd: a session after the recovery probes normally", recovered[2].fx.join() === "probe");
const noMarker = dndRun([["recover", false, true, false]]);
check("dnd: no marker at load owes nothing", noMarker[0].fx.length === 0 && !noMarker[0].st.owned);
const recoverFails = dndRun([
  ["recover", false, true, true],
  ["restored", false, true, false],
  ["start", true, true],
  ["restored", true, true, true],
]);
check("dnd: a failed recovery is retried by the next start, then the probe follows",
  recoverFails[1].st.owned && !recoverFails[1].st.busy &&
  recoverFails[2].fx.join() === "restore" && recoverFails[2].st.pendingProbe &&
  recoverFails[3].fx.join() === "refresh,probe");

console.log(`ZenModel tests: ${pass} passed${process.exitCode ? " (WITH FAILURES)" : ""}`);
