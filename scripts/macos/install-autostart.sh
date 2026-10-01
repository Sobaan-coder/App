#!/bin/bash
# Starts KHOKHAR automatically when you log in to macOS (LaunchAgent).
#   bash scripts/macos/install-autostart.sh
# Remove: launchctl unload ~/Library/LaunchAgents/com.khokhar.commandcenter.plist && rm ~/Library/LaunchAgents/com.khokhar.commandcenter.plist
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NPM="$(command -v npm)"
PLIST="$HOME/Library/LaunchAgents/com.khokhar.commandcenter.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.khokhar.commandcenter</string>
  <key>ProgramArguments</key><array><string>$NPM</string><string>start</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NPM"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/khokhar.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/khokhar.log</string>
</dict></plist>
PLIST
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Done. KHOKHAR starts at login. Logs: ~/Library/Logs/khokhar.log"
