// "Server lines" Code node (Static OS - Health, webhook "Server report").
// The watchdog on the server PC (server/static-watchdog) sends what it saw every 30 minutes, at once when something
// changes, and every line it could not send while n8n was down. Only calls from the server itself carry the key.
const b = ($input.first().json || {}).body || {};
let lines = b.lines;
if (typeof lines === 'string') { try { lines = JSON.parse(lines); } catch (e) { lines = []; } }
if (!Array.isArray(lines)) lines = [];
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const now = Date.now();
return lines.slice(-500).map(l => ({ json: {
  at: Math.min(now, num(l.at, now)), src: 'server', internet: num(l.internet, -1), website: -1, meta: -1,
  disk: num(l.disk, -1), up: num(l.up, -1), n8n: num(l.n8n, -1), note: String(l.note || '').slice(0, 300),
} })).filter(x => x.json.at > now - 8 * 24 * 3600 * 1000);
