# Self-heal

Two parts, added 2026-11-18 after a day when website order alerts and the app's engine calls stopped reaching n8n.

## n8n: `LfW6wouR5RsK17He` "Static OS - Self-heal" (folder Static OS / App engine & store)
Every 15 minutes (`node build.cjs` prints the workflow, `decide.js` is the Code node):
- **Website order alerts stalled** (newest website order changed > 15 min ago, no order alert after it): kicks the
  website's background queue (`wp-cron.php`) every run. Still stalled after 45 min: one line in the app's Activity page.
  An order the hourly read already put in the app (`orders/W<id>` updatedAt after the website change, node "Is it in
  the app?") does not count, because WooCommerce never re-sends an alert that failed while the server was off.
- **Facebook/Instagram token**: `GET /me` with "Meta Page Token". A real Facebook error: one line in Activity.
- Activity lines (`app: engine`, `act: health.problem | health.fixed`, by System) are written once when a problem
  starts and once when it is fixed (state in the workflow's static data). No WhatsApp or other outside alerts.
- **Health row** (`health-row.js`, added 2026-11-20): one row per run in the data table "Static OS - health checks"
  (`src: selfheal`, website and meta 1/0/-1) for the System health page. See `n8n/health/`.

## Server: `server/static-watchdog/` (systemd timer every 5 min, root)
Restarts n8n when its container stopped or it stops answering (max once per 30 min), cleans snapper snapshots and
Docker caches when the disk is over 85%, and shrinks n8n's database log (WAL) over 3 GB between 02:00 and 05:00 Cairo.
The public link (Tailscale Funnel) is watched by `tailscale-healthcheck.timer`, which since 2026-11-18 tests through
the public relay. Since 2026-11-20 it also reports internet, n8n, uptime, disk and problems to System health
(`/webhook/static-os-health-server`, queued while n8n is down; key in `/etc/static-watchdog/health.key`).
Install: `sudo bash install.sh <health key>` on the server. Log: `/var/log/static-watchdog.log`.
