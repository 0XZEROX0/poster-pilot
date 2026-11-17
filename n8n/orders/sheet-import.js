// "Plan the import" Code node of "TEMP - Import old online sales sheet" (one-time, 2026-11-17).
// Reads every tab of the "STATIC ONLINE SALES" sheet (the form tab and one tab per month), keeps one row per order
// (a month tab wins over the form tab), then:
//   - a "Website" row that matches a website order already in the app (same phone, placed within 3 days, total close)
//     adds its sales rep, category, label and shipping state to that order (only fields still empty) and a note step;
//   - every other row becomes an order added in the app (orders/MS...), never sent to the website.
// Writes go in batches of 400 (Firestore takes up to 500 per request); each new order must not exist yet, so running
// it twice adds nothing twice.
const S = $('Settings').first().json;
const DRY = S.dryRun !== false;
const base = `projects/${S.projectId}/databases/(default)/documents`;
const dv = v => { if (!v || typeof v !== 'object') return null; if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return Number(v.doubleValue); if ('timestampValue' in v) return Date.parse(v.timestampValue); if ('nullValue' in v) return null; if ('mapValue' in v) { const o = {}; const f = (v.mapValue && v.mapValue.fields) || {}; for (const k of Object.keys(f)) o[k] = dv(f[k]); return o; } if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(dv); return null; };
const ev = v => { if (v === null || v === undefined) return { nullValue: null }; if (typeof v === 'string') return { stringValue: v }; if (typeof v === 'boolean') return { booleanValue: v }; if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (Array.isArray(v)) return { arrayValue: { values: v.map(ev) } }; const fields = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) fields[k] = ev(v[k]); return { mapValue: { fields } }; };
const NOW = new Date().toISOString();

const AR = '٠١٢٣٤٥٦٧٨٩';
const latin = s => String(s ?? '').replace(/[٠-٩]/g, d => String(AR.indexOf(d)));
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const num = s => { const n = Number(latin(s).replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; };
/** Egyptian mobile as 01xxxxxxxxx when it looks like one; the last 10 digits are used to match. */
function phoneOf(s) {
  let d = latin(s).split(/[-/،,]/)[0].replace(/\D/g, '');
  if (d.startsWith('0020')) d = d.slice(4);
  else if (d.startsWith('20') && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith('1')) d = '0' + d;
  return d;
}
const tail10 = p => p.replace(/\D/g, '').slice(-10);
/** Minutes Cairo is ahead of UTC at a moment (2, or 3 in summer). */
function cairoOffset(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(ms / 60000) * 60000) / 60000);
}
/** "12:53:44 م 2026/03/15" or "2026/07/01" (Cairo time) -> ms. م = PM, ص = AM. A date alone counts as noon. */
function whenOf(s) {
  const t = latin(s).trim();
  const d = t.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!d) return 0;
  let h = 12, mi = 0, se = 0;
  const c = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([صم]|AM|PM)?/i);
  if (c) { h = +c[1] % 12; mi = +c[2]; se = +(c[3] || 0); if (/م|PM/i.test(c[4] || '')) h += 12; if (!c[4]) h = +c[1]; }
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], h, mi, se);
  return guess - cairoOffset(guess - 3 * 3600_000) * 60000;
}
const STATUS = s => { s = clean(s).toLowerCase(); return s.startsWith('complete') ? 'completed' : s.startsWith('cancel') ? 'cancelled' : s.startsWith('in progress') ? 'confirmed' : 'new'; };
const SOURCE = p => { p = clean(p).toLowerCase(); return p.startsWith('whats') ? 'whatsapp' : p === 'fb' || p.startsWith('face') ? 'facebook' : p === 'ig' || p.startsWith('insta') ? 'instagram' : p.startsWith('call') ? 'callcenter' : p.startsWith('web') ? 'site' : p.startsWith('phone') ? 'phone' : 'other'; };
const CATEGORY = c => { c = clean(c); return /^acc/i.test(c) ? 'Accessories' : /^hardware/i.test(c) ? 'Hardware part' : /^pc$/i.test(c) ? 'PC' : /^monitor/i.test(c) ? 'Monitor' : c; };
const REP = r => { r = clean(r); return /^ahmed$/i.test(r) ? 'Ahmed' : r; };

