#!/bin/bash
# Static OS server watchdog (installed 2026-11). Runs every 5 minutes as root (systemd timer).
# Fixes what is safe to fix on its own, logs everything to /var/log/static-watchdog.log.
#  1. n8n container stopped            -> docker start n8n
#  2. n8n frozen (local healthz fails 3 times in ~1 min, container running) -> docker restart n8n (max once per 30 min)
#  3. public link (Tailscale Funnel)   -> handled by tailscale-healthcheck.timer (every 10 min), not here
#  4. disk over 85% used               -> snapper cleanup (uses snapper's own keep rules), docker image/build cache prune
#  5. n8n database log (WAL) over 3 GB -> shrink it, but only between 02:00 and 05:00 Cairo time (stops n8n ~1 min)
#  6. report to the app's System health page (n8n "Static OS - Health"): internet, n8n answering, uptime, disk and
#     problems. Sent every 30 min and at once when something changes; while n8n is down the lines wait in a queue and go
#     out together when it is back, so the page can tell "n8n stopped" from "server off" from "no internet".
#     The key is in /etc/static-watchdog/health.key (written by install.sh, never in the repository).
# State + status: /var/lib/static-watchdog/ (status.json is read by n8n's self-heal workflow through a mount, if set up).
set -uo pipefail
LOG=/var/log/static-watchdog.log
STATE=/var/lib/static-watchdog
LOCAL=http://127.0.0.1:5678/healthz
CT=n8n
mkdir -p "$STATE"
log(){ echo "$(date '+%F %T') $*" >> "$LOG"; }
now=$(date +%s)
since(){ local f="$STATE/$1"; echo $(( now - $(cat "$f" 2>/dev/null || echo 0) )); }
mark(){ echo "$now" > "$STATE/$1"; }
problems=()

# ---- 1 + 2: n8n up and answering ----
running=$(docker inspect -f '{{.State.Running}}' "$CT" 2>/dev/null || echo missing)
if [ "$running" = missing ]; then
  log "n8n container missing - not touching it, needs a person"; problems+=("n8n container missing")
elif [ "$running" != true ]; then
  log "n8n container stopped -> docker start"; docker start "$CT" >/dev/null 2>&1 && log "n8n started" || { log "docker start failed"; problems+=("n8n would not start"); }
  mark last-n8n-start
else
  ok=0
  for i in 1 2 3; do
    curl -fsS --max-time 10 "$LOCAL" >/dev/null 2>&1 && { ok=1; break; }
    [ $i -lt 3 ] && sleep 20
  done
  if [ $ok -eq 0 ]; then
    up=$(( now - $(date -d "$(docker inspect -f '{{.State.StartedAt}}' "$CT")" +%s) ))
    if [ $up -lt 300 ]; then log "n8n not answering but started ${up}s ago - waiting"
    elif [ "$(since last-n8n-restart)" -lt 1800 ]; then log "n8n not answering, restarted less than 30 min ago - skipping"; problems+=("n8n not answering after a restart")
    else log "n8n not answering for ~1 min -> docker restart"; docker restart -t 60 "$CT" >/dev/null 2>&1; mark last-n8n-restart; log "n8n restarted"; fi
  fi
fi

# ---- 4: disk ----
use=$(df --output=pcent / | tail -1 | tr -dc 0-9)
if [ "${use:-0}" -ge 85 ] && [ "$(since last-disk-clean)" -ge 21600 ]; then
  log "disk ${use}% used -> snapper cleanup + docker prune"
  command -v snapper >/dev/null && { snapper cleanup number >/dev/null 2>&1; snapper cleanup timeline >/dev/null 2>&1; }
  docker image prune -f >/dev/null 2>&1; docker builder prune -f >/dev/null 2>&1
  mark last-disk-clean
  use2=$(df --output=pcent / | tail -1 | tr -dc 0-9); log "disk now ${use2}% used"
  [ "${use2:-0}" -ge 90 ] && problems+=("server disk ${use2}% full")
fi

