#!/usr/bin/env python3
"""Tests for cli/tb-guide — run with `python3 test/tb-guide.test.py`.

Loads the guide's pure helpers (pattern resolution, custom-pattern
loading, the circle renderer, the clock formatter, and the session
logging that mirrors BreatheOverlay.endSession) without starting a
session. The shared stats file is also exercised end to end through the
`--record-stats` CLI, against temp HOME directories. No shell needed.
"""

import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
GUIDE_PATH = os.path.join(HERE, "..", "cli", "tb-guide")

_src = open(GUIDE_PATH, encoding="utf-8").read()
# Only the definitions above main(); main() itself starts a session.
_ns = {}
exec(_src.split('if __name__ == "__main__":')[0], _ns)

resolve_pattern = _ns["resolve_pattern"]
circle_block = _ns["circle_block"]
fmt_clock = _ns["fmt_clock"]
load_custom_patterns = _ns["load_custom_patterns"]
normalize_log_path = _ns["normalize_log_path"]
default_log_path = _ns["default_log_path"]
parse_stats = _ns["parse_stats"]
add_minutes = _ns["add_minutes"]
log_row = _ns["log_row"]
log_session = _ns["log_session"]
breath_at = _ns["breath_at"]
ramp_base_time = _ns["ramp_base_time"]
ramp_scale = _ns["ramp_scale"]
parse_minutes = _ns["parse_minutes"]
parse_stats_strict = _ns["parse_stats_strict"]
add_stats_minutes = _ns["add_stats_minutes"]
flag_setting = _ns["flag_setting"]
resolve_log_path = _ns["resolve_log_path"]

pass_count = 0


def check(name, cond):
    global pass_count
    if not cond:
        print("FAIL:", name)
        sys.exit(1)
    pass_count += 1


def strip_ansi(s):
    return re.sub(r"\x1b\[[0-9;]*m", "", s)


# --- built-in patterns mirror ZenModel.js PATTERNS ---
box = resolve_pattern("box")
check("box name", box["name"] == "Box breathing")
check("box phases", box["phases"] == [
    ("Breathe in", 4, 1),
    ("Hold", 4, 1),
    ("Breathe out", 4, 0),
    ("Hold", 4, 0),
])
four78 = resolve_pattern("478")
check("478 phases", four78["phases"] == [
    ("Breathe in", 4, 1),
    ("Hold", 7, 1),
    ("Breathe out", 8, 0),
])
coherent = resolve_pattern("coherent")
check("coherent phases", coherent["phases"] == [
    ("Breathe in", 5.5, 1),
    ("Breathe out", 5.5, 0),
])
check("unknown key falls back to box",
      resolve_pattern("nope")["name"] == "Box breathing")

# --- custom patterns from patterns.json (temp HOME) ---
with tempfile.TemporaryDirectory() as tmp:
    os.environ["HOME"] = tmp
    os.makedirs(os.path.join(tmp, ".config", "omarchy", "zen"))
    with open(os.path.join(tmp, ".config", "omarchy", "zen",
                           "patterns.json"), "w") as f:
        json.dump({"patterns": [
            {"key": "slow-6", "name": "Slow 6", "phases": [
                {"label": "Breathe in", "secs": 6, "to": 1},
                {"label": "Breathe out", "secs": 6, "to": 0},
            ]},
            # Invalid entries are skipped, not fatal.
            {"key": "broken", "name": "Broken", "phases": [
                {"label": "Breathe in", "secs": "six", "to": 1},
            ]},
        ]}, f)
    check("custom pattern resolves",
          resolve_pattern("slow-6")["phases"] == [
              ("Breathe in", 6, 1),
              ("Breathe out", 6, 0),
          ])
    check("broken custom pattern falls back to box",
          resolve_pattern("broken")["name"] == "Box breathing")
    check("custom loader skips the broken entry",
          "broken" not in load_custom_patterns())

# --- circle renderer ---
small = circle_block(2.5, 9, "36")
full = circle_block(9, 9, "36")
check("circle block height is fixed", len(small) == 19 and len(full) == 19)
check("circle grows with radius",
      sum(ln.count("●") for ln in full) > sum(ln.count("●") for ln in small))
check("circle is centred in its block",
      small[9].strip() != "" and small[0].strip() == "")
check("circle lines are colour-coded",
      any("\x1b[36m" in ln for ln in full if ln.strip()))
check("circle is roughly round",
      len(strip_ansi(full[9]).rstrip()) > len(strip_ansi(full[0]).rstrip()))

