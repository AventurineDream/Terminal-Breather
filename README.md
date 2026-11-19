# Terminal Breather

Guided breathing for the Omarchy shell. Follow an animated ASCII planet or geometric figure through box breathing, 4–7–8, coherent, or your own pattern. Start a fullscreen session from the bar, or use the terminal guide when connecting over SSH.

> Fork of [omarchy-zen](https://github.com/ya-luotao/omarchy-zen), maintained as Terminal Breather.

<p align="center">
  <img src="screenshots/breathing-session.png" alt="Fullscreen breathing session with an animated figure, phase label, and countdown" width="70%" />
  <img src="screenshots/session-picker.png" alt="Session picker settings for duration, figure, bell, Do Not Disturb, and meditation log" width="28%" />
</p>

## What it does

- **Guided sessions:** an expanding and contracting ASCII figure, phase label, and countdown.
- **Three built-in patterns:** box, 4–7–8, and coherent breathing.
- **Custom patterns:** define phase lengths, labels, target figure sizes, and optional gradual tempo ramps.
- **Fourteen figures:** the sun, moon, and eight planets, plus four geometric designs; random selection is also available.
- **Bar controls:** choose a pattern, duration, and figure, or middle-click to start the saved defaults.
- **Terminal mode:** the `tb` command provides a breathing guide in an SSH terminal; `--gui` and `--term` choose the mode explicitly.
- **Session history:** records practice minutes and daily streaks; optional Obsidian logging records completed or early-ended sessions of at least one minute.
- **Optional comforts:** a start/end bell and Do Not Disturb, with the previous DND state restored after the session.
- **Optional Pomodoro pairing:** OmaPomodorchy can open a selected breathing pattern when a break begins.

## Patterns

| Key | Rhythm | Use |
|---|---|---|
| `box` | In 4 · hold 4 · out 4 · hold 4 | Steady focus |
| `478` | In 4 · hold 7 · out 8 | Winding down |
| `coherent` | In 5.5 · out 5.5 | Slow, even breathing |

## Install

Requires Omarchy Quattro or later.

```bash
omarchy plugin add https://github.com/AventurineDream/Terminal-Breather.git --enable
```

Remove the plugin with:

```bash
omarchy plugin remove luotao.zen
```

## Start a session

Click the bar icon to choose a pattern, duration, and figure. Middle-click starts the saved defaults. Press `Esc` to end early; time practiced is still recorded. The fullscreen overlay appears on each connected display.

From a terminal:

```bash
omarchy-shell luotao.zen start 478 5  # 4–7–8 breathing for five minutes
omarchy-shell luotao.zen status       # current streak and today's practice
```
Keybindings and other `omarchy-shell shell summon luotao.zen` calls use the saved panel settings for omitted fields; values explicitly included in the summon payload take precedence.

For an SSH-friendly terminal guide, install `tb` and `tb-guide` from a checkout:

```bash
install -Dm755 cli/tb ~/.local/bin/tb
install -Dm755 cli/tb-guide ~/.local/bin/tb-guide
```

```bash
tb                 # saved pattern and duration
tb 478             # choose 4–7–8, saved duration
tb coherent 5      # choose a pattern and duration
tb --term 478 5    # force the terminal guide
tb --gui 478 5     # force the Omarchy overlay
```

`tb --help` lists the supported options. Unknown flags and extra arguments are rejected rather than starting a session.

## Custom patterns

Copy [`patterns.example.json`](patterns.example.json) to `~/.config/omarchy/zen/patterns.json`. Each entry needs a unique lowercase `key`, a `name`, and at least two phases. A phase specifies its `label`, positive finite duration in seconds (`0 < secs ≤ 3600`), and figure target (`to`, from `0` fully exhaled to `1` fully inhaled). Invalid entries are skipped; built-in keys cannot be overridden. Custom patterns are available in the panel, terminal guide, and shell command.

An optional `ramp` changes the phase tempo over the start of a session. `from` and `to` are tempo multipliers from `0.01` to `100`; `overSecs` is from `0` to `3600` seconds, exclusive of `0`. An invalid ramp is dropped while the pattern remains available.

```json
{
  "patterns": [
    {
      "key": "slow-start",
      "name": "Slow start",
      "phases": [
        { "label": "Breathe in", "secs": 4, "to": 1 },
        { "label": "Breathe out", "secs": 4, "to": 0 }
      ],
      "ramp": { "from": 2, "to": 1, "overSecs": 60 }
    }
  ]
}
```

## Settings and history

The panel's **Settings** section controls the figure, bell, Do Not Disturb, and meditation-log path. These values are saved for the next session. The same options can be set through Omarchy:

```bash
omarchy bar set luotao.zen bell false
omarchy bar set luotao.zen dnd false
omarchy bar set luotao.zen animation jupiter
omarchy bar set luotao.zen meditationLogPath "$HOME/notes/meditation.md"
```

Practice minutes and streaks are stored in Omarchy's local plugin state. The optional meditation log appends a row for sessions of at least one minute, including sessions ended early. Set `meditationLogPath` to the note you want to use; the log is optional and does not create a missing parent folder.

## Video

[Watch the Terminal Breather demo](demo-terminal-breather.mp4) — a short, cropped capture of the session overlay and its breathing animation.

## Development

Run the model, renderer, and terminal-guide tests:

```bash
node test/ZenModel.test.js
node test/PlanetArt.test.js
python3 test/tb.test.py
python3 test/tb-guide.test.py
```

## Credits and license

Terminal Breather is a fork of [omarchy-zen](https://github.com/ya-luotao/omarchy-zen). See [LICENSE](LICENSE) for license terms and attribution.
