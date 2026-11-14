#!/usr/bin/env python3
"""Tests for cli/tb — run with `python3 test/tb.test.py`.

Runs the real script with stubbed neighbours: a stub `tb-guide` next to
it (tb execs it via python3), stub `omarchy-shell` and `systemctl` on
PATH, and a temp HOME with a real shell.json (read with the real jq).
No session is ever started: the stubs only log their argv.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TB_PATH = os.path.join(HERE, "..", "cli", "tb")

# tb-guide is exec'd as `python3 <path> <pattern> <minutes>`, so the
# stub must be Python, not shell.
TB_GUIDE_STUB = """#!/usr/bin/env python3
import os, sys
with open(os.environ["TB_STUB_LOG"], "a") as f:
    f.write(" ".join(sys.argv[1:]) + "\\n")
"""

OMASHELL_STUB = """#!/bin/sh
echo "$@" >> "$OMASHELL_STUB_LOG"
exit 0
"""

SYSTEMCTL_STUB = """#!/bin/sh
printf 'WAYLAND_DISPLAY=wayland-1\\nDISPLAY=:0\\nXDG_RUNTIME_DIR=/run/user/1000\\nHYPRLAND_INSTANCE_SIGNATURE=abc\\nOMARCHY_PATH=/usr/share/omarchy\\n'
exit 0
"""

# shell.json shape the real jq query expects: an object somewhere with
# .id == "luotao.zen", .pattern and .minutes.
SHELL_JSON = [{"id": "luotao.zen", "pattern": "478", "minutes": 10}]

pass_count = 0


def check(name, cond):
    global pass_count
    if not cond:
        print("FAIL:", name)
        sys.exit(1)
    pass_count += 1


class TbEnv:
    """Temp HOME + temp bin dir (real tb + stub tb-guide) + stub PATH."""

    def __init__(self, with_shell_json=True):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = self.tmp.name
        self.home = os.path.join(self.dir, "home")
        os.makedirs(os.path.join(self.home, ".config", "omarchy"))
        if with_shell_json:
            with open(os.path.join(self.home, ".config", "omarchy",
                                  "shell.json"), "w") as f:
                json.dump(SHELL_JSON, f)
        self.bindir = os.path.join(self.dir, "bin")
        os.makedirs(self.bindir)
        shutil.copy(TB_PATH, os.path.join(self.bindir, "tb"))
        with open(os.path.join(self.bindir, "tb-guide"), "w") as f:
            f.write(TB_GUIDE_STUB)
        self.stubdir = os.path.join(self.dir, "stubs")
        os.makedirs(self.stubdir)
        for name, body in (("omarchy-shell", OMASHELL_STUB),
                           ("systemctl", SYSTEMCTL_STUB)):
            p = os.path.join(self.stubdir, name)
            with open(p, "w") as f:
                f.write(body)
            os.chmod(p, 0o755)
        self.tb_log = os.path.join(self.dir, "tb-guide.log")
        self.shell_log = os.path.join(self.dir, "omarchy-shell.log")
        open(self.tb_log, "w").close()
        open(self.shell_log, "w").close()

    def run(self, *args, ssh=False):
        env = dict(os.environ)
        env["HOME"] = self.home
        env["PATH"] = (self.stubdir + os.pathsep + self.bindir +
                       os.pathsep + env.get("PATH", ""))
        env["TB_STUB_LOG"] = self.tb_log
        env["OMASHELL_STUB_LOG"] = self.shell_log
        env.pop("SSH_CONNECTION", None)
        env.pop("SSH_CLIENT", None)
        if ssh:
            env["SSH_CONNECTION"] = "1.2.3.4 1234 22"
        open(self.tb_log, "w").close()
        open(self.shell_log, "w").close()
        proc = subprocess.run(
            ["bash", os.path.join(self.bindir, "tb"), *args],
            capture_output=True, text=True, env=env, timeout=30)
        guide_calls = open(self.tb_log).read().splitlines()
        shell_calls = open(self.shell_log).read().splitlines()
        return proc.returncode, proc.stdout, proc.stderr, guide_calls, shell_calls

    def close(self):
        self.tmp.cleanup()


# --- --help: usage, exit 0, nothing started ---
env = TbEnv()
for flag in ("--help", "-h"):
    rc, out, err, guide, shell = env.run(flag)
    check("tb %s exits 0" % flag, rc == 0)
    check("tb %s prints usage" % flag, "Usage: tb" in out and "--term" in out)
    check("tb %s starts nothing" % flag, guide == [] and shell == [])
rc, out, err, guide, shell = env.run("--term", "--help")
check("--help after --term still just prints help",
      rc == 0 and "Usage: tb" in out and guide == [] and shell == [])
env.close()

# --- unknown options / extra args: exit 2, nothing started ---
env = TbEnv()
for bad in ("--foo", "--halp", "-x"):
    rc, out, err, guide, shell = env.run(bad)
    check("tb %s exits 2" % bad, rc == 2)
    check("tb %s names the option" % bad, bad in err)
    check("tb %s starts nothing" % bad, guide == [] and shell == [])
rc, out, err, guide, shell = env.run("box", "5", "extra")
check("extra arg exits 2", rc == 2)
check("extra arg says too many arguments", "too many arguments" in err)
check("extra arg starts nothing", guide == [] and shell == [])
env.close()

# --- --term resolves to tb-guide with pattern + minutes ---
env = TbEnv()
rc, out, err, guide, shell = env.run("--term", "box", "1")
check("--term box 1 exits 0", rc == 0)
check("--term box 1 calls tb-guide with box 1", guide == ["box 1"])
check("--term box 1 does not summon", shell == [])
rc, out, err, guide, shell = env.run("--term")
check("--term with no args uses saved defaults",
      guide == ["478 10"])
env.close()

# --- --gui resolves to omarchy-shell summon with a JSON payload ---
env = TbEnv()
rc, out, err, guide, shell = env.run("--gui", "478", "10")
check("--gui exits 0", rc == 0)
check("--gui summons the overlay",
      len(shell) == 1 and shell[0].startswith("shell summon luotao.zen "))
payload = json.loads(shell[0].split(" ", 3)[3])
check("--gui payload carries pattern + minutes",
      payload == {"pattern": "478", "minutes": 10})
check("--gui does not run tb-guide", guide == [])
rc, out, err, guide, shell = env.run("--gui", "box", "abc")
payload = json.loads(shell[0].split(" ", 3)[3])
check("--gui with non-numeric minutes falls back to 5",
      payload == {"pattern": "box", "minutes": 5})
env.close()

# --- auto mode: SSH -> term, local -> gui ---
env = TbEnv()
rc, out, err, guide, shell = env.run(ssh=True)
check("bare tb over SSH runs the terminal guide",
      guide == ["478 10"] and shell == [])
rc, out, err, guide, shell = env.run()
check("bare tb locally summons the overlay",
      guide == [] and len(shell) == 1)
payload = json.loads(shell[0].split(" ", 3)[3])
check("bare tb locally uses saved defaults",
      payload == {"pattern": "478", "minutes": 10})
env.close()

# --- no shell.json: box / 5 defaults ---
env = TbEnv(with_shell_json=False)
rc, out, err, guide, shell = env.run("--term")
check("no shell.json falls back to box 5", guide == ["box 5"])
rc, out, err, guide, shell = env.run("478", ssh=True)
check("pattern arg keeps the saved-minutes fallback", guide == ["478 5"])
env.close()

print("tb: %d checks passed" % pass_count)
