// One-time import of the "Price List Hardware" sheet into the app's price list (Firestore prices/*).
// Settings.dryRun = true only builds a report and writes nothing. The real run refuses to start when the
// app already has a price list (prices/_meta exists), so it can never overwrite prices edited in the app.
// Product ids come from the name, so running the report twice gives the same ids.
const PROJECT = 'poster-pilot-8d35e';
const DB = 'projects/' + PROJECT + '/databases/(default)/documents';
// Where each column is, per tab (read from the sheet's headers and the quotation tabs' VLOOKUPs on 2026-11-14).
// in = "In build" (داخل تجميعة), alone = "Alone" (خارج تجميعة). Tabs with one price use it for both.
const TABS = [
  { tab: 'CPU', id: 'cpu', name: 'CPU', c: { socket: 'A', name: 'B', in: 'C', alone: 'D', warranty: 'E', company: 'F' } },
  { tab: 'MB', id: 'mb', name: 'Motherboard', c: { socket: 'A', name: 'B', in: 'C', alone: 'D', warranty: 'E', company: 'F', memory: 'G' } },
  { tab: 'RAM', id: 'ram', name: 'RAM', c: { name: 'A', in: 'B', alone: 'C', warranty: 'D', memory: 'E', company: 'F' } },
  { tab: 'VGA', id: 'vga', name: 'Graphics card', c: { company: 'A', name: 'B', in: 'C', alone: 'D', warranty: 'E' } },
  { tab: 'SSD', id: 'ssd', name: 'SSD / HDD', c: { company: 'A', size: 'B', name: 'C', in: 'D', alone: 'E', warranty: 'F' } },
  { tab: 'Case', id: 'case', name: 'Case', c: { company: 'A', name: 'B', in: 'C', alone: 'D', warranty: 'E' } },
  { tab: 'PSU', id: 'psu', name: 'Power supply', c: { company: 'A', name: 'B', in: 'C', alone: 'D', warranty: 'E' } },
  { tab: 'Cooler', id: 'cooler', name: 'Cooler', c: { name: 'A', in: 'B', alone: 'C', warranty: 'D', company: 'E' } },
  { tab: 'Case Fans', id: 'fans', name: 'Case fans', c: { name: 'A', in: 'B', alone: 'C', warranty: 'D', company: 'E' } },
  { tab: 'Monitor', id: 'monitor', name: 'Monitor', c: { company: 'A', name: 'B', in: 'C', alone: 'D', warranty: 'E' } },
  { tab: 'Acc', id: 'acc', name: 'Accessories', c: { company: 'A', name: 'B', in: 'C', alone: 'C', warranty: 'D' } },
  { tab: 'ACC FAN', id: 'accfan', name: 'Fan accessories', c: { company: 'A', name: 'B', in: 'C', alone: 'C' } },
  { tab: 'Thermalpaste', id: 'paste', name: 'Thermal paste', c: { name: 'A', in: 'B', alone: 'B' } },
  { tab: 'Laptop', id: 'laptop', name: 'Laptop', c: { company: 'A', name: 'B', in: 'C', alone: 'C', warranty: 'D' } },
];
const str = v => (v === undefined || v === null) ? '' : String(v);
const clean = v => str(v).replace(/\s+/g, ' ').trim();
const col = L => L.charCodeAt(0) - 65;
const num = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = clean(v).replace(/,/g, '');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return 'p' + (h >>> 0).toString(36); };
const enc = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  const fields = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) fields[k] = enc(v[k]); return { mapValue: { fields } };
};

const S = $('Settings').first().json;
const vr = $('Read price list').first().json.valueRanges || [];
const metaFound = $('Read meta').all().some(i => i.json && i.json.found);
const now = Date.now();
const report = { dryRun: S.dryRun !== false, alreadyImported: metaFound, total: 0, categories: [] };
const writes = [];
TABS.forEach((t, k) => {
  const rows = (vr[k] && vr[k].values) || [];
  const at = {}; for (const [f, L] of Object.entries(t.c)) at[f] = col(L);
  const items = {}; const seen = {};
  const r = { tab: t.tab, id: t.id, rowsRead: rows.length, products: 0, withBothPrices: 0, noPrice: [], oddPrice: [], duplicates: [], groups: [], specs: {}, inDiffers: 0, sample: [] };
  let group = ''; let n = 0;
  rows.forEach((row, i) => {
    if (i === 0) return; // header row
    const get = f => (at[f] === undefined ? '' : row[at[f]]);
    const name = clean(get('name'));
    if (!name || /^(#|Loading)/.test(name)) return;
    // The sheet repeats its header word between blocks ("ITEM" in Acc): not a product, not a group.
    if (/^(item|items|price|name)$/i.test(name)) { group = ''; return; }
    const inP = num(get('in')), alone = num(get('alone'));
    const others = ['company', 'warranty', 'socket', 'memory', 'size'].some(f => clean(get(f)));
    // A row with only a name is a heading in the sheet, such as "AIR" above the air coolers.
    if (inP === null && alone === null && !others && name.length <= 30) { group = name; r.groups.push(name); return; }
    for (const f of ['in', 'alone']) { const raw = clean(get(f)); if (raw && num(get(f)) === null) r.oddPrice.push(name + ' (' + f + ': ' + raw + ')'); }
    const key = name.toLowerCase();
    if (seen[key]) { r.duplicates.push(name + ' (rows ' + seen[key] + ' and ' + (i + 1) + ')'); return; }
    seen[key] = i + 1;
    const item = { n: ++n, name, in: inP !== null ? inP : alone, alone: alone !== null ? alone : inP, warranty: num(get('warranty')), company: clean(get('company')) };
    if (group) item.group = group;
    const specs = {};
    const socket = clean(get('socket')).toUpperCase();
    if (/^(AM\d|LGA\s?\d+|FM\d|STR\d|TR\d)/.test(socket)) specs.socket = socket.replace(/\s/g, '');
    const mem = clean(get('memory')).toUpperCase().match(/DDR\d/);
    if (mem) specs.memory = mem[0];
    const size = clean(get('size'));
    if (size) specs.size = size.replace(/\s/g, '').toUpperCase();
    if (Object.keys(specs).length) { item.specs = specs; for (const s of Object.keys(specs)) r.specs[s] = (r.specs[s] || 0) + 1; }
    if (item.alone === null) r.noPrice.push(name);
    if (inP !== null && alone !== null) { r.withBothPrices++; if (inP !== alone) r.inDiffers++; }
    let id = hash(t.id + '|' + key); while (items[id]) id += 'x';
    items[id] = item; r.products++;
    if (r.sample.length < 3) r.sample.push(item);
  });
  report.total += r.products;
  report.categories.push(r);
  writes.push({ update: { name: DB + '/prices/' + t.id, fields: enc({ name: t.name, order: k + 1, items, importedAt: now }).mapValue.fields } });
});
writes.push({ update: { name: DB + '/prices/_meta', fields: enc({ version: 1, at: now }).mapValue.fields } });
// Safety: never over a list already in the app, and never a list that looks broken.
let stop = '';
if (metaFound) stop = 'The app already has a price list. Nothing was written.';
else if (report.total < 100) stop = 'Only ' + report.total + ' products were read; that looks wrong. Nothing was written.';
report.stop = stop;
report.willWrite = !report.dryRun && !stop;
return [{ json: { report, writes: report.willWrite ? writes : [] } }];
