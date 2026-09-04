<#
  Random Mouse Mover - standalone. Nothing to install, nothing to download.

  Moves the real Windows cursor to a random point up to half a screen away,
  over and over, easing in and out so it looks hand-driven.

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
Add-Type -AssemblyName System.Drawing

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
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(
            [int]($from.X + ($toX - $from.X) * $e),
            [int]($from.Y + ($toY - $from.Y) * $e))
        Start-Sleep -Milliseconds 8
    }

    Write-Host ("moved to {0},{1}" -f $toX, $toY)
    Start-Sleep -Milliseconds ([int]($Seconds * 1000))
}
