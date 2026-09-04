@echo off
REM Random Mouse Mover - remove everything this installed.
title Random Mouse Mover - uninstall

powershell -ExecutionPolicy Bypass -NoProfile -Command ^
 "Get-NetTCPConnection -LocalPort 8777 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue };" ^
 "$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'RandomMouseMover.vbs';" ^
 "if (Test-Path $link) { Remove-Item $link -Force; Write-Host '  removed startup entry' } else { Write-Host '  no startup entry' };" ^
 "$dir = Join-Path $env:LOCALAPPDATA 'RandomMouseMover';" ^
 "if (Test-Path $dir) { Remove-Item $dir -Recurse -Force; Write-Host \"  removed $dir\" } else { Write-Host '  no install folder' };" ^
 "Write-Host ''; Write-Host 'Uninstalled. Nothing left behind.' -ForegroundColor Green"

echo.
pause
