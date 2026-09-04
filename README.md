# Random Mouse Mover

One button. The pointer goes somewhere else.

**Live site:** _(GitHub Pages URL goes here once Pages is enabled)_

## What this is

Two halves that do the same thing at different levels:

| | What it moves | How |
|---|---|---|
| **The web page** | A pointer drawn on the page, with a fading trail | Click the one button |
| **The scripts** | Your **real** system cursor | Download and run |

A web page cannot move your operating system's cursor. There's no JavaScript API
for it and browsers block it deliberately — a page that could reposition your
pointer could make you click things you never meant to click. (Pointer Lock can
*hide* the cursor inside a page, but not place it.) So the button on the site
animates a pointer within the page, and the real mouse-moving lives in
[`scripts/`](scripts/), which the site hands you as a download for whichever OS
you're on.

Both halves use the same movement rule: hop to a random point up to **half a
screen** away in each axis, eased in and out so it looks like a hand did it,
clamped to the screen edges.

## Running the real thing

### Windows — no installs

```powershell
powershell -ExecutionPolicy Bypass -File mouse_mover.ps1
```

Uses `System.Windows.Forms.Cursor`, which ships with Windows.

### macOS / Linux — needs `python3`

```bash
python3 mouse_mover.py
```

On macOS the first run triggers an Accessibility prompt: **System Settings →
Privacy & Security → Accessibility**, and enable whichever app you launched it
from (Terminal, iTerm, VS Code…). The script talks to CoreGraphics through
`ctypes`, so there's nothing to `pip install`.

`mouse_mover.py` also runs on Windows and on Linux under X11. On Wayland it falls
back to `pyautogui` if you have it (`pip install pyautogui`).

### Options

Both scripts take the same flags:

| Flag | Default | Meaning |
|---|---|---|
| `--interval` / `-IntervalSeconds` | `3` | Seconds of rest between hops |
| `--jump` / `-Jump` | `0.5` | Max hop as a fraction of the screen — `0.5` is half a screen |
| `--steps` / `-Steps` | `40` | Interpolation steps per hop; higher is smoother |
| `--once` | — | Python only: hop once and exit |

```bash
python3 mouse_mover.py --interval 10 --jump 0.25
```

```powershell
powershell -ExecutionPolicy Bypass -File mouse_mover.ps1 -IntervalSeconds 10 -Jump 0.25
```

Stop either one with <kbd>Ctrl</kbd>+<kbd>C</kbd>.

## Files

```
index.html            the page
style.css             styles
app.js                the in-page pointer + OS detection + download
scripts/
  mouse_mover.ps1     Windows, dependency-free
  mouse_mover.py      macOS / Linux / Windows, dependency-free on macOS and Windows
```

## Local preview

```bash
python3 -m http.server 8000   # or: npx serve
```

Then open <http://localhost:8000>. Opening `index.html` straight off disk works
too, but `file://` blocks `fetch`, so the download button falls back to opening
the script in a new tab.