// ---- 1. Every sheet row, one per order. The form tab comes first so a month tab's copy (with the final status) wins.
const ranges = ($('Read the sheet').first().json.valueRanges) || [];
const rows = new Map();
let raw = 0;
for (const r of ranges) {
  const tab = String(r.range || '').split('!')[0].replace(/'/g, '').trim();
  const vals = r.values || [];
  const head = (vals[0] || []).map(h => clean(h).toLowerCase());
  const col = name => head.findIndex(h => h.startsWith(name));
  const C = { ts: 0, status: col('order status'), email: col('email'), name: col('name'), phone: col('number'), specs: col('order specs'), total: col('total order'), ship: col('shipping fees'), cat: col('category'), addr: col('full address'), comments: col('comments'), city: col('city'), platform: col('platform'), rep: col('sales rep'), label: col('label used'), shipState: col('shipping state') };
  for (const v of vals.slice(1)) {
    const g = k => (C[k] >= 0 ? v[C[k]] ?? '' : '');
    const name = clean(g('name')), phone = phoneOf(g('phone')), specs = clean(g('specs'));
    if (!name && !phone && !specs) continue;
    raw++;
    const placedAt = whenOf(g('ts'));
    if (!placedAt) continue;
    // A timestamp with a time names one form answer (month tabs copy it), so the month tab's copy wins.
    const ts = clean(latin(g('ts')));
    const key = /\d:\d\d/.test(ts) ? ts : `${ts}|${tail10(phone)}|${num(g('total'))}`;
    rows.set(key, {
      tab, placedAt, status: STATUS(g('status')), email: clean(g('email')).slice(0, 200), customer: name.slice(0, 200), phone: phone.slice(0, 40), specs: specs.slice(0, 400),
      total: num(g('total')), shipping: num(g('ship')), category: CATEGORY(g('cat')).slice(0, 80), address: clean(g('addr')).slice(0, 500), note: String(g('comments') || '').trim().slice(0, 2000),
      city: clean(g('city')).slice(0, 120), platform: clean(g('platform')), source: SOURCE(g('platform')), rep: REP(g('rep')).slice(0, 80), label: clean(g('label')).slice(0, 120), shipState: clean(g('shipState')).slice(0, 120),
    });
  }
}

// ---- 2. Website orders already in the app, to match the sheet's "Website" rows.
const web = [];
for (const it of $('Read app orders').all()) {
  const d = it.json && it.json.document;
  if (!d) continue;
  const f = dv({ mapValue: { fields: d.fields || {} } }) || {};
  if (!f.wooId) continue;
  web.push({ name: d.name, updateTime: d.updateTime, f, t: tail10(String(f.phone || '')), used: false });
}
const DAY = 86400000;
function matchWeb(r) {
  const t = tail10(r.phone);
  if (t.length < 9) return null;
  let best = null, bestGap = Infinity;
  for (const w of web) {
    if (w.used || w.t !== t) continue;
    const gap = Math.abs((w.f.placedAt || 0) - r.placedAt);
    if (gap > 3 * DAY) continue;
    const goods = Number(w.f.webTotal || 0) - Number(w.f.shipping || 0);
    const close = !r.total || Math.abs(goods - r.total) <= Math.max(1000, r.total * 0.2) || Math.abs(Number(w.f.webTotal || 0) - r.total) <= Math.max(1000, r.total * 0.2);
    if (!close) continue;
    if (gap < bestGap) { best = w; bestGap = gap; }
  }
  if (best) best.used = true;
  return best;
}

// ---- 3. Writes.
const writes = [];
const report = { sheetRows: raw, orders: rows.size, matched: 0, created: 0, bySource: {}, byStatus: {}, byTab: {}, sales: 0 };
const by = (o, k) => { o[k] = (o[k] || 0) + 1; };
const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const hash = s => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return Array.from({ length: 4 }, (_, i) => abc[(h >>> (i * 5)) % abc.length]).join(''); };
for (const [key, r] of rows) {
  by(report.byTab, r.tab); by(report.byStatus, r.status);
  if (r.status === 'completed') report.sales += r.total + r.shipping;
  const w = r.source === 'site' ? matchWeb(r) : null;
  if (w) {
    report.matched++;
    by(report.bySource, 'website (matched)');
    const set = {};
    for (const k of ['rep', 'category', 'label', 'shipState']) if (r[k] && !w.f[k]) set[k] = r[k];
    const steps = [...(w.f.steps || []), { at: Date.now(), by: 'sheet', byName: 'Old sales sheet', kind: 'note', note: [`From the old sales sheet (${r.tab})`, r.rep && `Sales rep: ${r.rep}`, r.note].filter(Boolean).join(' · ').slice(0, 1000) }];
    const fields = Object.fromEntries(Object.entries({ ...set, steps }).map(([k, v]) => [k, ev(v)]));
    fields.updatedAt = { timestampValue: NOW };
    writes.push({ update: { name: w.name, fields }, updateMask: { fieldPaths: [...Object.keys(set), 'steps', 'updatedAt'] }, currentDocument: { updateTime: w.updateTime } });
    continue;
  }
  report.created++;
  by(report.bySource, r.source);
  const day = new Date(r.placedAt + 2 * 3600000);
  const tag = hash(key);
  const id = `MS${r.placedAt.toString(36)}${tag}`;
  const delivery = r.shipping > 0 || r.address ? 'delivery' : 'pickup';
  const f = {
    source: r.source, wooId: 0, number: `S-${String(day.getUTCDate()).padStart(2, '0')}${String(day.getUTCMonth() + 1).padStart(2, '0')}-${tag}`, webStatus: '', want: '', status: r.status,
    closed: !['new', 'confirmed'].includes(r.status), customer: r.customer, phone: r.phone, email: r.email, address: r.address, city: r.city, area: '', delivery, shipping: r.shipping,
    payMethod: '', items: [{ name: r.specs || '—', qty: 1, total: r.total, pid: 0, vid: 0 }], webTotal: Math.round((r.total + r.shipping) * 100) / 100, agreed: null, customerNote: r.note,
    date: '', time: '', webError: '', rep: r.rep, category: r.category, label: r.label, shipState: r.shipState,
    steps: [{ at: r.placedAt, by: 'sheet', byName: 'Old sales sheet', kind: 'placed', note: [r.platform, r.rep && `Sales rep: ${r.rep}`].filter(Boolean).join(' · ') }],
  };
  const fields = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, ev(v)]));
  fields.placedAt = { timestampValue: new Date(r.placedAt).toISOString() };
  fields.updatedAt = { timestampValue: NOW };
  writes.push({ update: { name: `${base}/orders/${id}`, fields }, currentDocument: { exists: false } });
}
report.websiteRowsNotMatched = report.bySource.site || 0;
const out = [];
for (let i = 0; i < writes.length; i += 400) out.push({ json: { save: !DRY, writes: writes.slice(i, i + 400), report: i === 0 ? report : undefined } });
if (!out.length) out.push({ json: { save: false, writes: [], report } });
return out;
