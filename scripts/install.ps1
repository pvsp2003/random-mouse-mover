<#
  Random Mouse Mover - one-time setup.

  Puts the agent in %LOCALAPPDATA%\RandomMouseMover, registers it to start
  silently at login, and starts it now. After this the website moves your real
  cursor on every visit, with nothing to run.

  Undo it with uninstall.cmd, or by deleting the shortcut from
  shell:startup and the folder above. Nothing goes in the registry, nothing
  needs administrator rights, nothing runs as a service.
#>
param(
    [switch]$NoStartup,   # install and launch, but don't register at login (for testing)
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

$Source  = 'https://pvsp2003.github.io/random-mouse-mover/scripts/mouse_mover.ps1'
$Home_   = Join-Path $env:LOCALAPPDATA 'RandomMouseMover'
$Agent   = Join-Path $Home_ 'mouse_mover.ps1'
$Vbs     = Join-Path $Home_ 'start_hidden.vbs'
$Startup = [Environment]::GetFolderPath('Startup')
$Link    = Join-Path $Startup 'RandomMouseMover.vbs'

function Say($text, $colour = 'Gray') {
    if (-not $Quiet) { Write-Host $text -ForegroundColor $colour }
}

Say ""
Say "Random Mouse Mover - one-time setup" 'Cyan'
Say ""

# 1. Somewhere stable to live -------------------------------------------------
New-Item -ItemType Directory -Force -Path $Home_ | Out-Null
Say "  folder    $Home_"

# 2. The agent itself. Prefer a copy sitting next to this script, so the
#    installer works offline from a clone; otherwise pull it from the site.
#
#    When install.cmd downloaded this file it lands in $Home_ itself, so the
#    "copy" would be the destination copying onto itself. Compare full paths
#    and always fetch a fresh agent in that case.
#    $PSScriptRoot is empty when this is run as `irm ... | iex`, so guard it.
$Local = if ($PSScriptRoot) { Join-Path $PSScriptRoot 'mouse_mover.ps1' } else { $null }
$sameFile = $Local -and ([IO.Path]::GetFullPath($Local) -ieq [IO.Path]::GetFullPath($Agent))

if ($Local -and (Test-Path $Local) -and -not $sameFile) {
    Copy-Item $Local $Agent -Force
    Say "  agent     copied from $Local"
} else {
    Invoke-WebRequest $Source -OutFile $Agent -UseBasicParsing
    Say "  agent     downloaded from the site"
}

# 3. A launcher that starts it with no console window at all.
#    WScript.Shell's Run with intWindowStyle 0 is the only way to get a truly
#    hidden PowerShell process; -WindowStyle Hidden still flashes a console.
$agentEscaped = $Agent -replace '"', '""'
@(
    'Set s = CreateObject("WScript.Shell")'
    's.Run "powershell -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File ""' +
        $agentEscaped + '"" -NoOpen", 0, False'
) | Set-Content -Path $Vbs -Encoding ASCII
Say "  launcher  $Vbs"

# 4. Start at login ------------------------------------------------------------
if ($NoStartup) {
    Say "  startup   skipped (-NoStartup)" 'Yellow'
} else {
    Copy-Item $Vbs $Link -Force
    Say "  startup   $Link"
}

# 5. Stop any copy already running, then start this one ------------------------
Get-NetTCPConnection -LocalPort 8777 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 600

Start-Process wscript.exe -ArgumentList "`"$Vbs`"" -WindowStyle Hidden
Start-Sleep -Seconds 3

# 6. Prove it works ------------------------------------------------------------
#    No `exit` here: when this runs as `irm ... | iex` an exit would close the
#    user's whole PowerShell window. Set $LASTEXITCODE-ish state and return.
$ok = $false
try {
    $ping = (Invoke-WebRequest 'http://127.0.0.1:8777/ping' -UseBasicParsing -TimeoutSec 6).Content
    $ok = $true
    Say ""
    Say "  running   $ping" 'Green'
    Say ""
    Say "Done. Open https://pvsp2003.github.io/random-mouse-mover/ and press the button." 'Green'
    if (-not $NoStartup) {
        Say "It will be running again automatically after every restart."
    }
} catch {
    Say ""
    Say "  The agent did not answer on port 8777." 'Red'
    Say "  $($_.Exception.Message)"
    Say ""
    Say "  Try running the agent directly to see the error:"
    Say "    powershell -ExecutionPolicy Bypass -File `"$Agent`""
}

$global:LASTEXITCODE = if ($ok) { 0 } else { 1 }
