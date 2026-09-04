<#
  Random Mouse Mover - agent for Windows. Pure PowerShell, nothing to install.

  Moves the REAL system cursor in random hops of up to half a screen.

  Two ways to run it:

      powershell -ExecutionPolicy Bypass -File mouse_mover.ps1
          Agent: listens on 127.0.0.1:8777 so the website's button can move
          your cursor.

      powershell -ExecutionPolicy Bypass -File mouse_mover.ps1 -Solo
          No browser; just hop on a timer.

  While the agent is running, open either of these and press the button:

      https://pvsp2003.github.io/random-mouse-mover/
      http://127.0.0.1:8777/

  Stop with Ctrl+C.

  The agent binds to localhost only - nothing outside this machine can reach it,
  and binding 127.0.0.1 needs no administrator rights.
#>
param(
    [int]$Port               = 8777,
    [double]$Jump            = 0.5,   # max hop as a fraction of screen size
    [int]$Steps              = 40,    # interpolation steps (higher = smoother)
    [switch]$Solo,                    # skip the browser, hop on a timer
    [double]$IntervalSeconds = 3.0    # -Solo only: seconds between hops
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$rand   = New-Object System.Random

function Clamp-Value($value, $min, $max) {
    if ($value -lt $min) { return $min }
    if ($value -gt $max) { return $max }
    return $value
}

function Invoke-Hop {
    <# One eased hop of up to $Jump x screen size from wherever the cursor is. #>
    $from  = [System.Windows.Forms.Cursor]::Position
    $maxDX = [int]($bounds.Width  * $Jump)
    $maxDY = [int]($bounds.Height * $Jump)
    $toX   = Clamp-Value ($from.X + $rand.Next(-$maxDX, $maxDX + 1)) $bounds.Left ($bounds.Right  - 1)
    $toY   = Clamp-Value ($from.Y + $rand.Next(-$maxDY, $maxDY + 1)) $bounds.Top  ($bounds.Bottom - 1)

    for ($i = 1; $i -le $Steps; $i++) {
        $t = $i / $Steps
        # ease-in-out so it looks like a hand did it, not a teleport
        if ($t -lt 0.5) { $e = 2 * $t * $t } else { $e = 1 - [Math]::Pow(-2 * $t + 2, 2) / 2 }
        $x = [int]($from.X + ($toX - $from.X) * $e)
        $y = [int]($from.Y + ($toY - $from.Y) * $e)
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
        Start-Sleep -Milliseconds 8
    }

    return [ordered]@{
        x        = $toX
        y        = $toY
        from     = @($from.X, $from.Y)
        distance = [int][Math]::Sqrt([Math]::Pow($toX - $from.X, 2) + [Math]::Pow($toY - $from.Y, 2))
        screen   = @($bounds.Width, $bounds.Height)
    }
}

# ---------------------------------------------------------------- solo mode --

if ($Solo) {
    Write-Host "Random Mouse Mover - Windows, screen $($bounds.Width)x$($bounds.Height)"
    Write-Host ("Max hop: {0}x{1}px every {2}s. Ctrl+C to stop." -f `
        [int]($bounds.Width * $Jump), [int]($bounds.Height * $Jump), $IntervalSeconds)
    while ($true) {
        $r = Invoke-Hop
        Write-Host ("moved to {0},{1}" -f $r.x, $r.y)
        Start-Sleep -Milliseconds ([int]($IntervalSeconds * 1000))
    }
}

# --------------------------------------------------------------- agent mode --

$page = @'
<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
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
</script></body></html>
'@

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")

try {
    $listener.Start()
} catch {
    Write-Host "Could not listen on port $Port - is another copy already running?" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

Write-Host "Random Mouse Mover agent - Windows, screen $($bounds.Width)x$($bounds.Height)"
Write-Host "Listening on http://127.0.0.1:$Port (this machine only)"
Write-Host ""
Write-Host "  Open  https://pvsp2003.github.io/random-mouse-mover/   and press the button"
Write-Host "  or    http://127.0.0.1:$Port/"
Write-Host ""
Write-Host "Ctrl+C to stop."

function Write-Body($response, [int]$code, [string]$body, [string]$type) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $response.StatusCode = $code
    $response.ContentType = $type
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.Close()
}

try {
    while ($listener.IsListening) {
        # GetContextAsync + a short wait keeps Ctrl+C responsive, which a
        # blocking GetContext() would not.
        $task = $listener.GetContextAsync()
        while (-not $task.Wait(200)) { }
        $ctx = $task.Result

        $req = $ctx.Request
        $res = $ctx.Response

        $origin = $req.Headers["Origin"]
        if (-not $origin) { $origin = "*" }
        $res.Headers.Add("Access-Control-Allow-Origin", $origin)
        $res.Headers.Add("Access-Control-Allow-Headers", "*")
        # Chrome's Private Network Access preflight for https -> localhost
        $res.Headers.Add("Access-Control-Allow-Private-Network", "true")
        $res.Headers.Add("Vary", "Origin")
        $res.Headers.Add("Cache-Control", "no-store")

        if ($req.HttpMethod -eq "OPTIONS") {
            $res.StatusCode = 204
            $res.Close()
            continue
        }

        switch ($req.Url.AbsolutePath) {
            "/ping" {
                $json = @{ ok = $true; os = "Windows"; screen = @($bounds.Width, $bounds.Height) } |
                    ConvertTo-Json -Compress
                Write-Body $res 200 $json "application/json"
            }
            "/hop" {
                $r = Invoke-Hop
                Write-Host ("moved to {0},{1}" -f $r.x, $r.y)
                Write-Body $res 200 (ConvertTo-Json $r -Compress) "application/json"
            }
            { $_ -eq "/" -or $_ -eq "/index.html" } {
                Write-Body $res 200 $page "text/html; charset=utf-8"
            }
            default {
                Write-Body $res 404 '{"error":"not found"}' "application/json"
            }
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
    Write-Host "`nstopped."
}
