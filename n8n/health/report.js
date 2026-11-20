// "Build health report" Code node (Static OS - Health, webhook "App asks").
// Turns the rows of the two health data tables into what the System health page shows:
//  - tiles: how each part is right now
//  - rows: a timeline per part (24 h in 30-minute blocks, or 7 days in 3-hour blocks)
//  - events: "What happened", newest first, with failed runs grouped by cause
// Times are milliseconds; the app shows them in the person's own time zone.
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const now = Date.now();
const req = $('Is a member').first().json;
const range = req.range === '7d' ? '7d' : '24h';
const span = range === '7d' ? 7 * 24 * HOUR : 24 * HOUR;
const size = range === '7d' ? 3 * HOUR : 30 * MIN;
const count = Math.round(span / size);
const start = Math.floor((now - span) / size) * size + size; // the last block ends after now
const rowsOf = name => { try { return $(name).all().map(i => i.json).filter(r => r && Number(r.at) > 0); } catch (e) { return []; } };
const checks = rowsOf('Read checks').map(r => ({ ...r, at: Number(r.at) })).sort((a, b) => a.at - b.at);
const events = rowsOf('Read events').map(r => ({ ...r, at: Number(r.at) })).sort((a, b) => a.at - b.at);
const n8nChecks = checks.filter(c => c.src === 'n8n');
const serverChecks = checks.filter(c => c.src === 'server');
const healChecks = checks.filter(c => c.src === 'selfheal');
const fails = events.filter(e => e.kind === 'workflow');
const appErrs = events.filter(e => e.kind === 'app');
const firstSeen = checks.length ? checks[0].at : now;

// ---- outages from the 5-minute n8n checks ----
// Internet: a run of checks that got no answer. n8n gap: more than 12 minutes without any n8n check.
const outages = [];
let open = null;
let prev = null;
for (const c of n8nChecks) {
  // Runs fail a few minutes before the first check that notices, so failures count from the last good check (edge).
  if (c.internet === 0 && !open) open = { kind: 'internet', from: c.at, edge: prev ? Math.max(prev.at, c.at - 10 * MIN) : c.at, to: 0 };
  if (c.internet === 1 && open) { open.to = c.at; outages.push(open); open = null; }
  prev = c;
}
if (open) { open.to = 0; outages.push(open); } // still going
for (let i = 1; i < n8nChecks.length; i++) {
  const a = n8nChecks[i - 1].at, b = n8nChecks[i].at;
  if (b - a > 12 * MIN) outages.push({ kind: 'gap', from: a, to: b });
}
const lastN8n = n8nChecks.length ? n8nChecks[n8nChecks.length - 1].at : 0;
// What the server's watchdog saw during a gap tells a stopped n8n from a server that was off or offline.
const explainGap = o => {
  const during = serverChecks.filter(s => s.at > o.from && s.at < o.to);
  const after = serverChecks.find(s => s.at >= o.to - 5 * MIN && s.up >= 0);
  if (during.some(s => s.n8n === 0)) return { title: 'n8n stopped (the server was on)', detail: 'The server kept running but n8n did not answer. The watchdog restarts it on its own.' };
  if (during.some(s => s.internet === 0)) return { title: 'Internet down at the server', detail: 'The server was on but had no internet, so nothing could reach it.' };
  if (after && after.up > 0 && after.up * 1000 < o.to - o.from + 15 * MIN) return { title: 'Server was off or restarted', detail: 'The server PC started again at the end of this time (power cut or restart).' };
  return { title: 'Server could not be reached', detail: 'No sign from the server. Power, internet or the link was down.' };
};

const inside = (t, o) => t >= (o.edge || o.from) && t <= (o.to || now);
const internetOut = outages.filter(o => o.kind === 'internet');
const failCause = f => (internetOut.some(o => inside(f.at, o)) ? 'internet' : '');

// ---- timeline ----
const blocks = [];
for (let i = 0; i < count; i++) blocks.push({ from: start - size + i * size, to: start + i * size });
const within = (list, b) => list.filter(x => x.at >= b.from && x.at < b.to);
const lvl = (b, fn) => (b.to <= firstSeen ? 'none' : fn(b));
const rows = [
  { key: 'internet', label: 'Internet', cells: blocks.map(b => lvl(b, () => {
    const c = within(checks, b).filter(x => x.internet === 0 || x.internet === 1);
    if (!c.length) return 'none';
    const bad = c.filter(x => x.internet === 0).length;
    return bad === 0 ? 'good' : bad === c.length ? 'bad' : 'warn';
  })) },
  { key: 'server', label: 'Server PC', cells: blocks.map(b => lvl(b, () => (within(checks, b).length ? 'good' : b.from > now - 10 * MIN ? 'good' : 'bad'))) },
  { key: 'n8n', label: 'n8n engine', cells: blocks.map(b => lvl(b, () => {
    const n = within(n8nChecks, b).length;
    const missed = outages.some(o => o.kind === 'gap' && o.from < b.to && o.to > b.from);
    if (!n && b.from > now - 10 * MIN) return 'good';
    return !n ? 'bad' : missed ? 'warn' : 'good';
  })) },
  { key: 'workflows', label: 'Workflows', cells: blocks.map(b => lvl(b, () => {
    if (!within(n8nChecks, b).length && b.from < now - 10 * MIN) return 'none';
    const n = within(fails, b).length;
    return n === 0 ? 'good' : n < 3 ? 'warn' : 'bad';
  })) },
  { key: 'website', label: 'Website', cells: blocks.map(b => lvl(b, () => {
    const c = within(healChecks, b).filter(x => x.website === 0 || x.website === 1);
    if (!c.length) return 'none';
    return c.some(x => x.website === 0) ? 'warn' : 'good';
  })) },
  { key: 'meta', label: 'Facebook/IG', cells: blocks.map(b => lvl(b, () => {
    const c = within(healChecks, b).filter(x => x.meta === 0 || x.meta === 1);
    if (!c.length) return 'none';
    return c.some(x => x.meta === 0) ? 'bad' : 'good';
  })) },
  { key: 'app', label: 'App', cells: blocks.map(b => { const n = within(appErrs, b).length; return n === 0 ? 'good' : n < 5 ? 'warn' : 'bad'; }) },
];
for (const r of rows) {
  const known = r.cells.filter(c => c !== 'none');
  r.uptime = known.length ? Math.round((known.filter(c => c === 'good').length / known.length) * 1000) / 10 : null;
}

