// Posts store, step 2: turns database posts into sheet-style rows (read), or works out the database
// writes for the columns a workflow wrote (write). Shared rules are in lib.js (pasted above).
const PROJECT = 'poster-pilot-8d35e';
const plan = $('Plan').first().json;
const got = $('Ask database').all().map(i => i.json);
const inputs = $('When called by a workflow').all().map(i => i.json);
const raw = inputs.length && (inputs[0].raw === true || inputs[0].raw === 'true');
const found = got.flatMap(j => j.document ? [j.document] : (j.found ? [j.found] : []));
if (plan.op !== 'write') {
  if (plan.purpose === 'templates') {
    const t = found.length ? docOf(found[0]).f : {};
    return (Array.isArray(t.items) ? t.items : []).filter(x => x && clean(x.name)).map(x => ({ json: { 'Template': clean(x.name), 'Caption text': str(x.text) } }));
  }
  const docs = found.map(docOf).filter(d => d.f.appDeleted !== true && d.f.appNew !== true);
  docs.sort((a, b) => (Number(a.f.order) || 0) - (Number(b.f.order) || 0));
  return docs.map(d => ({ json: rowOf(d, raw) }));
}
// ---- write ----
const byId = new Map(found.map(docOf).map(d => [d.id, d]));
const state = new Map();
for (const j of inputs) {
  const id = String(j.id || '').trim();
  const d = byId.get(id);
  if (!d) continue; // the post is gone: nothing to write
  const cur = state.get(id) || { d, f: d.f, changed: new Set() };
  const r = applyCols(cur.f, (j.cols && typeof j.cols === 'object') ? j.cols : {});
  r.changed.forEach(k => cur.changed.add(k));
  cur.f = r.f;
  state.set(id, cur);
}
const at = new Date().toISOString();
const writes = [];
for (const [id, s] of state) {
  if (!s.changed.size) continue;
  const f = s.f;
  const zone = zoneOf(f), q = queuesOf(f);
  const fields = {};
  const mask = [...s.changed];
  for (const k of mask) fields[k] = f[k];
  fields.zone = zone; fields.q = q; fields.engineAt = Date.now();
  mask.push('zone', 'q', 'engineAt');
  writes.push({ update: { name: s.d.name, fields: fieldsOf(fields) }, updateMask: { fieldPaths: mask }, currentDocument: { exists: true } });
  for (const [act, note] of historyOf(s.d.f, f)) writes.push(logWrite(PROJECT, id, act, note, '', at));
}
return [{ json: { _op: 'write', _writes: writes, _echo: inputs.map(j => ({ ...((j.cols && typeof j.cols === 'object') ? j.cols : {}), row_number: j.id })) } }];
