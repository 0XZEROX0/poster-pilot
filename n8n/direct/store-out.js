// Posts store, last step: hands the result back to the calling workflow (rows for a read, the written
// columns for a write, the way the old Google Sheets step answered).
const a = $('Apply').all();
const w = a[0] && a[0].json && a[0].json._op === 'write' ? a[0].json : null;
if (w) return (w._echo || []).map(j => ({ json: j }));
// Read-only columns 'Layer 1'-'Layer 4': where the person put each product on a poster with more than one product
// (front / middle / back, empty = the poster decides). Items are put in their columns the same way as lib.js slotted().
const layers = {};
for (const g of $('Ask database').all()) {
  const d = g.json && (g.json.document || g.json.found);
  if (!d || !d.name) continue;
  const list = ((((d.fields || {}).items || {}).arrayValue || {}).values || []).map(v => (v && v.mapValue && v.mapValue.fields) || null).filter(Boolean);
  const val = (f, k) => { const x = f[k] || {}; return 'stringValue' in x ? x.stringValue : ('integerValue' in x ? Number(x.integerValue) : ('doubleValue' in x ? Number(x.doubleValue) : null)); };
  const out = [null, null, null, null];
  for (const f of list) { const s = Number(val(f, 'slot')); if (s >= 1 && s <= 4 && !out[s - 1]) out[s - 1] = f; }
  for (const f of list) { if (out.includes(f)) continue; const free = out.indexOf(null); if (free >= 0) out[free] = f; }
  layers[d.name.split('/').pop()] = out.map(f => { const v = String((f && val(f, 'layer')) || '').trim().toLowerCase(); return ['front', 'middle', 'back'].includes(v) ? v : ''; });
}
return a.map(i => {
  const ly = layers[i.json && i.json.row_number];
  if (!ly) return { json: i.json };
  return { json: { ...i.json, 'Layer 1': ly[0], 'Layer 2': ly[1], 'Layer 3': ly[2], 'Layer 4': ly[3] } };
});
