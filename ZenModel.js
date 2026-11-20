.pragma library

/**
 * Pure data helpers shared by Terminal Breather's bar widget, fullscreen overlay,
 * and terminal guide. No Qt or I/O; durations use seconds unless named minutes.
 */


// Each phase: label shown to the breather, seconds it lasts, and where the
// circle should be at its end (0 = fully exhaled, 1 = fully inhaled).
var PATTERNS = {
  box: {
    key: "box",
    name: "Box breathing",
    hint: "4-4-4-4 — steady focus",
    phases: [
      { label: "Breathe in", secs: 4, to: 1 },
      { label: "Hold", secs: 4, to: 1 },
      { label: "Breathe out", secs: 4, to: 0 },
      { label: "Hold", secs: 4, to: 0 }
    ]
  },
  "478": {
    key: "478",
    name: "4-7-8",
    hint: "long exhale — wind down",
    phases: [
      { label: "Breathe in", secs: 4, to: 1 },
      { label: "Hold", secs: 7, to: 1 },
      { label: "Breathe out", secs: 8, to: 0 }
    ]
  },
  coherent: {
    key: "coherent",
    name: "Coherent",
    hint: "5.5 in, 5.5 out — balance",
    phases: [
      { label: "Breathe in", secs: 5.5, to: 1 },
      { label: "Breathe out", secs: 5.5, to: 0 }
    ]
  }
}

var PATTERN_ORDER = ["box", "478", "coherent"]

// Own-property lookup only: keys like "constructor" or "toString" must not
// resolve to Object.prototype members. Matches Python's dict-membership guard.
/**
 * Tests an own property without consulting Object.prototype.
 * @param {Object} obj Object to inspect.
 * @param {string} key Property name.
 * @returns {boolean} True only when `key` belongs to `obj`.
 */
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

/**
 * Resolves a pattern key case-insensitively, falling back to Box breathing.
 * @param {string} key Pattern key.
 * @param {Object} [map] Optional resolved pattern map.
 * @returns {Object} Matching pattern or the built-in Box pattern.
 */
function pattern(key, map) {
  var m = map || PATTERNS
  var k = String(key || "").toLowerCase()
  if (hasOwn(m, k) && m[k]) return m[k]
  return m.box || PATTERNS.box
}

// ---- Custom patterns. A JSON config file (default
// ~/.config/omarchy/zen/patterns.json) may add patterns:
//   {"patterns": [{"key": "slow-6", "name": "Slow 6", "hint": "in 6 · out 6",
//                  "phases": [{"label": "Breathe in", "secs": 6, "to": 1},
//                             {"label": "Breathe out", "secs": 6, "to": 0}]}]}
// Keys are lowercase letters, digits and dashes. A custom key that collides
// with a built-in (box, 478, coherent) is ignored — built-ins win. Invalid
// entries are skipped, never fatal: a typo in the config must not break the
// three patterns that already work. A pattern may also carry an optional
// ramp (see below) that scales its phases over the first minute of a
// session; an invalid ramp is dropped and the pattern kept.

// Limits on custom-pattern numbers, mirrored in cli/tb-guide. Built-in patterns
// use short phases with no ramp; the example Breath of Fire ramps from 2 to 0.5.
// The bounds keep `secs * scale` finite before the countdown is rounded.
var MAX_PHASE_SECS = 3600
var MAX_RAMP_OVER_SECS = 3600
var MIN_RAMP_FACTOR = 0.01
var MAX_RAMP_FACTOR = 100

/**
 * Validates one phase in a custom pattern.
 * @param {Object} ph Phase with a label, `secs` in seconds, and `to` fullness.
 * @returns {boolean} True for a non-empty label, bounded finite duration, and target 0 or 1.
 */
function isValidPhase(ph) {
  return ph && typeof ph.label === "string" && ph.label.length > 0 &&
    typeof ph.secs === "number" && isFinite(ph.secs) &&
    ph.secs > 0 && ph.secs <= MAX_PHASE_SECS &&
    (ph.to === 0 || ph.to === 1)
}

