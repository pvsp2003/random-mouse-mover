@echo off
REM Double-click me. Starts the Random Mouse Mover agent next to this file.
REM Close this window or press Ctrl+C to stop.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0mouse_mover.ps1" %*
pause
