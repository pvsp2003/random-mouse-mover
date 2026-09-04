@echo off
REM Random Mouse Mover - one-time setup. Double-click me.
REM Installs the agent to %LOCALAPPDATA%\RandomMouseMover and starts it at login.
REM Undo with uninstall.cmd.
title Random Mouse Mover - setup

set "D=%LOCALAPPDATA%\RandomMouseMover"
if not exist "%D%" mkdir "%D%"

if exist "%~dp0install.ps1" (
    powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0install.ps1"
) else (
    powershell -ExecutionPolicy Bypass -NoProfile -Command "Invoke-WebRequest 'https://pvsp2003.github.io/random-mouse-mover/scripts/install.ps1' -OutFile '%D%\install.ps1' -UseBasicParsing"
    powershell -ExecutionPolicy Bypass -NoProfile -File "%D%\install.ps1"
)

echo.
pause