/**
 * Parses custom pattern entries, skipping malformed entries and built-in key collisions.
 * @param {string} raw Contents of patterns.json.
 * @returns {Object[]} Valid custom patterns in file order; malformed JSON yields an empty list.
 */
function parseCustomPatterns(raw) {
  var out = []
  var seen = {}
  try {
    var parsed = JSON.parse(raw || "{}")
    var list = parsed && parsed.patterns
    if (!Array.isArray(list)) return out
    for (var i = 0; i < list.length; i++) {
      var p = list[i]
      if (!p || typeof p.key !== "string") continue
      var key = p.key.toLowerCase()
      if (!/^[a-z0-9][a-z0-9-]*$/.test(key)) continue
      if (hasOwn(seen, key)) continue
      seen[key] = true
      if (hasOwn(PATTERNS, key)) continue
      if (typeof p.name !== "string" || p.name.length === 0) continue
      if (!Array.isArray(p.phases) || p.phases.length < 2) continue
      var phases = []
      var ok = true
      for (var j = 0; j < p.phases.length; j++) {
        var ph = p.phases[j]
        if (!isValidPhase(ph)) { ok = false; break }
        phases.push({ label: ph.label, secs: ph.secs, to: ph.to })
      }
      if (!ok) continue
      var entry = { key: key, name: p.name,
        hint: typeof p.hint === "string" ? p.hint : "",
        phases: phases }
      if (p.ramp && validRamp(p.ramp)) {
        entry.ramp = { from: p.ramp.from, to: p.ramp.to, overSecs: p.ramp.overSecs }
      }
      out.push(entry)
    }
  } catch (e) {}
  return out
}

// Merged pattern map + order: built-ins first, customs after, in file order.
// Pure: recomputed from scratch every call, so reloading the config file
// never duplicates a pattern or keeps one that was removed.
function resolvePatterns(customRaw) {
  var map = {}
  var order = []
  for (var i = 0; i < PATTERN_ORDER.length; i++) {
    var k = PATTERN_ORDER[i]
    map[k] = PATTERNS[k]
    order.push(k)
  }
  var customs = parseCustomPatterns(customRaw)
  for (var j = 0; j < customs.length; j++) {
    map[customs[j].key] = customs[j]
    order.push(customs[j].key)
  }
  return { map: map, order: order, customs: customs }
}

// Option lists for the panel dropdowns: { value, label } pairs the shell
// Dropdown renders (label is what shows, value is what is emitted).
// Pattern labels come from the resolved map, so a custom pattern shows its
// own name; minutes render as "5 min". The dropdown's value is the key
// (pattern) or the minutes as a string, matching what choose() stores.
function patternOptions(resolved) {
  var out = []
  var order = (resolved && resolved.order) || PATTERN_ORDER
  var map = (resolved && resolved.map) || PATTERNS
  for (var i = 0; i < order.length; i++) {
    var p = pattern(order[i], map)
    out.push({ value: String(order[i]), label: p.name })
  }
  return out
}

function minuteOptions(choices) {
  var out = []
  var list = choices || [5, 10, 15, 20]
  for (var i = 0; i < list.length; i++)
    out.push({ value: String(list[i]), label: list[i] + " min" })
  return out
}

// ---- Tempo ramp. A pattern may carry an optional ramp that scales every
// phase duration over the first `overSecs` of a session:
//   "ramp": {"from": 2, "to": 0.5, "overSecs": 60}
// A scale of 2 means twice as slow as the written phases, 0.5 twice as
// fast. The scale moves linearly from `from` to `to`, so a session starts
// slow and builds speed — breath of fire is the canonical example: short
// in/out phases with a ramp from slow to fast.

/**
 * Validates a tempo ramp whose factors scale phase durations over `overSecs`.
 * @param {Object} r Ramp with `from`/`to` factors and `overSecs` in seconds.
 * @returns {boolean} True when every value is finite and within the supported bounds.
 * @remarks Factor bounds keep `to/from` finite; the ratio test is defensive if those limits change.
 */
