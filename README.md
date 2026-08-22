# Zen for Omarchy

Guided-breathing meditation as a native [Omarchy](https://omarchy.org) shell plugin (Omarchy 4 "Quattro" or later). A fullscreen visual pacer — a circle that grows as you breathe in and shrinks as you breathe out — so the eyes lead the breath and the mind has one thing to come back to.

- **Breathing pacer** (fullscreen overlay) — pick a pattern, pick a length, breathe. Phase name and a countdown digit ride along; the desktop is fully hidden for the duration.
- **Bar widget** — an ensō in the bar: click to choose pattern and length, middle-click to start your usual session immediately. The tooltip carries your daily streak, the panel a seven-day practice view.
- **Session tracking** — minutes per day in `~/.local/state/omarchy/zen/stats.json`. Ending early still logs the minutes you actually practiced: a streak kept by a short session beats one lost to perfectionism.
- **Session comforts** — a soft bell at start and end, and do-not-disturb engaged for the duration (borrowed, not owned: your previous DND state is restored afterwards). Both on by default, both optional.

## Patterns

| Key | Pattern | Rhythm | Good for |
|---|---|---|---|
| `box` | Box breathing | in 4 · hold 4 · out 4 · hold 4 | steady focus |
| `478` | 4-7-8 | in 4 · hold 7 · out 8 | winding down |
| `coherent` | Coherent | in 5.5 · out 5.5 | balance, ~5.5 breaths/min |

## Install

```bash
omarchy plugin add https://github.com/ya-luotao/omarchy-zen.git --enable
```

## Keybinding

Add to `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + SHIFT + B", "Breathe",
  [[omarchy-shell shell summon luotao.zen '{"pattern": "box", "minutes": 10}']])
```

Omit the payload keys to use the defaults (`{}` works too).

## Usage

- Left-click the ensō → panel: pattern, length, **Begin** (`1`–`3` picks a pattern, `Enter` begins)
- Middle-click the ensō → start immediately with your saved defaults
- During a session: `Esc` ends early (practice up to that point still counts)
- Session complete → a notification with your updated streak

From scripts:

```bash
omarchy-shell luotao.zen start 478 5   # pattern, minutes
omarchy-shell luotao.zen status        # {"streakDays":3,"todayMinutes":15,...}
```

Pattern and length chosen in the panel are written back to `shell.json`, so your last choice is the default next time.

### Settings

```bash
omarchy bar set luotao.zen bell false   # no bells
omarchy bar set luotao.zen dnd false    # leave notifications alone
```

Per-summon overrides work too: `'{"pattern": "box", "minutes": 10, "bell": false, "dnd": false}'`.

## Uninstall

```bash
omarchy plugin remove luotao.zen
```

Remove any keybindings you added to `~/.config/hypr/bindings.lua`. Your practice history in `~/.local/state/omarchy/zen/` is left in place; delete it by hand if you want it gone.

## Roadmap

- Soundscapes (rain, brown noise) during sessions
- Interval chimes ("mindful bell every 5 minutes")

## License

MIT