// ---- what happened ----
const out = [];
for (const o of outages) {
  const to = o.to || 0;
  const lost = fails.filter(f => inside(f.at, o)).length;
  if (o.kind === 'internet') {
    out.push({ at: o.from, to, level: to ? 'bad' : 'bad', title: 'Internet down at the server',
      detail: `The server could not reach the internet. n8n kept running${lost ? `, but ${lost} workflow run${lost === 1 ? '' : 's'} failed because of it` : ''}.${to ? ' It came back on its own.' : ''}` });
  } else {
    const why = explainGap(o);
    out.push({ at: o.from, to: o.to, level: 'bad', title: why.title, detail: why.detail });
  }
}
// Failed runs outside an internet cut, grouped by workflow + step + message.
const groups = {};
for (const f of fails) {
  if (failCause(f)) continue;
  const key = `${f.wfId}|${f.node}|${String(f.detail).slice(0, 60)}`;
  const g = groups[key] || (groups[key] = { at: f.at, to: f.at, level: 'warn', kind: 'workflow', title: f.wf || f.title, node: f.node, detail: f.detail, count: 0, wfId: f.wfId, exec: f.exec });
  g.count++; g.to = Math.max(g.to, f.at); g.at = Math.min(g.at, f.at); g.exec = f.exec || g.exec;
}
for (const g of Object.values(groups)) { if (g.count >= 3) g.level = 'bad'; out.push(g); }
const appGroups = {};
for (const e of appErrs) {
  const key = `${e.title}|${String(e.detail).slice(0, 60)}`;
  const g = appGroups[key] || (appGroups[key] = { at: e.at, to: e.at, level: 'warn', kind: 'app', title: `App error · ${e.title}`, detail: e.detail, count: 0, people: {} });
  g.count++; g.to = Math.max(g.to, e.at); g.at = Math.min(g.at, e.at); if (e.who) g.people[e.who] = 1;
}
for (const g of Object.values(appGroups)) { g.people = Object.keys(g.people).length; out.push(g); }
const lastServer = serverChecks[serverChecks.length - 1];
if (lastServer && lastServer.note && now - lastServer.at < 2 * HOUR) out.push({ at: lastServer.at, to: 0, level: 'warn', kind: 'server', title: 'Server needs a look', detail: lastServer.note });
out.sort((a, b) => (b.to || now) - (a.to || now));

// ---- tiles (right now) ----
const lastOf = list => list[list.length - 1];
const lastCheck = lastOf(n8nChecks);
const lastHeal = lastOf(healChecks.filter(h => h.website >= 0 || h.meta >= 0));
const internetNow = internetOut.find(o => !o.to);
const lastInternetOut = lastOf(internetOut.filter(o => o.to));
const fails24 = fails.filter(f => f.at > now - 24 * HOUR);
const failsSince = lastInternetOut ? fails.filter(f => f.at > lastInternetOut.to).length : fails24.length;
const lastFail = lastOf(fails);
const tiles = {
  internet: lastCheck ? { state: internetNow ? 'bad' : 'good', since: internetNow ? internetNow.from : 0, lastOut: lastInternetOut ? { from: lastInternetOut.from, to: lastInternetOut.to } : null } : { state: 'none' },
  server: lastServer ? { state: lastServer.note ? 'warn' : 'good', at: lastServer.at, up: lastServer.up, disk: lastServer.disk, note: lastServer.note } : { state: 'none', note: 'watchdog' },
  n8n: { state: 'good', lastCheck: lastN8n },
  workflows: { state: fails24.length === 0 ? 'good' : failsSince === 0 ? 'warn' : failsSince < 3 ? 'warn' : 'bad', failed24: fails24.length, since: failsSince, lastAt: lastFail ? lastFail.at : 0, lastOutTo: lastInternetOut ? lastInternetOut.to : 0, explained: fails24.filter(f => failCause(f)).length },
  website: lastHeal ? { state: lastHeal.website === 0 ? 'warn' : 'good', at: lastHeal.at } : { state: 'none' },
  meta: lastHeal ? { state: lastHeal.meta === 0 ? 'bad' : 'good', at: lastHeal.at } : { state: 'none' },
  app: { state: appErrs.filter(e => e.at > now - 24 * HOUR).length ? 'warn' : 'good', today: appErrs.filter(e => e.at > now - 24 * HOUR).length },
};

return [{ json: { ok: true, at: now, range, size, start: start - size, rows, tiles, events: out.slice(0, 30), since: firstSeen } }];