# --- clock formatter ---
check("fmt_clock 0:00", fmt_clock(0) == "0:00")
check("fmt_clock 1:05", fmt_clock(65) == "1:05")
check("fmt_clock rounds up partial seconds", fmt_clock(59.2) == "1:00")
check("fmt_clock clamps negatives", fmt_clock(-5) == "0:00")

# --- log-path normalisation (mirrors ZenModel.js normalizeLogPath) ---
check("normalize: empty means vault default",
      normalize_log_path("", "/home/aven") == "")
check("normalize: None means vault default",
      normalize_log_path(None, "/home/aven") == "")
check("normalize: whitespace-only is rejected",
      normalize_log_path("   ", "/home/aven") is None)
check("normalize: trims the path",
      normalize_log_path("  /tmp/log.md  ", "/home/aven") == "/tmp/log.md")
check("normalize: leading ~/ expands",
      normalize_log_path("~/notes/meditation.md", "/home/aven") ==
      "/home/aven/notes/meditation.md")
check("normalize: bare ~ expands to home",
      normalize_log_path("~", "/home/aven") == "/home/aven")
check("normalize: bare ~ with no home is rejected",
      normalize_log_path("~", "") is None)
check("normalize: relative path is rejected",
      normalize_log_path("notes/log.md", "/home/aven") is None)
check("normalize: absolute path passes through",
      normalize_log_path("/tmp/log.md", "/home/aven") == "/tmp/log.md")
check("default log path is the vault meditation log",
      default_log_path("/home/aven") ==
      "/home/aven/Projects/Obsidian/Aventurine/20_Practices/Meditation/Meditation Log.md")

# --- stats helpers (mirror ZenModel.js parseStats / addMinutes) ---
check("parse_stats: bad input gives empty days",
      parse_stats("not json") == {"days": {}})
check("parse_stats: keeps the days map",
      parse_stats('{"days": {"2026-11-13": 5}}') ==
      {"days": {"2026-11-13": 5}})
check("add_minutes: adds to today and rounds",
      add_minutes({"days": {"2026-11-13": 5}}, "2026-11-13", 2.4) ==
      {"days": {"2026-11-13": 7}})
check("add_minutes: starts a missing day at the minutes",
      add_minutes({"days": {}}, "2026-11-13", 3) ==
      {"days": {"2026-11-13": 3}})

# --- log rows (mirror ZenModel.js logRow) ---
check("log_row: completed session",
      log_row("2026-11-13", "Box breathing", 5, True) ==
      "| 2026-11-13 | Box breathing | 5 | yes |")
check("log_row: ended early",
      log_row("2026-11-13", "4-7-8", 3, False) ==
      "| 2026-11-13 | 4-7-8 | 3 | no |")
check("log_row: pipes and newlines are scrubbed",
      log_row("2026-11-13", "A | B\nC", 5, True) ==
      "| 2026-11-13 | A B C | 5 | yes |")
check("log_row: empty name becomes Unknown",
      log_row("2026-11-13", "   ", 5, True) ==
      "| 2026-11-13 | Unknown | 5 | yes |")
check("log_row: minutes are floored",
      log_row("2026-11-13", "Box breathing", 5.9, True) ==
      "| 2026-11-13 | Box breathing | 5 | yes |")

