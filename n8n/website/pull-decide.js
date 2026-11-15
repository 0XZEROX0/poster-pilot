// "Decide and build changes" Code node. For each product whose website values differ from the app, with the app's
// category read fresh:
// - website = app: only the record of what the website has (web.*) is brought up to date.
// - the app has a change the website has not got yet (app value <> web.*): the app wins, the sync sends it.
// - otherwise the website changed: the app takes the website's value (Online price, Online sale, stock), web.* too, so
//   nothing is sent back, and a history line by "Website" is written. A website name change only updates web.name;
//   the app then shows "Name differs on the website" to choose a name.
// One commit per category, only if the category did not change since it was read (else it is tried next run).
const S = $('Settings').first().json;
const DRY = S.dryRun !== false;
const base = `projects/${S.projectId}/databases/(default)/documents`;
const sd = $getWorkflowStaticData('global');
sd.seen = sd.seen || {};
const dv = v => { if (!v || typeof v !== 'object') return null; if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return Number(v.doubleValue); if ('timestampValue' in v) return v.timestampValue; if ('nullValue' in v) return null; if ('mapValue' in v) { const o = {}; const f = (v.mapValue && v.mapValue.fields) || {}; for (const k of Object.keys(f)) o[k] = dv(f[k]); return o; } if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(dv); return null; };
const ev = v => { if (v === null || v === undefined) return { nullValue: null }; if (typeof v === 'string') return { stringValue: v }; if (typeof v === 'boolean') return { booleanValue: v }; if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (Array.isArray(v)) return { arrayValue: { values: v.map(ev) } }; const fields = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) fields[k] = ev(v[k]); return { mapValue: { fields } }; };
const n = v => (v === null || v === undefined || v === '' ? null : Number(v));
const show = v => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toLocaleString('en-US') : String(v));
const stockLabel = s => (s === 'outofstock' ? 'Out of stock' : 'In stock');
const NOW = new Date().toISOString();
const rid = () => Array.from({ length: 20 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]).join('');
const finds = $('Find website changes').all().map(i => i.json);
const out = [], report = [];
$input.all().forEach((it, i) => {
  const k = it.pairedItem && typeof it.pairedItem.item === 'number' ? it.pairedItem.item : i;
  const c = finds[k];
  const doc = it.json || {};
  if (!c || !doc.fields || !doc.updateTime) { report.push(`${c ? c.cat : '?'}: could not read the category, tried next run`); return; }
  const f = dv({ mapValue: { fields: doc.fields } }) || {};
  const items = {}, paths = [], logs = [], seen = [];
  let appChanged = false;
  for (const cand of c.cands) {
    seen.push([cand.key, cand.snap]);
    const it2 = (f.items || {})[cand.pid];
    if (!it2 || !it2.web || it2.web.ok !== true) continue;
    const w = it2.web, s = cand.s, set = {}, del = [], web = {}, changes = [];
    // Online price (empty in the app = follow the website).
    { const a = n(it2.online), m = n(w.price);
      if (s.price !== a) { if (a === null || a === m) { if (s.price === null) del.push('online'); else set.online = s.price; web.price = s.price; changes.push({ f: 'online', from: show(a), to: show(s.price) }); } }
      else if (m !== s.price) web.price = s.price; }
    // Online sale (empty = no sale).
    { const a = n(it2.onlineSale), m = n(w.sale);
      if (s.sale !== a) { if (a === m) { if (s.sale === null) del.push('onlineSale'); else set.onlineSale = s.sale; web.sale = s.sale; changes.push({ f: 'onlineSale', from: show(a), to: show(s.sale) }); } }
      else if (m !== s.sale) web.sale = s.sale; }
    // Stock.
    { const a = it2.out === true ? 'outofstock' : 'instock', m = w.stock ? (w.stock === 'outofstock' ? 'outofstock' : 'instock') : null;
      if (s.stock !== a) { if (m === a) { if (s.stock === 'outofstock') set.out = true; else del.push('out'); web.stock = s.stock; changes.push({ f: 'out', from: stockLabel(a), to: stockLabel(s.stock) }); } }
      else if (m !== s.stock) web.stock = s.stock; }
    // Name on the website: recorded only (the app asks which name to keep).
    if (s.name && s.name !== String(w.name || '').replace(/\s+/g, ' ').trim()) web.name = s.name;
    if (!Object.keys(set).length && !del.length && !Object.keys(web).length) continue;
    web.pulledAt = NOW;
    items[cand.pid] = { ...set, web };
    for (const key of Object.keys(set).concat(del)) paths.push(`items.${cand.pid}.${key}`);
    for (const key of Object.keys(web)) paths.push(`items.${cand.pid}.web.${key}`);
    if (changes.length) {
      appChanged = true;
      logs.push({ update: { name: `${base}/priceLog/${rid()}`, fields: { cat: ev(c.cat), pid: ev(cand.pid), name: ev(String(it2.name || '')), act: ev('edit'), changes: ev(changes), at: { timestampValue: NOW }, by: ev('website'), byName: ev('Website') } }, currentDocument: { exists: false } });
    }
    report.push(`${it2.name}: ${changes.length ? changes.map(x => `${x.f} ${x.from || 'empty'} -> ${x.to || 'empty'}`).join(', ') : 'record updated'}`);
  }
  if (!paths.length) { for (const [key, snap] of seen) sd.seen[key] = snap; return; }
  const writes = [{ update: { name: `${base}/prices/${c.cat}`, fields: { items: ev(items) } }, updateMask: { fieldPaths: paths }, currentDocument: { updateTime: doc.updateTime } }, ...logs];
  // The engine (posters) reads the price list again when the version moves.
  if (appChanged) writes.push({ transform: { document: `${base}/prices/_meta`, fieldTransforms: [{ fieldPath: 'version', increment: { integerValue: '1' } }, { fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }] } });
  out.push({ json: { cat: c.cat, writes, seen, dry: DRY, send: !DRY } });
});
if (!out.length) return [{ json: { cat: '', writes: [], seen: [], dry: DRY, send: false, report } }];
out[0].json.report = report;
return out;