function validRamp(r) {
  return r && typeof r.from === "number" && isFinite(r.from) &&
    r.from >= MIN_RAMP_FACTOR && r.from <= MAX_RAMP_FACTOR &&
    typeof r.to === "number" && isFinite(r.to) &&
    r.to >= MIN_RAMP_FACTOR && r.to <= MAX_RAMP_FACTOR &&
    typeof r.overSecs === "number" && isFinite(r.overSecs) &&
    r.overSecs > 0 && r.overSecs <= MAX_RAMP_OVER_SECS &&
    isFinite(r.to / r.from) && r.to / r.from > 0
}

// Current tempo scale at `t` seconds into the session: 1 with no ramp.
function rampScale(pat, t) {
  if (!pat || !validRamp(pat.ramp)) return 1
  var r = pat.ramp
  var f = Math.min(Math.max(t / r.overSecs, 0), 1)
  return r.from + (r.to - r.from) * f
}

// Written-pattern seconds reached after `t` real seconds, integrating
// 1/scale over the session. Closed form for a linear ramp: the log term is
// the integral of 1/(a + b·u).
function rampBaseTime(pat, t) {
  if (!pat || !validRamp(pat.ramp)) return Math.max(t, 0)
  var r = pat.ramp
  t = Math.max(t, 0)
  if (r.to === r.from) return t / r.from
  var done = (r.overSecs / (r.to - r.from)) * Math.log(r.to / r.from)
  if (t <= r.overSecs) {
    return (r.overSecs / (r.to - r.from)) *
      Math.log((r.from + (r.to - r.from) * t / r.overSecs) / r.from)
  }
  return done + (t - r.overSecs) / r.to
}

function cycleSeconds(pat) {
  var total = 0
  for (var i = 0; i < pat.phases.length; i++) total += pat.phases[i].secs
  return total
}

// Where the breath is at `t` seconds into the cycle. Returns the phase, the
// seconds left in it (for the countdown digit), and the circle's fullness in
// [0, 1], eased with a half-cosine so movement starts and ends softly —
// linear motion reads as mechanical, breath is not.
function breathAt(pat, t) {
  var into = rampBaseTime(pat, t) % cycleSeconds(pat)
  var scale = rampScale(pat, t)
  var from = pat.phases[pat.phases.length - 1].to
  for (var i = 0; i < pat.phases.length; i++) {
    var ph = pat.phases[i]
    if (into < ph.secs) {
      var x = ph.secs > 0 ? into / ph.secs : 1
      var eased = 0.5 - 0.5 * Math.cos(Math.PI * x)
      return {
        label: ph.label,
        secsLeft: Math.ceil((ph.secs - into) * scale),
        fullness: from + (ph.to - from) * eased
      }
    }
    into -= ph.secs
    from = ph.to
  }
  return { label: pat.phases[0].label, secsLeft: Math.ceil(pat.phases[0].secs * scale), fullness: from }
}

// ---- Session stats. Stored as {"days": {"2026-08-22": 10, ...}} minutes.

function parseStats(raw) {
  try {
    var parsed = JSON.parse(raw || "{}")
    if (parsed && typeof parsed.days === "object" && parsed.days !== null) return { days: parsed.days }
  } catch (e) {}
  return { days: {} }
}

function addMinutes(stats, dayKey, minutes) {
  var days = {}
  for (var k in stats.days) days[k] = stats.days[k]
  days[dayKey] = Math.round((Number(days[dayKey]) || 0) + minutes)
  return { days: days }
}

function dayKeyOffset(dayKey, offsetDays) {
  var parts = String(dayKey).split("-")
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + offsetDays)
  var m = d.getMonth() + 1
  var day = d.getDate()
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day
}

// Consecutive days with any practice, counting back from today — or from
// yesterday when today is still blank, so the streak isn't shown broken
// before the day is over.
function streakDays(stats, todayKey) {
  var start = (Number(stats.days[todayKey]) || 0) > 0 ? todayKey : dayKeyOffset(todayKey, -1)
  var streak = 0
  var cursor = start
  while ((Number(stats.days[cursor]) || 0) > 0) {
    streak++
    cursor = dayKeyOffset(cursor, -1)
  }
  return streak
}

function todayMinutes(stats, todayKey) {
  return Number(stats.days[todayKey]) || 0
}

