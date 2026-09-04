# Random Mouse Mover

One button. Your **real** cursor goes somewhere else.

**Live site:** <https://pvsp2003.github.io/random-mouse-mover/>

## How it works

A web page cannot move your operating system's cursor. There is no JavaScript
API for it and browsers block it deliberately — a page that could reposition
your pointer could make you click things you never meant to click.

So the moving is done by a small agent that runs on your own machine, and the
website's button drives it over localhost:

```
  browser                          your machine
┌──────────────────┐            ┌────────────────────────┐
│  the one button  │  GET /hop  │  mouse_mover agent     │
│  on the website  │ ─────────► │  127.0.0.1:8777        │
│                  │ ◄───────── │  moves the real cursor │
└──────────────────┘   {x, y}   └────────────────────────┘
```

One file, no dependencies, no installer. It binds to `127.0.0.1` only, so
nothing outside your machine can reach it.

## Use it

**1. Get the agent** — the site hands you the right file, or take it from
[`scripts/`](scripts/):

| Your OS | File | Needs |
|---|---|---|
| Windows | [`mouse_mover.ps1`](scripts/mouse_mover.ps1) | nothing — pure PowerShell |
| macOS | [`mouse_mover.py`](scripts/mouse_mover.py) | `python3` (ships with the Xcode CLT) |
| Linux | [`mouse_mover.py`](scripts/mouse_mover.py) | `python3`, X11 (or `pip install pyautogui` on Wayland) |

**2. Run it**, from wherever you saved it:

```powershell
powershell -ExecutionPolicy Bypass -File mouse_mover.ps1
```

```bash
python3 mouse_mover.py
```

On Windows you can also just double-click [`start_agent.cmd`](scripts/start_agent.cmd)
if it sits next to `mouse_mover.ps1`.

**3. Press the button.** The agent opens its own page at <http://127.0.0.1:8777/>
when it starts; the live site at <https://pvsp2003.github.io/random-mouse-mover/>
works too.
Your cursor starts hopping to random points up to half a screen away, eased in
and out so it looks hand-driven, clamped to the screen edges. Press again to
stop, or <kbd>Ctrl</kbd>+<kbd>C</kbd> the agent.

## No browser at all

`--solo` / `-Solo` skips the website entirely and just hops on a timer:

```bash
python3 mouse_mover.py --solo --interval 10 --jump 0.25
```

```powershell
powershell -ExecutionPolicy Bypass -File mouse_mover.ps1 -Solo -IntervalSeconds 10 -Jump 0.25
```

## Options

| Python | PowerShell | Default | Meaning |
|---|---|---|---|
| `--port` | `-Port` | `8777` | Agent port |
| `--jump` | `-Jump` | `0.5` | Max hop as a fraction of the screen — `0.5` is half a screen |
| `--steps` | `-Steps` | `40` | Interpolation steps per hop; higher is smoother |
| `--solo` | `-Solo` | off | No browser; hop on a timer |
| `--no-open` | `-NoOpen` | off | Do not auto-open the local page on start |
| `--interval` | `-IntervalSeconds` | `3` | `--solo` only: seconds between hops |
| `--once` | — | — | `--solo` only: hop once and exit |

## Browser notes

**If the live site's button does nothing** while the agent is running, your browser
is refusing to let an HTTPS page reach `localhost` — Safari always does this, and
Chrome/Edge increasingly gate it behind a permission. The agent serves its own
copy of the page for exactly this reason: open <http://127.0.0.1:8777/> and the
same button works in any browser, offline.

**Chrome / Edge** send a Private Network Access preflight for
`https://…` → `127.0.0.1`. The agent answers it with
`Access-Control-Allow-Private-Network: true`, so this is handled.

**macOS** asks for Accessibility permission on the first hop: **System Settings
→ Privacy & Security → Accessibility**, then enable whichever app you launched
the agent from (Terminal, iTerm, VS Code…).

## Agent API

| | |
|---|---|
| `GET /ping` | `{"ok":true,"os":"Windows","screen":[1536,864]}` |
| `GET /hop` | one eased hop; returns `{"x","y","from","distance","screen"}` when it lands |
| `GET /` | a self-contained copy of the page, same-origin |

## Files

```
index.html            the page
style.css             styles
app.js                talks to the agent; shows setup steps only when it's missing
scripts/
  mouse_mover.ps1     Windows agent, dependency-free
  mouse_mover.py      macOS / Linux / Windows agent, dependency-free on macOS and Windows
  start_agent.cmd     Windows: double-click launcher for mouse_mover.ps1
```

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