# ---- 5: n8n database log (WAL) ----
VOL=$(docker inspect "$CT" --format '{{range .Mounts}}{{if eq .Destination "/home/node/.n8n"}}{{.Source}}{{end}}{{end}}' 2>/dev/null)
if [ -n "$VOL" ] && [ -f "$VOL/database.sqlite-wal" ]; then
  wal=$(stat -c %s "$VOL/database.sqlite-wal"); hour=$(TZ=Africa/Cairo date +%H)
  if [ "$wal" -gt 3221225472 ] && [ "$hour" -ge 2 ] && [ "$hour" -lt 5 ] && [ "$(since last-wal)" -ge 72000 ] && command -v sqlite3 >/dev/null; then
    log "n8n database log $((wal/1048576)) MB -> shrinking (n8n stops ~1 min)"
    owner=$(stat -c %u:%g "$VOL/database.sqlite")
    docker stop -t 60 "$CT" >/dev/null 2>&1
    (cd "$VOL" && sqlite3 database.sqlite 'PRAGMA wal_checkpoint(TRUNCATE);' >/dev/null 2>&1); chown "$owner" "$VOL"/database.sqlite* 2>/dev/null
    docker start "$CT" >/dev/null 2>&1; mark last-wal; mark last-n8n-restart
    log "database log now $(( $(stat -c %s "$VOL/database.sqlite-wal" 2>/dev/null || echo 0) / 1048576 )) MB, n8n started"
  elif [ "$wal" -gt 3221225472 ]; then problems+=("n8n database log $((wal/1048576)) MB (shrinks at night)"); fi
fi

# ---- 6: report to System health ----
KEYF=/etc/static-watchdog/health.key
if [ -s "$KEYF" ]; then
  net=0
  for u in https://www.google.com/generate_204 https://1.1.1.1/cdn-cgi/trace; do
    curl -fsS -o /dev/null --max-time 8 "$u" 2>/dev/null && { net=1; break; }
  done
  n8n=0; curl -fsS -o /dev/null --max-time 10 "$LOCAL" 2>/dev/null && n8n=1
  boot=$(cut -d' ' -f1 /proc/uptime | cut -d. -f1)
  note=$(printf '%s, ' "${problems[@]+"${problems[@]}"}" | sed 's/, $//' | tr -d '"\\' | cut -c1-280)
  sig="$net|$n8n|$note"
  Q="$STATE/health-queue.jsonl"
  # A line when something changed, every 30 min, and every run while something is down (for the timeline).
  if [ "$sig" != "$(cat "$STATE/health-last" 2>/dev/null)" ] || [ "$(since last-health)" -ge 1740 ] || [ $net -eq 0 ] || [ $n8n -eq 0 ]; then
    printf '{"at":%s000,"internet":%s,"n8n":%s,"up":%s,"disk":%s,"note":"%s"}\n' "$now" "$net" "$n8n" "${boot:-0}" "${use:-0}" "$note" >> "$Q"
    echo "$sig" > "$STATE/health-last"; mark last-health
    [ $net -eq 0 ] && log "health: no internet at the server"
  fi
  if [ -s "$Q" ] && [ $n8n -eq 1 ]; then
    tail -n 500 "$Q" > "$Q.send"
    body=$(printf '{"key":"%s","lines":[%s]}' "$(tr -dc 'A-Za-z0-9' < "$KEYF")" "$(paste -sd, "$Q.send")")
    code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -H 'Content-Type: application/json' --data-binary @- \
      http://127.0.0.1:5678/webhook/static-os-health-server <<< "$body" 2>/dev/null || echo 000)
    if [ "$code" = 200 ]; then : > "$Q"; else log "health: report not sent (HTTP $code), kept $(wc -l < "$Q") lines"; fi
    rm -f "$Q.send"
  fi
  # Never let the queue grow without end (8 days of 5-minute lines).
  [ -f "$Q" ] && [ "$(wc -l < "$Q")" -gt 2400 ] && { tail -n 2400 "$Q" > "$Q.tmp" && mv "$Q.tmp" "$Q"; }
fi

# ---- status for the app ----
printf '{"at":"%s","disk":%s,"problems":[%s]}\n' "$(date -u +%FT%TZ)" "${use:-0}" \
  "$(printf '"%s",' "${problems[@]+"${problems[@]}"}" | sed 's/,$//')" > "$STATE/status.json"
exit 0
