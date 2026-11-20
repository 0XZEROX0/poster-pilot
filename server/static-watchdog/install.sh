#!/bin/bash
# Install the Static OS watchdog. Run once: sudo bash /home/zero/static-watchdog/install.sh [health key]
# The health key (from the n8n workflow "Static OS - Health", node "Server report") is kept in
# /etc/static-watchdog/health.key, readable by root only. Without it the watchdog works but sends no health reports.
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
bash -n "$D/static-watchdog.sh"
install -m 755 -o root -g root "$D/static-watchdog.sh" /usr/local/bin/static-watchdog.sh
install -m 644 "$D/static-watchdog.service" /etc/systemd/system/static-watchdog.service
install -m 644 "$D/static-watchdog.timer" /etc/systemd/system/static-watchdog.timer
mkdir -p /var/lib/static-watchdog; chmod 755 /var/lib/static-watchdog
mkdir -p /etc/static-watchdog; chmod 700 /etc/static-watchdog
if [ -n "${1:-}" ]; then
  printf '%s' "$1" | tr -dc 'A-Za-z0-9' > /etc/static-watchdog/health.key; chmod 600 /etc/static-watchdog/health.key
  echo "Health key saved."
fi
[ -s /etc/static-watchdog/health.key ] || echo "No health key yet: System health will not get server reports until you run this again with the key."
systemctl daemon-reload
systemctl enable --now static-watchdog.timer
systemctl start static-watchdog.service
echo "--- timers:"; systemctl list-timers --all | grep -E 'static-watchdog|tailscale' || true
echo "--- status:"; cat /var/lib/static-watchdog/status.json
echo "--- log:"; tail -n 5 /var/log/static-watchdog.log 2>/dev/null || echo "(no events yet - all fine)"
if [ -s /etc/static-watchdog/health.key ]; then
  echo "--- health report:"
  [ -s /var/lib/static-watchdog/health-queue.jsonl ] && echo "waiting to send: $(wc -l < /var/lib/static-watchdog/health-queue.jsonl) lines" || echo "sent to n8n"
fi
echo "Installed."