# --- log_session: end-to-end, against a temp HOME ---
# (STATS_PATH is a module constant, so point it at the temp dir too.)
with tempfile.TemporaryDirectory() as tmp:
    os.environ["HOME"] = tmp
    stats_dir = os.path.join(tmp, ".local", "state", "omarchy", "zen")
    stats_path = os.path.join(stats_dir, "stats.json")
    _ns["STATS_PATH"] = stats_path
    # The vault-default log folder exists in this temp HOME, so the row
    # lands; a second case below removes it to check the skip.
    log_dir = os.path.join(tmp, "Projects", "Obsidian", "Aventurine",
                           "20_Practices", "Meditation")
    os.makedirs(log_dir)
    log_path = os.path.join(log_dir, "Meditation Log.md")

    # A 65-second ended-early session logs 1 minute (floor).
    check("log_session: 65s early logs 1 min",
          log_session("Box breathing", 65, 300, False) == 1)
    with open(stats_path) as f:
        stats = json.load(f)
    today = stats["days"]
    check("log_session: stats gain today's minute",
          len(today) == 1 and list(today.values())[0] == 1)
    with open(log_path) as f:
        log_text = f.read()
    check("log_session: log file is created with the header",
          log_text.startswith("# Meditation Log"))
    check("log_session: row is appended, ended early",
          "| Box breathing | 1 | no |" in log_text)

    # A completed 5-minute session logs 5 minutes (round of total).
    check("log_session: completed 5 min logs 5",
          log_session("4-7-8", 300, 300, True) == 5)
    with open(stats_path) as f:
        stats = json.load(f)
    check("log_session: stats accumulate across sessions",
          list(stats["days"].values())[0] == 6)
    with open(log_path) as f:
        log_text = f.read()
    check("log_session: completed row is appended",
          "| 4-7-8 | 5 | yes |" in log_text)

    # Under a minute: nothing is logged, no file is created.
    with tempfile.TemporaryDirectory() as tmp2:
        os.environ["HOME"] = tmp2
        _ns["STATS_PATH"] = os.path.join(tmp2, "stats.json")
        check("log_session: 45s logs nothing",
              log_session("Box breathing", 45, 300, False) == 0)
        check("log_session: no stats file under a minute",
              not os.path.exists(os.path.join(tmp2, "stats.json")))

    # Missing log folder: stats still land, the row is skipped silently.
    with tempfile.TemporaryDirectory() as tmp3:
        os.environ["HOME"] = tmp3
        _ns["STATS_PATH"] = os.path.join(tmp3, "stats.json")
        check("log_session: missing folder still returns the minutes",
              log_session("Box breathing", 120, 300, False) == 2)
        with open(os.path.join(tmp3, "stats.json")) as f:
            check("log_session: stats land when the folder is missing",
                  list(json.load(f)["days"].values())[0] == 2)
        check("log_session: no log file is created when the folder is missing",
              not os.path.exists(os.path.join(
                  tmp3, "Projects", "Obsidian", "Aventurine",
                  "20_Practices", "Meditation", "Meditation Log.md")))

# --- custom patterns: parity with ZenModel.js parseCustomPatterns ---
def custom_from(raw):
    """Load custom patterns from a patterns.json holding raw text."""
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["HOME"] = tmp
        zen_dir = os.path.join(tmp, ".config", "omarchy", "zen")
        os.makedirs(zen_dir)
        with open(os.path.join(zen_dir, "patterns.json"), "w") as f:
            f.write(raw)
        return load_custom_patterns()


def cfg(*entries):
    return json.dumps({"patterns": list(entries)})


def phase(label, secs, to):
    return {"label": label, "secs": secs, "to": to}


GOOD = {"key": "good-one", "name": "Good",
        "phases": [phase("In", 2, 1), phase("Out", 2, 0)]}
check("custom: a valid entry is kept", list(custom_from(cfg(GOOD))) == ["good-one"])
check("custom: a built-in key cannot be overridden",
      "box" not in custom_from(cfg(dict(GOOD, key="box", name="Hijack"))))
check("custom: keys are lowercased", "slow-6" in custom_from(cfg(dict(GOOD, key="Slow-6"))))
check("custom: a key with other characters is skipped",
      custom_from(cfg(dict(GOOD, key="bad_key"))) == {})
check("custom: a phase target other than 0 or 1 is skipped",
      custom_from(cfg(dict(GOOD, key="half", phases=[phase("In", 2, 0.5), phase("Out", 2, 0)]))) == {})
check("custom: a single phase is skipped",
      custom_from(cfg(dict(GOOD, key="one", phases=[phase("In", 2, 1)]))) == {})
check("custom: zero seconds are skipped",
      custom_from(cfg(dict(GOOD, key="zero", phases=[phase("In", 0, 1), phase("Out", 2, 0)]))) == {})
check("custom: a missing name is skipped",
      custom_from(cfg({"key": "noname", "phases": GOOD["phases"]})) == {})
check("custom: a bad first entry holds its key, as ZenModel does",
      custom_from(cfg(dict(GOOD, key="dup", name=""), dict(GOOD, key="dup"))) == {})
check("custom: the first valid duplicate wins",
      custom_from(cfg(dict(GOOD, key="twice"), dict(GOOD, key="twice", name="Second")))["twice"]["name"] == "Good")
check("custom: a non-list patterns field does not crash", custom_from('{"patterns": 5}') == {})
check("custom: a non-object file does not crash", custom_from("[]") == {})
check("custom: a non-object entry is skipped", list(custom_from(cfg("junk", GOOD))) == ["good-one"])
# NaN and Infinity are not JSON: a file or stats blob holding them is malformed,
# as ZenModel.js's JSON.parse treats it, so the guide ignores it too.
check("json constants: NaN, Infinity and -Infinity make the input malformed, as in ZenModel",
      all(custom_from('{"patterns": [%s], "note": %s}' % (json.dumps(GOOD), c)) == {}
          for c in ("NaN", "Infinity", "-Infinity")) and
      parse_stats('{"days": {"2026-11-13": NaN}}') == {"days": {}})
