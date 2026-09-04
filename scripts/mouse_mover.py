#!/usr/bin/env python3
"""
Random Mouse Mover - agent for macOS / Linux / Windows.

Moves the REAL system cursor in random hops of up to half a screen.

Two ways to run it:

    python3 mouse_mover.py            # agent: listens on 127.0.0.1:8777 so the
                                      # website's button can move your cursor
    python3 mouse_mover.py --solo     # no browser; just hop on a timer

While the agent is running, open either of these and press the button:

    https://pvsp2003.github.io/random-mouse-mover/   (Chrome, Edge, Firefox)
    http://127.0.0.1:8777/                           (any browser, incl. Safari)

Stop with Ctrl+C.

macOS: the first hop triggers an Accessibility prompt. Allow it for the app you
launched this from (Terminal, iTerm, VS Code) under
System Settings > Privacy & Security > Accessibility.

The agent binds to localhost only - nothing outside this machine can reach it.
"""

import argparse
import json
import math
import platform
import random
import sys
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SYSTEM = platform.system()
DEFAULT_PORT = 8777


# --------------------------------------------------------------------------
# Per-platform backends. Each returns (screen_size, move_to, position).
# --------------------------------------------------------------------------

def _backend_windows():
    import ctypes

    user32 = ctypes.windll.user32
    try:
        user32.SetProcessDPIAware()
    except Exception:
        pass

    class POINT(ctypes.Structure):
        _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

    def screen_size():
        return user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)

    def move_to(x, y):
        user32.SetCursorPos(int(x), int(y))

    def position():
        pt = POINT()
        user32.GetCursorPos(ctypes.byref(pt))
        return pt.x, pt.y

    return screen_size, move_to, position


def _backend_macos():
    # CoreGraphics via ctypes - ships with macOS, nothing to pip install.
    import ctypes
    import ctypes.util

    cg_path = ctypes.util.find_library("CoreGraphics") or (
        "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics"
    )
    cg = ctypes.cdll.LoadLibrary(cg_path)

    class CGPoint(ctypes.Structure):
        _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double)]

    class CGSize(ctypes.Structure):
        _fields_ = [("width", ctypes.c_double), ("height", ctypes.c_double)]

    class CGRect(ctypes.Structure):
        _fields_ = [("origin", CGPoint), ("size", CGSize)]

    cg.CGMainDisplayID.restype = ctypes.c_uint32
    cg.CGDisplayBounds.restype = CGRect
    cg.CGDisplayBounds.argtypes = [ctypes.c_uint32]
    cg.CGWarpMouseCursorPosition.restype = ctypes.c_int
    cg.CGWarpMouseCursorPosition.argtypes = [CGPoint]
    cg.CGAssociateMouseAndMouseCursorPosition.argtypes = [ctypes.c_bool]
    cg.CGEventCreate.restype = ctypes.c_void_p
    cg.CGEventCreate.argtypes = [ctypes.c_void_p]
    cg.CGEventGetLocation.restype = CGPoint
    cg.CGEventGetLocation.argtypes = [ctypes.c_void_p]
    cg.CFRelease.argtypes = [ctypes.c_void_p]

    display = cg.CGMainDisplayID()

    def screen_size():
        bounds = cg.CGDisplayBounds(display)
        return int(bounds.size.width), int(bounds.size.height)

    def move_to(x, y):
        cg.CGWarpMouseCursorPosition(CGPoint(float(x), float(y)))
        # Re-associate, otherwise the next physical mouse nudge feels stuck.
        cg.CGAssociateMouseAndMouseCursorPosition(True)

    def position():
        event = cg.CGEventCreate(None)
        pt = cg.CGEventGetLocation(event)
        cg.CFRelease(event)
        return int(pt.x), int(pt.y)

    return screen_size, move_to, position


