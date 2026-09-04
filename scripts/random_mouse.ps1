<#
  Random Mouse Mover - standalone. Nothing to install, nothing to download.

  Moves the real Windows cursor to a random point up to half a screen away,
  over and over, easing in and out so it looks hand-driven.

  Uses SendInput, not SetCursorPos. SetCursorPos repaints the pointer but
  generates no input event, so GetLastInputInfo never updates and Windows
  still considers you idle - screensaver, lock and "away" status all fire
  anyway. SendInput injects a real mouse event, so the idle timer resets.
  That distinction is the whole point on a VDI or a locked-down desktop.

  Run it:
      powershell -ExecutionPolicy Bypass -File random_mouse.ps1

  Options:
      -Seconds 10     wait 10s between moves   (default 3)
      -Jump 0.25      hop up to a quarter screen instead of half (default 0.5)
      -Steps 80       smoother, slower glide   (default 40)

  Stop it with Ctrl+C.
#>
param(
    [double]$Seconds = 3,
    [double]$Jump    = 0.5,
    [int]$Steps      = 40
)

Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class Rmm
{
    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT
    {
        public uint type;      // 0 = INPUT_MOUSE
        public MOUSEINPUT mi;  // mouse-only, so no union needed
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    [DllImport("kernel32.dll")]
    public static extern uint GetTickCount();

    const uint MOUSEEVENTF_MOVE     = 0x0001;
    const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

    // x,y are pixels on the primary screen; SendInput wants 0..65535 normalised.
    public static bool MoveTo(int x, int y, int screenW, int screenH)
    {
        INPUT[] input = new INPUT[1];
        input[0].type = 0;
        input[0].mi.dx = (int)Math.Round(x * 65535.0 / Math.Max(1, screenW - 1));
        input[0].mi.dy = (int)Math.Round(y * 65535.0 / Math.Max(1, screenH - 1));
        input[0].mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE;
        return SendInput(1, input, Marshal.SizeOf(typeof(INPUT))) == 1;
    }

    public static uint IdleMs()
    {
        LASTINPUTINFO li = new LASTINPUTINFO();
        li.cbSize = (uint)Marshal.SizeOf(li);
        GetLastInputInfo(ref li);
        return GetTickCount() - li.dwTime;
    }
}
"@

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$rand   = New-Object System.Random
$maxDX  = [int]($screen.Width  * $Jump)
$maxDY  = [int]($screen.Height * $Jump)

Write-Host "Random Mouse Mover - screen $($screen.Width)x$($screen.Height)"
Write-Host "Hopping up to ${maxDX}x${maxDY}px every $Seconds s. Press Ctrl+C to stop."
Write-Host ""

while ($true) {
    $from = [System.Windows.Forms.Cursor]::Position

    $toX = $from.X + $rand.Next(-$maxDX, $maxDX + 1)
    $toY = $from.Y + $rand.Next(-$maxDY, $maxDY + 1)
    if ($toX -lt 0) { $toX = 0 } elseif ($toX -ge $screen.Width)  { $toX = $screen.Width  - 1 }
    if ($toY -lt 0) { $toY = 0 } elseif ($toY -ge $screen.Height) { $toY = $screen.Height - 1 }

    for ($i = 1; $i -le $Steps; $i++) {
        $t = $i / $Steps
        # ease-in-out: accelerate, then settle, instead of teleporting
        if ($t -lt 0.5) { $e = 2 * $t * $t } else { $e = 1 - [Math]::Pow(-2 * $t + 2, 2) / 2 }
        [Rmm]::MoveTo([int]($from.X + ($toX - $from.X) * $e),
                      [int]($from.Y + ($toY - $from.Y) * $e),
                      $screen.Width, $screen.Height) | Out-Null
        Start-Sleep -Milliseconds 8
    }

    Write-Host ("moved to {0},{1}   (idle timer now {2} ms)" -f $toX, $toY, [Rmm]::IdleMs())
    Start-Sleep -Milliseconds ([int]($Seconds * 1000))
}
