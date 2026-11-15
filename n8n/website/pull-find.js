// "Find website changes" Code node. Compares what the website has now for each confirmed link (the product, or its
// option) with what the app has. Only links where they differ, and whose website values were not already looked at,
// go on: the app's category is then read fresh to decide who changed. Nothing differs = nothing more is read.
const sd = $getWorkflowStaticData('global');
sd.seen = sd.seen || {};
const reqs = $('Links to check').all().map(i => i.json);
const decode = s => String(s || '').replace(/&#215;|&times;|×/gi, 'x').replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
const num = v => { const x = parseFloat(String(v ?? '')); return Number.isFinite(x) ? x : null; };
const prod = {}, opts = {}, failed = new Set();
for (const it of $input.all()) {
  const k = it.pairedItem && typeof it.pairedItem.item === 'number' ? it.pairedItem.item : 0;
  const r = reqs[k] || {};
  const j = it.json || {};
  if (j.error || !j.id) { if (r.kind === 'options') failed.add(r.id); continue; }
  if (r.kind === 'options') (opts[r.id] = opts[r.id] || {})[j.id] = j; else prod[j.id] = j;
}
const byCat = {};
let checked = 0;
for (const l of sd.links || []) {
  const p = prod[l.id];
  if (!p) continue;
  let src = p;
  if (l.type === 'variable') { if (!l.variation || failed.has(l.id)) continue; src = (opts[l.id] || {})[l.variation]; if (!src) continue; }
  checked++;
  const s = { price: num(src.regular_price), sale: num(src.sale_price), stock: src.stock_status === 'outofstock' ? 'outofstock' : 'instock', name: decode(p.name) };
  const key = `${l.cat}/${l.pid}`, snap = JSON.stringify(s);
  if (sd.seen[key] === snap) continue;
  const differs = s.price !== l.app.price || s.sale !== l.app.sale || s.stock !== l.app.stock || s.name !== decode(l.webName);
  if (!differs) { sd.seen[key] = snap; continue; }
  (byCat[l.cat] = byCat[l.cat] || []).push({ pid: l.pid, key, snap, s });
}
const out = Object.entries(byCat).map(([cat, cands]) => ({ json: { cat, cands } }));
if (!out.length) return [];
out[0].json.checked = checked;
return out;
