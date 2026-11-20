# System health

The **System health** page in Static OS (tab `health`, permission "See system health" `health.view`; owner always) shows whether the server,
its internet, n8n, the workflows, the website, Facebook/Instagram and the app itself are working, with a 24 h / 7 day
timeline and a "What happened" list. Added 2026-11-20. No outside alerts (WhatsApp etc.), by the owner's choice.

Nothing here reads or writes Firestore on a timer. Everything lives in two n8n data tables:
- `apu1ktXQh3xjejyH` "Static OS - health checks": `{ at, src: n8n|server|selfheal, internet, website, meta, disk, up, n8n, note }` (kept 8 days)
- `xYrBOSsD41fvqu9O` "Static OS - health events": `{ at, kind: workflow|app, title, detail, wf, wfId, node, exec, who }` (kept 31 days)

## n8n: `XxYpVBwSu4KLRwCS` "Static OS - Health" (folder App engine & store)
`HEALTH_SERVER_KEY=... node build.cjs` prints the workflow (the key is not in the repository; it is in the
"Server report" node and in `/etc/static-watchdog/health.key` on the server).
- **Every 5 minutes** (`check.js`): asks Google and Cloudflare. A row from here also proves n8n was running; a gap in
  these rows is an outage.
- **When a workflow fails** (`failure.js`): every Static workflow names this one as its *error workflow*
  (Workflow settings > Error workflow). **Give every new workflow the same setting.**
- **Server report** (`server.js`): lines from the watchdog (`server/static-watchdog/`), POST `static-os-health-server`.
- **App asks** (`member.js`, `remember.js`, `app-errors.js`, `report.js`): POST `static-os-health` with a Firebase
  ID token. Members and their role (roles/{id}.perms has health.view, or owner; unsaved admin) are checked once an hour (cached in static data). `op=get` returns the report, `op=report` saves
  errors the app caught (crashes, failed saves).
- **Every night** 03:15: drops old rows.

## App
`src/data/health.ts` asks every 5 minutes while the app is open (every minute while the server does not answer).
If the engine does not answer while the device is online, the server is offline: a red banner shows on every page and
the System health tile gets a "!" badge. Demo mode (no Firebase) shows a sample; add `?health=down` to see an outage.