def _backend_linux():
    # X11 via ctypes. On Wayland this fails and we fall back to pyautogui.
    import ctypes
    import ctypes.util

    x11_path = ctypes.util.find_library("X11")
    if not x11_path:
        raise ImportError("libX11 not found")

    x11 = ctypes.cdll.LoadLibrary(x11_path)
    x11.XOpenDisplay.restype = ctypes.c_void_p
    x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
    handle = x11.XOpenDisplay(None)
    if not handle:
        raise ImportError("cannot open X display")

    display = ctypes.c_void_p(handle)
    x11.XDefaultRootWindow.restype = ctypes.c_ulong
    root = x11.XDefaultRootWindow(display)

    def screen_size():
        return x11.XDisplayWidth(display, 0), x11.XDisplayHeight(display, 0)

    def move_to(x, y):
        x11.XWarpPointer(display, 0, root, 0, 0, 0, 0, int(x), int(y))
        x11.XFlush(display)

    last = [0, 0]

    def position():
        root_ret, child = ctypes.c_ulong(), ctypes.c_ulong()
        rx, ry, wx, wy = (ctypes.c_int() for _ in range(4))
        mask = ctypes.c_uint()
        ok = x11.XQueryPointer(
            display, root,
            ctypes.byref(root_ret), ctypes.byref(child),
            ctypes.byref(rx), ctypes.byref(ry),
            ctypes.byref(wx), ctypes.byref(wy),
            ctypes.byref(mask),
        )
        if ok:
            last[:] = [rx.value, ry.value]
        return tuple(last)

    return screen_size, move_to, position


def _backend_pyautogui():
    import pyautogui  # pip install pyautogui

    pyautogui.FAILSAFE = False

    def screen_size():
        return tuple(pyautogui.size())

    def move_to(x, y):
        pyautogui.moveTo(int(x), int(y))

    def position():
        return tuple(pyautogui.position())

    return screen_size, move_to, position


def get_backend():
    candidates = {
        "Windows": [_backend_windows],
        "Darwin": [_backend_macos],
        "Linux": [_backend_linux],
    }.get(SYSTEM, [])
    candidates = candidates + [_backend_pyautogui]

    errors = []
    for factory in candidates:
        try:
            return factory()
        except Exception as exc:  # we genuinely want to try the next fallback
            errors.append("{}: {}".format(factory.__name__, exc))

    sys.exit(
        "Could not control the mouse on this system.\n  "
        + "\n  ".join(errors)
        + "\n\nTry: pip install pyautogui"
    )


# --------------------------------------------------------------------------
# Movement
# --------------------------------------------------------------------------

def ease_in_out(t):
    return 2 * t * t if t < 0.5 else 1 - math.pow(-2 * t + 2, 2) / 2


def clamp(value, low, high):
    return max(low, min(high, value))


class Mouse(object):
    def __init__(self):
        self.screen_size, self._move_to, self._position = get_backend()
        self.width, self.height = self.screen_size()

    def hop(self, jump=0.5, steps=40, step_delay=0.008):
        """One eased hop of up to `jump` x screen size from wherever we are."""
        from_x, from_y = self._position()
        max_dx = max(1, int(self.width * jump))
        max_dy = max(1, int(self.height * jump))
        to_x = clamp(from_x + random.randint(-max_dx, max_dx), 0, self.width - 1)
        to_y = clamp(from_y + random.randint(-max_dy, max_dy), 0, self.height - 1)

        for i in range(1, steps + 1):
            e = ease_in_out(i / steps)
            self._move_to(from_x + (to_x - from_x) * e, from_y + (to_y - from_y) * e)
            time.sleep(step_delay)

        return {
            "x": to_x,
            "y": to_y,
            "from": [from_x, from_y],
            "distance": int(math.hypot(to_x - from_x, to_y - from_y)),
            "screen": [self.width, self.height],
        }


# --------------------------------------------------------------------------
# Agent
# --------------------------------------------------------------------------

PAGE = """<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Random Mouse Mover - local</title><style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;
justify-content:center;gap:18px;background:#0b0d12;color:#e7eaf3;
font:16px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px}
h1{margin:0;font-size:28px;letter-spacing:-.03em}
p{margin:0;color:#8b93a7;font-size:14px}
button{width:min(320px,90vw);padding:24px;border-radius:18px;border:1px solid #3a4160;
background:linear-gradient(180deg,#1e2536,#151a27);color:#e7eaf3;font:650 20px/1.2 inherit;cursor:pointer}
button.on{border-color:#6ea8fe;background:linear-gradient(180deg,#24304d,#182036)}
#s{font-size:13px;color:#8b93a7;min-height:20px;font-variant-numeric:tabular-nums}
</style></head><body>
<h1>Random Mouse Mover</h1><p>Running locally. This moves your real cursor.</p>
<button id="b">Move my mouse</button><div id="s">Idle.</div>
<script>
var on=false,b=document.getElementById('b'),s=document.getElementById('s'),n=0;
async function loop(){
  while(on){
    try{
      var r=await fetch('/hop');var d=await r.json();
      n++;s.textContent='Hop '+n+' - '+d.distance+'px to '+d.x+', '+d.y;
    }catch(e){on=false;b.textContent='Move my mouse';b.classList.remove('on');
      s.textContent='Lost the agent.';return;}
    await new Promise(function(r){setTimeout(r,1500)});
  }
}
b.onclick=function(){on=!on;b.textContent=on?'Stop':'Move my mouse';
  b.classList.toggle('on',on);if(on)loop();else s.textContent='Stopped after '+n+'.';};
</script></body></html>"""


