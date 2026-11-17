// "Save results" Code node (lib.js and result.js are pasted above): what each post's step got back (resultOf), as the post's
// changes with its zone, queue and history lines, in one Firestore batch. Fields only the engine writes; `ex.*` keys go into the post's `ex` map.
const PROJECT = 'poster-pilot-8d35e';
const at = new Date().toISOString();
const writes = [];
const seen = new Set();
for (const it of $input.all().map(i => i.json)) {
  if (!it || !it.p || !it.p.id) continue;
  const r = { id: it.p.id, name: it.p.name, f: it.p.f, title: it.p.title, patch: resultOf(it.step, it.p, it.a) };
  if (seen.has(r.id)) continue;
  const keys = Object.keys(r.patch || {});
  if (!keys.length) continue;
  seen.add(r.id);
  const a = r.f || {};
  const b = JSON.parse(JSON.stringify(a));
  b.ex = (b.ex && typeof b.ex === 'object') ? b.ex : {};
  const mask = new Set();
  for (const k of keys) {
    if (k.startsWith('ex.')) { b.ex[k.slice(3)] = str(r.patch[k]); mask.add('ex'); }
    else { b[k] = str(r.patch[k]); mask.add(k); }
  }
  b.zone = zoneOf(b); b.q = queuesOf(b); b.engineAt = Date.now();
  mask.add('zone'); mask.add('q'); mask.add('engineAt');
  const fields = {};
  for (const k of mask) fields[k] = b[k];
  writes.push({ update: { name: r.name, fields: fieldsOf(fields) }, updateMask: { fieldPaths: [...mask] }, currentDocument: { exists: true } });
  for (const [act, note] of historyOf(a, b)) writes.push(logWrite(PROJECT, r.id, act, note, r.title, at));
}
return writes.length ? [{ json: { writes } }] : [];
