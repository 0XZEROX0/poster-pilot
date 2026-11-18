# Self-heal

Two parts, added 2026-11-18 after a day when website order alerts and the app's engine calls stopped reaching n8n.

## n8n: `LfW6wouR5RsK17He` "Static OS - Self-heal" (folder Static OS / App engine & store)
Every 15 minutes (`node build.cjs` prints the workflow, `decide.js` is the Code node):
- **Website order alerts stalled** (newest website order changed > 15 min ago, no order alert after it): kicks the
  website's background queue (`wp-cron.php`) every run. Still stalled after 45 min: one line in the app's Activity page.
- **Facebook/Instagram token**: `GET /me` with "Meta Page Token". A real Facebook error: one line in Activity.
- Activity lines (`app: engine`, `act: health.problem | health.fixed`, by System) are written once when a problem
  starts and once when it is fixed (state in the workflow's static data). No WhatsApp or other outside alerts.

## Server: `server/static-watchdog/` (systemd timer every 5 min, root)
Restarts n8n when its container stopped or it stops answering (max once per 30 min), cleans snapper snapshots and
Docker caches when the disk is over 85%, and shrinks n8n's database log (WAL) over 3 GB between 02:00 and 05:00 Cairo.
The public link (Tailscale Funnel) is watched by `tailscale-healthcheck.timer`, which since 2026-11-18 tests through
the public relay. Install: `sudo bash install.sh` on the server. Log: `/var/log/static-watchdog.log`.