# A 400-digit integer is valid JSON that math.isfinite cannot take (OverflowError).
# It must count as not finite: the pattern is skipped, or the ramp dropped, never a crash.
HUGE = int("1" * 400)
check("custom: a 400-digit phase secs is skipped without a crash",
      custom_from(cfg(dict(GOOD, key="huge", phases=[phase("In", HUGE, 1), phase("Out", 2, 0)]))) == {})
check("ramp: a 400-digit ramp from is dropped and the pattern kept",
      "ramp" not in custom_from(cfg(dict(GOOD, key="fire", phases=[phase("In", 0.5, 1), phase("Out", 0.5, 0)],
                                         ramp={"from": HUGE, "to": 0.5, "overSecs": 60})))["fire"])

FIRE = dict(GOOD, key="fire", name="Fire", phases=[phase("In", 0.5, 1), phase("Out", 0.5, 0)],
            ramp={"from": 2, "to": 0.5, "overSecs": 60})
fire_pat = custom_from(cfg(FIRE))["fire"]
check("ramp: a valid ramp is kept", fire_pat["ramp"] == {"from": 2.0, "to": 0.5, "overSecs": 60.0})
check("ramp: an invalid ramp is dropped and the pattern kept",
      "ramp" not in custom_from(cfg(dict(FIRE, ramp={"from": 0, "to": 0.5, "overSecs": 60})))["fire"])
check("ramp: an underflowing to/from ratio is dropped and the pattern kept",
      "ramp" not in custom_from(cfg(dict(FIRE, ramp={"from": 1e300, "to": 1e-300, "overSecs": 60})))["fire"])
check("ramp: an overflowing to/from ratio is dropped and the pattern kept",
      "ramp" not in custom_from(cfg(dict(FIRE, ramp={"from": 1e-300, "to": 1e300, "overSecs": 60})))["fire"])
check("bounds: a 1e308 phase is dropped (would overflow breath_at's countdown)",
      custom_from(cfg(dict(GOOD, key="huge-phase", phases=[phase("In", 1e308, 1), phase("Out", 2, 0)]))) == {})
check("bounds: a 1e308 ramp factor drops the ramp and keeps the pattern",
      "ramp" not in custom_from(cfg(dict(FIRE, ramp={"from": 2, "to": 1e308, "overSecs": 60})))["fire"])
EDGE = custom_from(cfg(dict(GOOD, key="edge", phases=[phase("In", 3600, 1), phase("Out", 3600, 0)],
                            ramp={"from": 100, "to": 0.01, "overSecs": 3600})))["edge"]
check("bounds: the extreme allowed values keep the ramp", "ramp" in EDGE)
check("bounds: breath_at at the extreme stays finite (NaN and inf fail this)",
      breath_at(EDGE, 1000)[1] < 1e6)
check("ramp_scale: starts at the from tempo", ramp_scale(fire_pat, 0) == 2.0)
check("ramp_scale: halfway is 1.25", abs(ramp_scale(fire_pat, 30) - 1.25) < 1e-9)
check("ramp_scale: holds at the to tempo after overSecs", ramp_scale(fire_pat, 120) == 0.5)
check("ramp_base_time: matches ZenModel at 30s", abs(ramp_base_time(fire_pat, 30) - 18.8001) < 0.01)
check("ramp_base_time: matches ZenModel at 60s", abs(ramp_base_time(fire_pat, 60) - 55.4518) < 0.01)
check("ramp_base_time: matches ZenModel at 120s", abs(ramp_base_time(fire_pat, 120) - 175.4518) < 0.01)
check("ramp_base_time: no ramp is real time", ramp_base_time(resolve_pattern("box"), 42) == 42)

HOLD_IN = custom_from(cfg(dict(GOOD, key="hold-in", phases=[phase("In", 2, 1), phase("Hold", 2, 1)])))["hold-in"]
check("breath_at: the first phase starts from the last phase's fullness, as ZenModel",
      breath_at(HOLD_IN, 0)[2] == 1.0)
check("breath_at: box starts empty and inhales",
      breath_at(resolve_pattern("box"), 0) == ("Breathe in", 4, 0.0))
label, left, full = breath_at(resolve_pattern("box"), 5)
check("breath_at: box at 5s is a full hold with 3s left", label == "Hold" and left == 3 and full == 1.0)
check("breath_at: a ramped pattern at 0s shows one tick of In", breath_at(fire_pat, 0)[:2] == ("In", 1))
check("breath_at: the ramp moves the phase timeline (fire at 30s is Out)", breath_at(fire_pat, 30)[0] == "Out")
check("resolve_pattern: built-in keys ignore case", resolve_pattern("COHERENT")["name"] == "Coherent")