function statsSummary(stats, todayKey) {
  var streak = streakDays(stats, todayKey)
  var today = todayMinutes(stats, todayKey)
  var parts = []
  if (streak > 0) parts.push(streak + "-day streak")
  if (today > 0) parts.push(today + " min today")
  return parts.length ? parts.join(" · ") : "No sessions yet"
}

// Last 7 days (oldest first) for the weekly practice view: single-letter
// weekday label, minutes practiced, and whether the column is today.
function weekSeries(stats, todayKey) {
  var letters = ["S", "M", "T", "W", "T", "F", "S"]
  var out = []
  for (var i = 6; i >= 0; i--) {
    var key = dayKeyOffset(todayKey, -i)
    var parts = key.split("-")
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    out.push({
      key: key,
      label: letters[d.getDay()],
      minutes: Number(stats.days[key]) || 0,
      isToday: i === 0
    })
  }
  return out
}

function weekTotal(series) {
  var total = 0
  for (var i = 0; i < series.length; i++) total += series[i].minutes
  return total
}

// Argv for playing a session bell; prefers pw-play (PipeWire) and falls back
// to paplay, exiting quietly when neither exists.
function bellCommand(soundFile) {
  return [
    "sh", "-c",
    'f="$1"; [ -f "$f" ] || exit 0; ' +
    'if command -v pw-play >/dev/null 2>&1; then exec pw-play "$f"; ' +
    'elif command -v paplay >/dev/null 2>&1; then exec paplay "$f"; fi',
    "sh", soundFile
  ]
}

/**
 * Builds argv to query Omarchy's DND state without a shell service handle.
 * @returns {string[]} IPC command argv; failed or timed-out queries produce no state text.
 * @remarks The five-second timeout bounds how long a missing shell response can block state handling.
 */
function dndQueryCommand() {
  return ["sh", "-c", 'out=$(timeout 5 omarchy-shell notifications isDnd) || exit 1; printf %s "$out"']
}
/**
 * Builds argv to set the shell's Do Not Disturb state.
 * @param {boolean} on True to enable DND, false to restore notifications.
 * @returns {string[]} IPC command argv.
 * @remarks The five-second timeout prevents a hung restore from remaining in flight indefinitely.
 */
function dndSetCommand(on) {
  return ["timeout", "5", "omarchy-shell", "notifications", "setDnd", on ? "on" : "off"]
}

/**
 * Parses the notification service's DND response.
 * @param {string} stdout Raw query output.
 * @returns {"on"|"off"|"unknown"} Only exact `on`/`off` responses are trusted.
 */
function dndState(stdout) {
  var word = String(stdout == null ? "" : stdout).trim()
  return word === "on" || word === "off" ? word : "unknown"
}

// DND ownership as a pure step. The overlay feeds it events and runs the effects
// it returns, so every transition can be tested here. State: {owned, busy, pendingProbe}.
//   owned        DND is ours: this session engaged it, or a restore is still owed
//                after a failed one. Set only after a probe reads "off"; cleared
//                only by a restore that exited 0.
//   busy         a restore process is in flight; its result arrives as "restored".
//   pendingProbe a session started while a restore was in flight; it probes once the
//                restore settles, so it never reads DND still switching off.
// Events: "start" (a session begins), "end" (a session ends or is replaced),
// "probed" (arg: dndState of the query output), "restored" (arg: true if the
// restore exited 0). live: a session is running; wanted: this session wants DND.
// Returns {state, effects}; effects are "probe", "restore", "engage" and "refresh".
// A failed restore is never retried in a loop: the next "start" or "end" retries it.
/**
 * Creates an unowned, idle DND state with no pending probe.
 * @returns {{owned: boolean, busy: boolean, pendingProbe: boolean}} Fresh transition state.
 */
function dndInitial() {
  return { owned: false, busy: false, pendingProbe: false }
}

/**
 * Reduces a DND lifecycle event to a new state and requested shell effects.
 * @param {Object} st Prior state from `dndInitial` or a previous result.
 * @param {string} event `start`, `end`, `probed`, or `restored`.
 * @param {boolean} live Whether a breathing session is active.
 * @param {boolean} wanted Whether this session requests DND.
 * @param {string|boolean} arg Probe state (`on`/`off`/`unknown`) or restore success.
 * @returns {{state: Object, effects: string[]}} New state and effects; performs no I/O.
 */
