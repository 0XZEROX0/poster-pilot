#!/bin/bash
# Install the Static OS watchdog. Run once: sudo bash /home/zero/static-watchdog/install.sh
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
bash -n "$D/static-watchdog.sh"
install -m 755 -o root -g root "$D/static-watchdog.sh" /usr/local/bin/static-watchdog.sh
install -m 644 "$D/static-watchdog.service" /etc/systemd/system/static-watchdog.service
install -m 644 "$D/static-watchdog.timer" /etc/systemd/system/static-watchdog.timer
mkdir -p /var/lib/static-watchdog; chmod 755 /var/lib/static-watchdog
systemctl daemon-reload
systemctl enable --now static-watchdog.timer
systemctl start static-watchdog.service
echo "--- timers:"; systemctl list-timers --all | grep -E 'static-watchdog|tailscale' || true
echo "--- status:"; cat /var/lib/static-watchdog/status.json
echo "--- log:"; tail -n 5 /var/log/static-watchdog.log 2>/dev/null || echo "(no events yet - all fine)"
echo "Installed."