# --- session length: default 5, capped at 120 (CLI argument) ---
check("minutes: an absent argument gives the default 5",
      parse_minutes(None) == 5)
check("minutes: a normal value is kept",
      parse_minutes("45") == 45)
check("minutes: the cap itself is kept",
      parse_minutes("120") == 120)
check("minutes: 121 is clamped to 120",
      parse_minutes("121") == 120)
check("minutes: a very large integer is clamped to 120",
      parse_minutes("9" * 400) == 120)
check("minutes: zero falls back to the default 5",
      parse_minutes("0") == 5)
check("minutes: a negative value falls back to the default 5",
      parse_minutes("-3") == 5)
check("minutes: non-numeric text falls back to the default 5",
      parse_minutes("soon") == 5)
check("minutes: a decimal is invalid and falls back to the default 5",
      parse_minutes("2.5") == 5)

# --- shared stats file: locked merge, atomic replace, --record-stats ---
def run_guide(args, home):
    """Runs tb-guide with args and a temp HOME; returns the CompletedProcess."""
    return subprocess.run([sys.executable, GUIDE_PATH] + args,
                          env=dict(os.environ, HOME=home), capture_output=True, text=True)


def _refuse(*args, **kwargs):
    raise OSError("simulated failure")


def add_with_failure(path, which):
    """Runs add_stats_minutes with os.<which> refusing; returns True when it raised."""
    real = getattr(os, which)
    setattr(os, which, _refuse)
    try:
        add_stats_minutes(path, "2026-11-11", 4)
        return False
    except OSError:
        return True
    finally:
        setattr(os, which, real)


with tempfile.TemporaryDirectory() as tmp:
    stats_dir = os.path.join(tmp, "zen")
    stats_path = os.path.join(stats_dir, "stats.json")
    os.makedirs(stats_dir)
    with open(stats_path, "w") as f:
        f.write('{"days":{"2026-11-10":3}}')
    # 24 writers at once, each adding one minute to the same day. A stale
    # snapshot written by any of them would drop the others' minutes.
    procs = [subprocess.Popen([sys.executable, GUIDE_PATH, "--record-stats",
                               stats_path, "2026-11-11", "1"],
                              env=dict(os.environ, HOME=tmp), stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True)
             for _ in range(24)]
    for p in procs:
        p.communicate()
    check("concurrent writers: every writer exits 0", all(p.returncode == 0 for p in procs))
    with open(stats_path) as f:
        check("concurrent writers: no minute is lost and the other day is kept",
              f.read() == '{"days":{"2026-11-10":3,"2026-11-11":24}}')
    check("concurrent writers: only the stats file and its lock remain",
          sorted(os.listdir(stats_dir)) == ["stats.json", "stats.json.lock"])

# A write that fails part-way leaves the previous file byte-identical and no temp file.
with tempfile.TemporaryDirectory() as tmp:
    stats_path = os.path.join(tmp, "stats.json")
    original = '{"days":{"2026-11-10":3}}'
    for which in ("fsync", "replace"):
        with open(stats_path, "w") as f:
            f.write(original)
        check("interrupted write (%s) raises instead of reporting success" % which,
              add_with_failure(stats_path, which))
        with open(stats_path) as f:
            check("interrupted write (%s) leaves the original byte-identical" % which,
                  f.read() == original)
        check("interrupted write (%s) leaves no temp file" % which,
              sorted(os.listdir(tmp)) == ["stats.json", "stats.json.lock"])

# A truncated file is set aside as a .corrupt copy, never overwritten in place.
with tempfile.TemporaryDirectory() as tmp:
    stats_path = os.path.join(tmp, "stats.json")
    truncated = '{"days":{"2026-11-10":'
    with open(stats_path, "w") as f:
        f.write(truncated)
    add_stats_minutes(stats_path, "2026-11-11", 2)
    backups = [n for n in os.listdir(tmp) if n.startswith("stats.json.corrupt-")]
    check("a truncated stats file is kept as a .corrupt copy", len(backups) == 1)
    with open(os.path.join(tmp, backups[0])) as f:
        check("the .corrupt copy keeps the original bytes", f.read() == truncated)
    with open(stats_path) as f:
        check("the fresh stats file holds the new minutes", f.read() == '{"days":{"2026-11-11":2}}')