function dndStep(st, event, live, wanted, arg) {
  var s = { owned: st.owned, busy: st.busy, pendingProbe: st.pendingProbe }
  var fx = []
  function restore() {
    if (s.owned && !s.busy) { s.busy = true; fx.push("restore") }
  }
  if (event === "start") {
    restore()
    if (wanted) {
      if (s.owned || s.busy) s.pendingProbe = true
      else fx.push("probe")
    }
  } else if (event === "end") {
    restore()
    s.pendingProbe = false
  } else if (event === "probed") {
    // Only an explicit "off" is engaged: "on" is the user's own DND, and
    // "unknown" must leave DND exactly as it was.
    if (arg === "off" && live && wanted && !s.owned) {
      s.owned = true
      fx.push("engage", "refresh")
    }
  } else if (event === "restored") {
    // With no restore in flight this is the second report of one exit (exited,
    // then runningChanged), so it is ignored.
    if (!s.busy) return { state: s, effects: fx }
    s.busy = false
    if (arg) s.owned = false
    fx.push("refresh")
    var pending = s.pendingProbe
    s.pendingProbe = false
    if (pending && live && wanted && !s.owned) fx.push("probe")
  }
  return { state: s, effects: fx }
}

// Argv for persisting the stats file; JSON travels as a positional arg so it
// is data to the shell, never syntax.
function persistStatsCommand(path, stats) {
  return [
    "sh", "-c",
    'mkdir -p "$(dirname "$1")" && printf %s "$2" > "$1"',
    "sh", path, JSON.stringify(stats)
  ]
}

// ---- Obsidian meditation log. One row per session, appended to a Markdown
// table when a session ends:
//   | Date | Pattern | Minutes | Completed |
//   | 2026-11-11 | Breath of Fire | 5 | yes |
// The default location is the vault's meditation log; it can be overridden
// in the plugin settings (meditationLogPath). A missing file is created
// with the table header first, so a moved vault still gets a readable log.
// A missing folder is left alone — the append then fails silently rather
// than scattering a log somewhere the vault is not.

var MEDITATION_LOG_HEADER = "# Meditation Log\n\nSessions logged by Terminal-Breather (fork of luotao.zen) — one row per session, appended automatically when a session ends.\n\n| Date | Pattern | Minutes | Completed |\n| --- | --- | --- | --- |"

function meditationLogPath(home) {
  return (home || "") + "/Projects/Obsidian/Aventurine/20_Practices/Meditation/Meditation Log.md"
}

// Normalize a user-entered meditation-log path from the panel Settings
// field. Returns the absolute path to save, "" for "use the vault
// default", or null when the input is not a usable path.
//   - Truly empty input ("") means "use the vault default" and is valid.
//   - Whitespace-only input is a mistake, not a deliberate clear — reject.
//   - A leading "~/" expands to the home directory.
//   - Anything else must already be absolute; a relative path is rejected,
//     so a typo can never point the log somewhere unexpected.
// The caller saves the returned string, or leaves the field (and the
// setting) untouched when it gets null.
function normalizeLogPath(raw, home) {
  var text = String(raw == null ? "" : raw)
  if (text === "") return ""
  var trimmed = text.trim()
  if (trimmed === "") return null
  var expanded = trimmed
  if (expanded === "~") {
    if (!home) return null
    expanded = String(home)
  } else if (expanded.indexOf("~/") === 0) {
    if (!home) return null
    expanded = String(home) + expanded.slice(1)
  }
  if (expanded.charAt(0) !== "/") return null
  return expanded
}

// One table row. Pattern names come from the config file, so pipes and
// newlines are scrubbed — a name must never break the table or the line.
function logRow(dateKey, patternName, minutes, completed) {
  var name = String(patternName || "").replace(/[|\r\n]/g, " ").replace(/\s+/g, " ").trim()
  if (!name) name = "Unknown"
  return "| " + dateKey + " | " + name + " | " + Math.floor(Number(minutes) || 0) +
    " | " + (completed ? "yes" : "no") + " |"
}

