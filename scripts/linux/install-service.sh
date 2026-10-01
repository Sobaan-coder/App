#!/bin/bash
# Installs a systemd service so KHOKHAR starts on boot.   sudo bash scripts/linux/install-service.sh
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
NPM="$(sudo -u "$USER_NAME" bash -lc 'command -v npm')"
cat > /etc/systemd/system/khokhar.service <<UNIT
[Unit]
Description=KHOKHAR AI Command Center
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=$USER_NAME
WorkingDirectory=$ROOT
ExecStart=$NPM start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PATH=$(dirname "$NPM"):/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now khokhar
echo "Done. Status: systemctl status khokhar · Logs: journalctl -u khokhar -f"
