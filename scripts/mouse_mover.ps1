<#
  Random Mouse Mover - Windows (PowerShell, no installs needed)

  Usage:
    powershell -ExecutionPolicy Bypass -File mouse_mover.ps1
    powershell -ExecutionPolicy Bypass -File mouse_mover.ps1 -IntervalSeconds 5 -Jump 0.5

  Stop with Ctrl+C.
#>
param(
    [double]$IntervalSeconds = 3.0,   # seconds between moves
    [double]$Jump            = 0.5,   # max hop as a fraction of screen size (0.5 = half a screen)
    [int]$Steps              = 40     # interpolation steps (higher = smoother)
)

Add-Type -AssemblyName System.Windows.Forms

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$maxDX  = [int]($bounds.Width  * $Jump)
$maxDY  = [int]($bounds.Height * $Jump)
$rand   = New-Object System.Random

function Clamp($value, $min, $max) {
    if ($value -lt $min) { return $min }
    if ($value -gt $max) { return $max }
    return $value
}

Write-Host "Random Mouse Mover - screen $($bounds.Width)x$($bounds.Height)"
Write-Host "Max hop: ${maxDX}x${maxDY}px every $IntervalSeconds s. Press Ctrl+C to stop."

while ($true) {
    $from = [System.Windows.Forms.Cursor]::Position
    $toX  = Clamp ($from.X + $rand.Next(-$maxDX, $maxDX + 1)) $bounds.Left ($bounds.Right  - 1)
    $toY  = Clamp ($from.Y + $rand.Next(-$maxDY, $maxDY + 1)) $bounds.Top  ($bounds.Bottom - 1)

    for ($i = 1; $i -le $Steps; $i++) {
        $t = $i / $Steps
        # ease-in-out so it looks human rather than teleporting
        if ($t -lt 0.5) { $e = 2 * $t * $t } else { $e = 1 - [Math]::Pow(-2 * $t + 2, 2) / 2 }
        $x = [int]($from.X + ($toX - $from.X) * $e)
        $y = [int]($from.Y + ($toY - $from.Y) * $e)
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
        Start-Sleep -Milliseconds 8
    }

    Write-Host ("moved to {0},{1}" -f $toX, $toY)
    Start-Sleep -Milliseconds ([int]($IntervalSeconds * 1000))
}