check("parse_stats: a JSON list is not a stats file",
      parse_stats("[1]") == {"days": {}} and parse_stats_strict("[1]") is None)

# An empty file holds no history: no .corrupt copy, just the new minutes.
with tempfile.TemporaryDirectory() as tmp:
    stats_path = os.path.join(tmp, "stats.json")
    open(stats_path, "w").close()
    add_stats_minutes(stats_path, "2026-11-11", 2)
    check("an empty stats file is not set aside as corrupt",
          not [n for n in os.listdir(tmp) if ".corrupt-" in n])
    with open(stats_path) as f:
        check("an empty stats file gets the new minutes", f.read() == '{"days":{"2026-11-11":2}}')

# An unlocked omarchy-zen write caught half-way (truncated, then written in place)
# is re-read once it lands: its history is merged, not set aside.
with tempfile.TemporaryDirectory() as tmp:
    stats_path = os.path.join(tmp, "stats.json")
    with open(stats_path, "w") as f:
        f.write('{"days":{"2026-11-10":')

    def finish_zen_write():
        time.sleep(0.08)
        with open(stats_path, "r+") as f:
            f.seek(0)
            f.write('{"days":{"2026-11-10":7}}')
            f.truncate()

    writer = threading.Thread(target=finish_zen_write)
    writer.start()
    add_stats_minutes(stats_path, "2026-11-11", 2)
    writer.join()
    with open(stats_path) as f:
        check("a half-written stats file is re-read and merged once it lands",
              json.loads(f.read()) == {"days": {"2026-11-10": 7, "2026-11-11": 2}})
    check("a half-written stats file that lands is not set aside as corrupt",
          not [n for n in os.listdir(tmp) if ".corrupt-" in n])

# --- an unlocked omarchy-zen write landing mid-write ---
# omarchy-zen (upstream luotao.zen) keeps the file in memory, adds its minutes, and
# writes the whole snapshot in place with this command, without the lock.
ZEN_PERSIST = 'mkdir -p "$(dirname "$1")" && printf %s "$2" > "$1"'


def zen_session(path, day, minutes):
    """One omarchy-zen session end: its (fresh) snapshot plus minutes, written in place."""
    try:
        with open(path) as f:
            snapshot = parse_stats(f.read())
    except OSError:
        snapshot = {"days": {}}
    stats = add_minutes(snapshot, day, minutes)
    subprocess.run(["sh", "-c", ZEN_PERSIST, "sh", path, json.dumps(stats, separators=(",", ":"))],
                   check=True)


def with_hook(which, before, calls=1, when=lambda *a: True):
    """Patches os.<which> so its first `calls` matching calls run before() first.
    Returns a function that restores the real os.<which>."""
    real = getattr(os, which)
    left = {"n": calls}

    def hooked(*args, **kwargs):
        if left["n"] > 0 and when(*args):
            left["n"] -= 1
            before()
        return real(*args, **kwargs)

    setattr(os, which, hooked)
    return lambda: setattr(os, which, real)


def is_temp_rename(src, dst, *rest):
    return str(src).endswith(".tmp")


def read_days(path):
    with open(path) as f:
        return json.load(f)["days"]


def leftovers(directory):
    return sorted(n for n in os.listdir(directory) if n not in ("stats.json", "stats.json.lock"))


# Zen lands after the read, while the merged copy is being written and fsynced: the
# copy is dropped, and the merge reruns on Zen's file. Both sessions' minutes stay.
with tempfile.TemporaryDirectory() as tmp:
    stats_path = os.path.join(tmp, "stats.json")
    with open(stats_path, "w") as f:
        f.write('{"days":{"2026-11-10":3}}')
    restore = with_hook("fsync", lambda: zen_session(stats_path, "2026-11-11", 5))
    try:
        add_stats_minutes(stats_path, "2026-11-11", 2)
    finally:
        restore()
    check("zen write before the rename: zen's and breather's minutes both kept",
          read_days(stats_path) == {"2026-11-10": 3, "2026-11-11": 7})
    check("zen write before the rename: the dropped copy leaves no temp file",
          leftovers(tmp) == [])

# Zen opens the file just before the rename and writes into the replaced inode: the
# late write is read back from that inode and its minutes merged into the new file.
with tempfile.TemporaryDirectory() as tmp:
    stats_path = os.path.join(tmp, "stats.json")
    with open(stats_path, "w") as f:
        f.write('{"days":{"2026-11-10":3}}')
    restore = with_hook("replace", lambda: zen_session(stats_path, "2026-11-11", 5),
                        when=is_temp_rename)
    try:
        add_stats_minutes(stats_path, "2026-11-11", 2)
    finally:
        restore()
    check("zen write into the replaced file: zen's and breather's minutes both kept",
          read_days(stats_path) == {"2026-11-10": 3, "2026-11-11": 7})
    check("zen write into the replaced file: no temp or corrupt file left", leftovers(tmp) == [])