def make_handler(mouse, jump, steps):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _cors(self):
            origin = self.headers.get("Origin", "*")
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Headers", "*")
            # Chrome's Private Network Access preflight for https -> localhost
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Vary", "Origin")

        def _send(self, code, body, content_type):
            payload = body.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self._cors()
            self.end_headers()
            self.wfile.write(payload)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self._cors()
            self.end_headers()

        def do_GET(self):
            path = self.path.split("?")[0]
            if path == "/ping":
                self._send(200, json.dumps({
                    "ok": True,
                    "os": SYSTEM,
                    "screen": [mouse.width, mouse.height],
                }), "application/json")
            elif path == "/hop":
                result = mouse.hop(jump=jump, steps=steps)
                print("moved to {},{}".format(result["x"], result["y"]))
                self._send(200, json.dumps(result), "application/json")
            elif path in ("/", "/index.html"):
                self._send(200, PAGE, "text/html; charset=utf-8")
            else:
                self._send(404, json.dumps({"error": "not found"}), "application/json")

        def log_message(self, *args):
            pass  # we print our own, one line per hop

    return Handler


def serve(mouse, port, jump, steps, open_browser=True):
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(mouse, jump, steps))
    print("Random Mouse Mover agent - {}, screen {}x{}".format(
        SYSTEM, mouse.width, mouse.height))
    print("Listening on http://127.0.0.1:{} (this machine only)".format(port))
    print("")
    print("  Open  https://pvsp2003.github.io/random-mouse-mover/   and press the button")
    print("  or    http://127.0.0.1:{}/".format(port))
    print("")
    print("Ctrl+C to stop.")

    if open_browser:
        # The agent's own same-origin page: no CORS, no mixed content, works in
        # every browser including Safari.
        webbrowser.open("http://127.0.0.1:{}/".format(port))

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")
    finally:
        server.server_close()


def solo(mouse, interval, jump, steps, once):
    print("Random Mouse Mover - {}, screen {}x{}".format(SYSTEM, mouse.width, mouse.height))
    print("Max hop: {}x{}px every {}s. Ctrl+C to stop.".format(
        int(mouse.width * jump), int(mouse.height * jump), interval))
    try:
        while True:
            result = mouse.hop(jump=jump, steps=steps)
            print("moved to {},{}".format(result["x"], result["y"]))
            if once:
                return
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\nstopped.")


def main():
    parser = argparse.ArgumentParser(description="Move the real mouse to random spots.")
    parser.add_argument("--solo", action="store_true",
                        help="skip the browser; hop on a timer in this terminal")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help="agent port (default: {})".format(DEFAULT_PORT))
    parser.add_argument("--interval", type=float, default=3.0,
                        help="--solo only: seconds between hops (default: 3)")
    parser.add_argument("--jump", type=float, default=0.5,
                        help="max hop as a fraction of the screen (default: 0.5 = half a screen)")
    parser.add_argument("--steps", type=int, default=40,
                        help="interpolation steps per hop; higher is smoother (default: 40)")
    parser.add_argument("--no-open", action="store_true", help="do not auto-open the local page")
    parser.add_argument("--once", action="store_true", help="--solo only: hop once and exit")
    args = parser.parse_args()

    mouse = Mouse()
    if args.solo:
        solo(mouse, args.interval, args.jump, args.steps, args.once)
    else:
        serve(mouse, args.port, args.jump, args.steps, not args.no_open)


if __name__ == "__main__":
    main()
