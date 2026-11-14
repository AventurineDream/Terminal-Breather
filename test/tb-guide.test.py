#!/usr/bin/env python3
"""Tests for cli/tb-guide — run with `python3 test/tb-guide.test.py`.

Loads the guide's pure helpers (pattern resolution, custom-pattern
loading, the circle renderer, the clock formatter) without starting a
session. No shell needed.
"""

import json
import os
import re
import sys
import tempfile

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

print("tb-guide: %d checks passed" % pass_count)
