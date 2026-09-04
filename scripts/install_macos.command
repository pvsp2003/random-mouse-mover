#!/bin/bash
# Random Mouse Mover - one-time setup for macOS.
#
# Installs the agent to ~/Library/Application Support/RandomMouseMover and
# registers a LaunchAgent so it starts at login. After this the website moves
# your real cursor on every visit, with nothing to run.
#
# Undo:
#   launchctl unload ~/Library/LaunchAgents/com.randommousemover.agent.plist
#   rm ~/Library/LaunchAgents/com.randommousemover.agent.plist
#   rm -rf "$HOME/Library/Application Support/RandomMouseMover"

set -euo pipefail

SOURCE="https://pvsp2003.github.io/random-mouse-mover/scripts/mouse_mover.py"
DEST="$HOME/Library/Application Support/RandomMouseMover"
AGENT="$DEST/mouse_mover.py"
PLIST="$HOME/Library/LaunchAgents/com.randommousemover.agent.plist"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo
echo "Random Mouse Mover - one-time setup"
echo

mkdir -p "$DEST" "$HOME/Library/LaunchAgents"
echo "  folder    $DEST"

# Prefer a copy sitting next to this script, so a clone installs offline.
if [ -f "$HERE/mouse_mover.py" ]; then
    cp "$HERE/mouse_mover.py" "$AGENT"
    echo "  agent     copied from $HERE/mouse_mover.py"
else
    curl -fsSL "$SOURCE" -o "$AGENT"
    echo "  agent     downloaded from the site"
fi
chmod +x "$AGENT"

PYTHON="$(command -v python3 || true)"
if [ -z "$PYTHON" ]; then
    echo
    echo "  python3 not found. Install the Xcode command line tools first:"
    echo "    xcode-select --install"
    exit 1
fi

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.randommousemover.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PYTHON</string>
        <string>$AGENT</string>
        <string>--no-open</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>$DEST/agent.log</string>
</dict>
</plist>
PLISTEOF
echo "  launchd   $PLIST"

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "  startup   registered"

sleep 3

if curl -fsS --max-time 6 http://127.0.0.1:8777/ping > /tmp/rmm_ping.json 2>/dev/null; then
    echo
    echo "  running   $(cat /tmp/rmm_ping.json)"
    echo
    echo "Done. Open https://pvsp2003.github.io/random-mouse-mover/ and press the button."
    echo "It will be running again automatically after every restart."
    echo
    echo "macOS will ask for Accessibility permission the first time the cursor moves."
else
    echo
    echo "  The agent did not answer on port 8777."
    echo "  Check the log:  cat \"$DEST/agent.log\""
    echo "  Or run it directly:  python3 \"$AGENT\""
    exit 1
fi