// Argv for appending one row to the meditation log. The row, the path and
// the header travel as positional args so they are data to the shell, never
// syntax — a pattern name with shell metacharacters cannot escape the append.
// No mkdir -p here, unlike persistStatsCommand: if the vault folder is gone,
// the row is skipped rather than a log created somewhere the vault is not.
function appendLogCommand(logPath, row) {
  return [
    "sh", "-c",
    'if [ ! -f "$1" ]; then printf \'%s\\n\' "$3" > "$1" || exit 0; fi; printf \'%s\\n\' "$2" >> "$1"',
    "sh", logPath, row, MEDITATION_LOG_HEADER
  ]
}

function formatRemaining(totalSecs) {
  var s = Math.max(0, Math.round(totalSecs))
  var m = Math.floor(s / 60)
  var sec = s % 60
  return m + ":" + (sec < 10 ? "0" : "") + sec
}

/**
 * Reads a boolean setting written by the panel or `omarchy bar set`.
 * @param {*} value Boolean or its string representation; other values are absent/invalid.
 * @param {boolean} fallback Value to use when `value` is not an explicit boolean.
 * @returns {boolean} Parsed value or `fallback`.
 */
function flagSetting(value, fallback) {
  if (value === false || value === "false") return false
  if (value === true || value === "true") return true
  return fallback
}

/**
 * Finds the first `luotao.zen` bar entry in recursive shell.json traversal order.
 * @param {string} raw Serialized shell configuration.
 * @returns {Object} The first matching entry, or `{}` for malformed/missing input; duplicates are not merged.
 */
function barEntrySettings(raw) {
  var found = {}
  function walk(node) {
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) if (walk(node[i])) return true
      return false
    }
    if (node && typeof node === "object") {
      if (node.id === "luotao.zen") { found = node; return true }
      for (var k in node) if (walk(node[k])) return true
    }
    return false
  }
  try { walk(JSON.parse(raw || "{}")) } catch (e) {}
  return found
}

/**
 * Normalizes a saved or summoned meditation-log path.
 * @param {string|null|undefined} raw Path; a leading `~/` expands against `home`.
 * @param {string} home Quickshell's HOME directory.
 * @returns {string} Absolute path, or `""` to use the vault default when absent or invalid.
 */
function usableLogPath(raw, home) {
  // Non-string values (arrays, numbers, objects) are unusable: String() would
  // turn them into paths that tb-guide rejects. null/undefined are absent.
  if (raw === null || raw === undefined) return ""
  if (typeof raw !== "string") return ""
  var normalized = normalizeLogPath(raw, home)
  return normalized === null ? "" : normalized
}

// Matches the manifest's duration cap and keeps totalSecs = minutes * 60 int-safe.
var MAX_SESSION_MINUTES = 120

/**
 * Resolves session settings in payload → saved bar entry → built-in default order.
 * @param {Object} payload Explicit summon settings; omitted values inherit.
 * @param {Object} saved Settings from the luotao.zen bar entry.
 * @param {string} home Quickshell's HOME, used to normalize a log path.
 * @returns {{pattern: string, minutes: number, bell: boolean, dnd: boolean, animation: string, logPath: string}} Session settings; `minutes` is in minutes and capped at 120.
 */
function sessionSettings(payload, saved, home) {
  var p = payload || {}
  var s = saved || {}
  var minutes = Number(p.minutes)
  if (!isFinite(minutes) || minutes <= 0) minutes = Number(s.minutes)
  if (!isFinite(minutes) || minutes <= 0) minutes = 10
  minutes = Math.min(minutes, MAX_SESSION_MINUTES)
  return {
    pattern: p.pattern || s.pattern || "box",
    minutes: minutes,
    bell: flagSetting(p.bell, flagSetting(s.bell, true)),
    dnd: flagSetting(p.dnd, flagSetting(s.dnd, true)),
    animation: p.animation || s.animation || "random",
    logPath: usableLogPath(p.logPath, home) || usableLogPath(s.meditationLogPath, home) || ""
  }
}