# The same, with Zen's truncate caught before its write lands: the replaced inode is
# re-read until the write arrives.
with tempfile.TemporaryDirectory() as tmp:
    stats_path = os.path.join(tmp, "stats.json")
    with open(stats_path, "w") as f:
        f.write('{"days":{"2026-11-10":3}}')
    writers = []

    def zen_truncate_then_write():
        f = open(stats_path, "r+")
        f.truncate(0)

        def finish():
            time.sleep(0.08)
            f.write('{"days":{"2026-11-10":3,"2026-11-11":5}}')
            f.close()

        writers.append(threading.Thread(target=finish))
        writers[0].start()

    restore = with_hook("replace", zen_truncate_then_write, when=is_temp_rename)
    try:
        add_stats_minutes(stats_path, "2026-11-11", 2)
    finally:
        restore()
    writers[0].join()
    check("zen write landing late in the replaced file: both sessions' minutes kept",
          read_days(stats_path) == {"2026-11-10": 3, "2026-11-11": 7})

# A late Zen write from a snapshot older than the file does not take minutes away:
# only what it added is merged, so the day it lacks keeps its total.
with tempfile.TemporaryDirectory() as tmp:
    stats_path = os.path.join(tmp, "stats.json")
    with open(stats_path, "w") as f:
        f.write('{"days":{"2026-11-10":3}}')

    def stale_zen():
        subprocess.run(["sh", "-c", ZEN_PERSIST, "sh", stats_path, '{"days":{"2026-11-11":5}}'],
                       check=True)

    restore = with_hook("replace", stale_zen, when=is_temp_rename)
    try:
        add_stats_minutes(stats_path, "2026-11-11", 2)
    finally:
        restore()
    check("a stale late zen write adds its minutes without dropping other days",
          read_days(stats_path) == {"2026-11-10": 3, "2026-11-11": 7})

# No stats file yet, and Zen's first write lands in the window: it goes into the
# empty file this writer created and holds, so its minutes are merged too.
with tempfile.TemporaryDirectory() as tmp:
    stats_path = os.path.join(tmp, "stats.json")
    restore = with_hook("replace", lambda: zen_session(stats_path, "2026-11-11", 4),
                        when=is_temp_rename)
    try:
        add_stats_minutes(stats_path, "2026-11-11", 2)
    finally:
        restore()
    check("zen's first-ever write racing breather's: both sessions' minutes kept",
          read_days(stats_path) == {"2026-11-11": 6})

# A file that changes on every attempt: the write gives up with an error rather than
# replacing it, and the other writer's history is left exactly as it wrote it.
with tempfile.TemporaryDirectory() as tmp:
    stats_path = os.path.join(tmp, "stats.json")
    with open(stats_path, "w") as f:
        f.write('{"days":{"2026-11-10":3}}')
    attempts = _ns["STATS_WRITE_ATTEMPTS"]
    restore = with_hook("fsync", lambda: zen_session(stats_path, "2026-11-11", 1), calls=attempts)
    try:
        add_stats_minutes(stats_path, "2026-11-11", 2)
        gave_up = False
    except OSError:
        gave_up = True
    finally:
        restore()
    check("a file changing on every attempt makes the write fail", gave_up)
    check("a file changing on every attempt is never written over",
          read_days(stats_path) == {"2026-11-10": 3, "2026-11-11": attempts})
    check("a write that gave up leaves no temp file", leftovers(tmp) == [])

# The writer keeps the file's mode, and creates a new file (and its folders) at 0644.
with tempfile.TemporaryDirectory() as tmp:
    stats_path = os.path.join(tmp, "stats.json")
    with open(stats_path, "w") as f:
        f.write('{"days":{}}')
    os.chmod(stats_path, 0o600)
    add_stats_minutes(stats_path, "2026-11-11", 1)
    check("an existing stats file keeps its permission bits",
          stat.S_IMODE(os.stat(stats_path).st_mode) == 0o600)
    fresh = os.path.join(tmp, "new", "zen", "stats.json")
    add_stats_minutes(fresh, "2026-11-11", 1)
    check("a new stats file is 0644 and its folders are created",
          stat.S_IMODE(os.stat(fresh).st_mode) == 0o644)

