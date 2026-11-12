.pragma library

// Pure helpers for the Zen plugin: breathing patterns, session math, and
// streak bookkeeping. No Qt imports — everything here is testable data-in
// data-out.

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

function pattern(key, map) {
  var m = map || PATTERNS
  return m[String(key || "").toLowerCase()] || m.box || PATTERNS.box
}

// ---- Custom patterns. A JSON config file (default
// ~/.config/omarchy/zen/patterns.json) may add patterns:
//   {"patterns": [{"key": "slow-6", "name": "Slow 6", "hint": "in 6 · out 6",
//                  "phases": [{"label": "Breathe in", "secs": 6, "to": 1},
//                             {"label": "Breathe out", "secs": 6, "to": 0}]}]}
// Keys are lowercase letters, digits and dashes. A custom key that collides
// with a built-in (box, 478, coherent) is ignored — built-ins win. Invalid
// entries are skipped, never fatal: a typo in the config must not break the
// three patterns that already work.

function isValidPhase(ph) {
  return ph && typeof ph.label === "string" && ph.label.length > 0 &&
    typeof ph.secs === "number" && isFinite(ph.secs) && ph.secs > 0 &&
    (ph.to === 0 || ph.to === 1)
}

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
      if (seen[key]) continue
      seen[key] = true
      if (PATTERNS[key]) continue
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
      out.push({ key: key, name: p.name,
        hint: typeof p.hint === "string" ? p.hint : "",
        phases: phases })
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
  var into = t % cycleSeconds(pat)
  var from = pat.phases[pat.phases.length - 1].to
  for (var i = 0; i < pat.phases.length; i++) {
    var ph = pat.phases[i]
    if (into < ph.secs) {
      var x = ph.secs > 0 ? into / ph.secs : 1
      var eased = 0.5 - 0.5 * Math.cos(Math.PI * x)
      return {
        label: ph.label,
        secsLeft: Math.ceil(ph.secs - into),
        fullness: from + (ph.to - from) * eased
      }
    }
    into -= ph.secs
    from = ph.to
  }
  return { label: pat.phases[0].label, secsLeft: pat.phases[0].secs, fullness: from }
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

// Argv for persisting the stats file; JSON travels as a positional arg so it
// is data to the shell, never syntax.
function persistStatsCommand(path, stats) {
  return [
    "sh", "-c",
    'mkdir -p "$(dirname "$1")" && printf %s "$2" > "$1"',
    "sh", path, JSON.stringify(stats)
  ]
}

function formatRemaining(totalSecs) {
  var s = Math.max(0, Math.round(totalSecs))
  var m = Math.floor(s / 60)
  var sec = s % 60
  return m + ":" + (sec < 10 ? "0" : "") + sec
}
