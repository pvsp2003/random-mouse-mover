# Random Mouse Mover

One button. Fullscreen, your cursor hidden, the pointer moving on its own.

**Live site:** <https://pvsp2003.github.io/random-mouse-mover/>

No install, no download, no terminal. Open it, press the button.

## What the website does

It goes fullscreen, hides your real cursor with `cursor: none` plus Pointer
Lock, and flies a drawn pointer around the screen in random hops of up to half
a screen — eased in and out so it looks hand-driven, trailing a line that fades
behind it. Esc, or any click or key, gets you out.

## Why it can't move the OS cursor

It can't, and neither can any other website.

There is no browser API for repositioning the operating system's pointer — not
in JavaScript, not in WebAssembly, not in anything that compiles to either. The
language is not the constraint; the sandbox is. It's blocked deliberately and
universally, because a page that could move your cursor could park it over
"Allow" and make you click things you never meant to click.

Hiding the real cursor and owning the whole screen is as close as a web page
gets. Anything that genuinely moves the OS pointer has to run outside the
browser — which is what [`scripts/`](scripts/) is for.

## Moving the actual OS cursor (optional, outside the browser)

One file, no dependencies:

| Your OS | File | Run it |
|---|---|---|
| Windows | [`mouse_mover.ps1`](scripts/mouse_mover.ps1) | double-click [`start_agent.cmd`](scripts/start_agent.cmd), or `powershell -ExecutionPolicy Bypass -File mouse_mover.ps1` |
| macOS | [`mouse_mover.py`](scripts/mouse_mover.py) | `python3 mouse_mover.py` |
| Linux | [`mouse_mover.py`](scripts/mouse_mover.py) | `python3 mouse_mover.py` |

Two modes:

- **Plain** — starts a localhost agent on port 8777 and opens its own page with
  the same one button. That page *can* drive your real cursor, because the
  agent serves it rather than a website.
- **`--solo` / `-Solo`** — no browser at all, just hops on a timer.

```bash
python3 mouse_mover.py --solo --interval 10 --jump 0.25
```

```powershell
powershell -ExecutionPolicy Bypass -File mouse_mover.ps1 -Solo -IntervalSeconds 10 -Jump 0.25
```

## macOS notes

Install with one paste in Terminal. A downloaded `.command` file arrives without
execute permission and quarantined, so double-clicking it does not work:

```bash
curl -fsSL https://pvsp2003.github.io/random-mouse-mover/scripts/install_macos.command | bash
```

That installs a LaunchAgent, so the agent is running after every login and the
website drives your real cursor with nothing to start.

**Accessibility permission is mandatory.** The agent posts real `mouseMoved`
events through `CGEventPost`, which macOS refuses unless the process is trusted:
**System Settings → Privacy & Security → Accessibility**. Grant it to the
Terminal you ran the installer from. Without it the agent starts and answers
`/ping` normally, but the cursor never moves — that is the symptom to expect.

Undo:

```bash
launchctl unload ~/Library/LaunchAgents/com.randommousemover.agent.plist
rm ~/Library/LaunchAgents/com.randommousemover.agent.plist
rm -rf "$HOME/Library/Application Support/RandomMouseMover"
```

**Untested.** Every Windows path in this repo is verified on real hardware. The
macOS path is written and reviewed but has never been executed — no Mac was
available. Expect to hit the Accessibility prompt first.

## Options

| Python | PowerShell | Default | Meaning |
|---|---|---|---|
| `--port` | `-Port` | `8777` | Agent port |
| `--jump` | `-Jump` | `0.5` | Max hop as a fraction of the screen — `0.5` is half a screen |
| `--steps` | `-Steps` | `40` | Interpolation steps per hop; higher is smoother |
| `--solo` | `-Solo` | off | No browser; hop on a timer |
| `--no-open` | `-NoOpen` | off | Don't auto-open the local page on start |
| `--interval` | `-IntervalSeconds` | `3` | `--solo` only: seconds between hops |
| `--once` | — | — | `--solo` only: hop once and exit |

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
app.js                fullscreen, hides the cursor, flies the pointer
scripts/
  mouse_mover.ps1     Windows agent, dependency-free
  mouse_mover.py      macOS / Linux / Windows agent, dependency-free on macOS and Windows
  start_agent.cmd     Windows: double-click launcher for mouse_mover.ps1
```

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