# --record-stats validates before writing; bad input exits 2 and creates nothing.
with tempfile.TemporaryDirectory() as tmp:
    target = os.path.join(tmp, "stats.json")
    for args in (["relative/stats.json", "2026-11-11", "5"],
                 [target, "11-11-2026", "5"],
                 [target, "2026-11-11x", "5"],
                 [target, "2026-11-11", "0"],
                 [target, "2026-11-11", "-1"],
                 [target, "2026-11-11", "1000000"],
                 [target, "2026-11-11", "2.5"],
                 [target, "2026-11-11"]):
        r = run_guide(["--record-stats"] + args, tmp)
        check("record-stats rejects %r with exit 2" % (args,),
              r.returncode == 2 and not os.path.exists(target))
    r = run_guide(["--record-stats", target, "2026-11-11", "999999"], tmp)
    with open(target) as f:
        check("record-stats accepts the largest minutes value",
              r.returncode == 0 and f.read() == '{"days":{"2026-11-11":999999}}')
    blocker = os.path.join(tmp, "afile")
    open(blocker, "w").close()
    r = run_guide(["--record-stats", os.path.join(blocker, "stats.json"), "2026-11-11", "5"], tmp)
    check("record-stats exits 1 and reports when the file cannot be written",
          r.returncode == 1 and "could not record stats" in r.stderr)


def write_shell(home, value):
    """Writes a shell.json whose aven.terminal-breather entry sets meditationLogEnabled."""
    config = os.path.join(home, ".config", "omarchy")
    os.makedirs(config, exist_ok=True)
    with open(os.path.join(config, "shell.json"), "w") as f:
        json.dump({"bar": [{"id": "aven.terminal-breather", "meditationLogEnabled": value}]}, f)


# The Off setting: minutes keep counting, and no row (or log file) is written.
with tempfile.TemporaryDirectory() as tmp:
    os.environ["HOME"] = tmp
    stats_path = os.path.join(tmp, ".local", "state", "omarchy", "zen", "stats.json")
    _ns["STATS_PATH"] = stats_path
    log_dir = os.path.join(tmp, "Projects", "Obsidian", "Aventurine",
                           "20_Practices", "Meditation")
    os.makedirs(log_dir)
    log_path = os.path.join(log_dir, "Meditation Log.md")
    write_shell(tmp, False)
    check("log off: a session still returns its minutes",
          log_session("Box breathing", 300, 300, True) == 5)
    with open(stats_path) as f:
        check("log off: the minutes still count in stats", list(json.load(f)["days"].values()) == [5])
    check("log off: no meditation log is written", not os.path.exists(log_path))
    write_shell(tmp, "false")
    log_session("Box breathing", 60, 300, False)
    check("log off as the string false also skips the log", not os.path.exists(log_path))
    write_shell(tmp, True)
    log_session("Box breathing", 60, 300, False)
    with open(log_path) as f:
        check("log back on: the row is appended", "| Box breathing | 1 | no |" in f.read())

# meditationLogPath from shell.json is the log the guide writes to.
with tempfile.TemporaryDirectory() as tmp:
    os.environ["HOME"] = tmp
    custom = os.path.join(tmp, "notes")
    os.makedirs(custom)
    write_shell(tmp, True)
    with open(os.path.join(tmp, ".config", "omarchy", "shell.json"), "w") as f:
        json.dump({"bar": [{"id": "aven.terminal-breather",
                            "meditationLogPath": os.path.join(custom, "m.md")}]}, f)
    check("resolve_log_path: the shell.json meditationLogPath is used",
          resolve_log_path() == os.path.join(custom, "m.md"))
with tempfile.TemporaryDirectory() as tmp:
    os.environ["HOME"] = tmp
    check("resolve_log_path: with no shell.json it is the vault default",
          resolve_log_path() == default_log_path(tmp))

check("flag_setting: booleans and their strings are explicit",
      flag_setting(False, True) is False and flag_setting("false", True) is False and
      flag_setting(True, False) is True and flag_setting("true", False) is True)
check("flag_setting: absent or junk values take the fallback",
      flag_setting(None, True) is True and flag_setting(0, True) is True and
      flag_setting("nope", False) is False)
check("add_minutes: a string day total counts as its number",
      add_minutes({"days": {"2026-11-11": "5"}}, "2026-11-11", 2) == {"days": {"2026-11-11": 7}})
check("add_minutes: a non-numeric day total counts as no minutes",
      add_minutes({"days": {"2026-11-11": "x"}}, "2026-11-11", 2) == {"days": {"2026-11-11": 2}})

print("tb-guide: %d checks passed" % pass_count)
