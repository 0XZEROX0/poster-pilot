// "Save results to the app" Code node. Writes back to each product's web link what the website has now
// (price, sale, stock), when it was sent, and the error if it failed, so the app shows "Website" or "Website error".
// The changes come from "Build website changes"; the website's answers from "Send to website" (batch requests made
// by "Group into batches": each answer lists the products / options it changed, or an error per product). In a
// dry run nothing is written.
// Each change that was really sent also gets a line in the app's activity log (activity/{id}, by "Website"),
// so the Activity page shows what went to the website and what the website refused.
const S = $('Settings').first().json;
const base = `projects/${S.projectId}/databases/(default)/documents`;
const ev = v => { if (v === null || v === undefined) return { nullValue: null }; if (typeof v === 'string') return { stringValue: v }; if (typeof v === 'boolean') return { booleanValue: v }; if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; const fields = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) fields[k] = ev(v[k]); return { mapValue: { fields } }; };
const decode = s => String(s || '').replace(/&#215;|&times;|×/gi, 'x').replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
const num = v => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : null; };
const NOW = new Date().toISOString();
const byCat = {}, report = [], activity = [];
const rid = () => Array.from({ length: 20 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('');
const sentText = b => [b.name ? 'name ' + b.name : '', b.regular_price !== undefined ? 'price ' + b.regular_price : '', b.sale_price !== undefined ? 'sale ' + (b.sale_price || 'none') : '', b.stock_status ? (b.stock_status === 'outofstock' ? 'out of stock' : 'in stock') : '', b.stock_quantity === 0 ? 'out of stock' : ''].filter(Boolean).join(' · ');
const activityLine = (p, w) => ({ update: { name: `${base}/activity/${rid()}`, fields: { app: ev('website'), act: ev(w.error ? 'website.error' : 'website.sent'), what: ev(String(p.name || '').slice(0, 300)), note: ev((w.error ? w.error + ' (' + sentText(p.body || {}) + ')' : sentText(p.body || {})).slice(0, 1000)), ref: ev(`${p.cat}/${p.pid}`.slice(0, 80)), by: ev('website'), byName: ev('Website'), at: { timestampValue: NOW } } }, currentDocument: { exists: false } });
// The website's answer for each change: by batch request address, then by product / option id.
const W = 'https://static-eg.com/wp-json/wc/v3/products';
const reqs = $('Group into batches').all().map(i => i.json);
const answers = {}, broken = {};
const sentOut = $('Send to website').isExecuted ? $('Send to website').all() : [];
for (const it of sentOut) {
  const pi = Array.isArray(it.pairedItem) ? it.pairedItem[0] : it.pairedItem;
  const req = reqs[pi && typeof pi.item === 'number' ? pi.item : 0] || {};
  const j = it.json || {};
  if (!Array.isArray(j.update)) { broken[req.url] = String((j.error && (j.error.message || j.error.description)) || j.message || 'no answer').slice(0, 300); continue; }
  const a = (answers[req.url] = answers[req.url] || {});
  for (const r of j.update) if (r && r.id) a[r.id] = r;
}
const answerFor = p => {
  const m = String(p.url).match(/\/products\/(\d+)(?:\/variations\/(\d+))?$/);
  if (!m) return { error: { message: 'no address' } };
  const url = m[2] ? `${W}/${m[1]}/variations/batch` : `${W}/batch`;
  const r = (answers[url] || {})[Number(m[2] || m[1])];
  return r || { error: { message: broken[url] || 'no answer' } };
};
for (const p of $('Build website changes').all().map(i => i.json)) {
  if (!p) continue;
  const sent = p.method === 'PUT';
  const r = sent ? answerFor(p) : {};
  const w = {};
  if (p.error) w.error = p.error;
  else if (!sent) { /* dry run: nothing was sent */ }
  else if (r.error || !r.id) w.error = 'The website refused the change: ' + String((r.error && (r.error.message || r.error.description)) || r.message || 'no answer').slice(0, 300);
  else if (p.part === 'name') { w.name = decode(r.name); w.rename = undefined; w.sentAt = NOW; }
  else {
    w.price = num(r.regular_price); w.sale = num(r.sale_price); w.stock = r.stock_status === 'outofstock' ? 'outofstock' : 'instock'; w.sentAt = NOW; if (p.variation) { w.variation = p.variation; if (p.option) w.option = p.option; }
    if (p.body && p.body.name) { w.name = decode(r.name); w.rename = undefined; } // the website has the new name now (rename is in the mask with no value, so it is removed)
  }
  w.triedAt = NOW;
  if (sent && S.dryRun === false) activity.push(activityLine(p, w));
  report.push(`${p.name}: ${w.error ? 'ERROR ' + w.error : (p.dry ? 'would send ' : 'sent ') + JSON.stringify(p.body)}`);
  if (S.dryRun !== false) continue;
  const b = (byCat[p.cat] = byCat[p.cat] || { fields: {}, paths: [] });
  // A product with options and a new name has two changes in this run (option, then main product): both are kept.
  const had = (b.fields[p.pid] && b.fields[p.pid].web) || {};
  const keep = { ...had, ...w };
  if (had.error && !w.error) keep.error = had.error;
  b.fields[p.pid] = { web: keep };
  const keys = w.error ? ['error', 'triedAt'] : (p.part === 'name' ? ['name', 'rename', 'sentAt', 'triedAt'] : ['price', 'sale', 'stock', 'sentAt', 'error', 'triedAt'].concat(p.variation ? ['variation', 'option'] : [], p.body && p.body.name ? ['name', 'rename'] : []));
  for (const k of keys) if (!b.paths.includes(`items.${p.pid}.web.${k}`)) b.paths.push(`items.${p.pid}.web.${k}`);
}
const writes = Object.entries(byCat).map(([cat, b]) => ({ update: { name: `${base}/prices/${cat}`, fields: { items: ev(b.fields) } }, updateMask: { fieldPaths: b.paths }, currentDocument: { exists: true } })).concat(activity);
return [{ json: { writes, report } }];
