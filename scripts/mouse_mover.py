#!/usr/bin/env python3
"""
Random Mouse Mover - macOS / Windows / Linux.

Moves the real system cursor to a random spot, hopping up to half a screen
at a time. Uses whatever the OS gives us, no third-party packages required
on macOS or Windows.

Usage:
    python3 mouse_mover.py                       # hop every 3s, up to half a screen
    python3 mouse_mover.py --interval 5 --jump 0.5
    python3 mouse_mover.py --once                # a single hop, then exit

Stop with Ctrl+C.

macOS note: the first run will ask for Accessibility permission
(System Settings > Privacy & Security > Accessibility). Grant it to the app
you launched this from - Terminal, iTerm, VS Code, whatever.
"""

import argparse
import math
import platform
import random
import sys
import time

SYSTEM = platform.system()


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
    display = x11.XOpenDisplay(None)
    if not display:
        raise ImportError("cannot open X display")

    display = ctypes.c_void_p(display)
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

def ease_in_out(t):
    return 2 * t * t if t < 0.5 else 1 - math.pow(-2 * t + 2, 2) / 2


def clamp(value, low, high):
    return max(low, min(high, value))


def hop(move_to, position, width, height, jump, steps):
    """One eased hop of up to `jump` x screen size from wherever the cursor is."""
    from_x, from_y = position()
    max_dx = max(1, int(width * jump))
    max_dy = max(1, int(height * jump))
    to_x = clamp(from_x + random.randint(-max_dx, max_dx), 0, width - 1)
    to_y = clamp(from_y + random.randint(-max_dy, max_dy), 0, height - 1)

    for i in range(1, steps + 1):
        e = ease_in_out(i / steps)
        move_to(from_x + (to_x - from_x) * e, from_y + (to_y - from_y) * e)
        time.sleep(0.008)

    return to_x, to_y


def main():
    parser = argparse.ArgumentParser(description="Move the mouse to random spots.")
    parser.add_argument("--interval", type=float, default=3.0,
                        help="seconds between hops (default: 3)")
    parser.add_argument("--jump", type=float, default=0.5,
                        help="max hop as a fraction of the screen (default: 0.5 = half a screen)")
    parser.add_argument("--steps", type=int, default=40,
                        help="interpolation steps per hop; higher is smoother (default: 40)")
    parser.add_argument("--once", action="store_true", help="hop once, then exit")
    args = parser.parse_args()

    screen_size, move_to, position = get_backend()
    width, height = screen_size()

    print("Random Mouse Mover - {}, screen {}x{}".format(SYSTEM, width, height))
    print("Max hop: {}x{}px every {}s. Press Ctrl+C to stop.".format(
        int(width * args.jump), int(height * args.jump), args.interval))

    try:
        while True:
            x, y = hop(move_to, position, width, height, args.jump, args.steps)
            print("moved to {},{}".format(x, y))
            if args.once:
                return
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nstopped.")


if __name__ == "__main__":
    main()
