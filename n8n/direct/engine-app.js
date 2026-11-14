// App engine: carries out what people did in the app that needs the engine (runs every minute).
// - A post deleted in the app is removed, unless it is on Facebook's schedule (then it is refused with a note).
// - A post made in the app gets its place in the list, its Price before and Company from the product list.
// - Any other change: Price before / Company again if the items changed, and the post's zone and queues.
// The poster and scheduling workflows then find the post in their queue.
const PROJECT = 'poster-pilot-8d35e';
const docs = $('Find app changes').all().map(i => i.json).filter(j => j && j.document).map(j => docOf(j.document));
const cat = $('Read product list').all().map(i => i.json).find(j => j && j.found);
const products = cat ? ((docOf(cat.found).f.items) || []) : [];
const last = $('Last post').all().map(i => i.json).find(j => j && j.document);
let maxOrder = last ? Number(docOf(last.document).f.order) || 0 : 0;
const at = new Date().toISOString();
const FLAGS = ['appDirty', 'appEdits', 'appNew', 'appNote'];
const fileIdOf = v => { const m = str(v).match(/\/d\/([\w-]+)/) || str(v).match(/[?&]id=([\w-]+)/); return m ? m[1] : (/^[\w-]{20,}$/.test(clean(v)) ? clean(v) : ''); };
const writes = []; const bin = []; const notes = [];
for (const d of docs) {
  const f = d.f;
  if (f.appDeleted === true) {
    const out = /^(published|posted)/i, queued = /^scheduled/i;
    const isOut = out.test(clean(f.fbStatus)) || out.test(clean(f.igStatus)) || /^published/i.test(clean(f.feedback));
    if (queued.test(clean(f.fbStatus)) || queued.test(clean(f.igStatus)) || (!isOut && clean(f.fbPostId) !== '')) {
      writes.push({ update: { name: d.name, fields: fieldsOf({ appDirty: false, appDeleted: false, appNote: 'This post is on the schedule, so it was not deleted. Cancel its schedule first.' }) }, updateMask: { fieldPaths: FLAGS.concat(['appDeleted']) }, currentDocument: { updateTime: d.updateTime } });
      writes.push(logWrite(PROJECT, d.id, 'delete.refused', '', '', at));
      continue;
    }
    if (/^(WORKING|PHOTO FOUND)/i.test(clean(f.photoStatus))) { notes.push('delete waits, poster being built: ' + d.id); continue; }
    writes.push({ delete: d.name, currentDocument: { updateTime: d.updateTime } });
    for (const v of [f.posterUrl, f.ex && f.ex.scheduledImage]) { const id = fileIdOf(v); if (id && !bin.includes(id)) bin.push(id); }
    continue;
  }
  const g = { ...f };
  const mask = new Set(FLAGS);
  const edits = (f.appEdits && typeof f.appEdits === 'object') ? f.appEdits : {};
  if (f.appNew === true) {
    g.order = ++maxOrder; mask.add('order');
    g.offer = clean(f.offer) === 'Approved' ? 'Approved' : ''; mask.add('offer');
    g.items = (Array.isArray(f.items) ? f.items : []).filter(it => it && clean(it.name)).slice(0, 3).map((it, i) => ({ slot: i + 1, category: clean(it.category), name: clean(it.name), manualPhoto: clean(it.manualPhoto), nextPhoto: it.nextPhoto === true })); mask.add('items');
    if (!clean(g.style)) { g.style = 'Static'; mask.add('style'); }
    if (!g.ex || typeof g.ex !== 'object') { g.ex = {}; mask.add('ex'); }
  }
  if (f.appNew === true || 'items' in edits) {
    const p = pricesFrom(g.items, products);
    if (products.length) { g.priceBefore = p.priceBefore; g.company = p.company; mask.add('priceBefore'); mask.add('company'); }
  }
  g.zone = zoneOf(g); g.q = queuesOf(g); mask.add('zone'); mask.add('q');
  const fields = { appDirty: false, appNote: '' };
  for (const k of mask) if (!FLAGS.includes(k)) fields[k] = g[k];
  writes.push({ update: { name: d.name, fields: fieldsOf(fields) }, updateMask: { fieldPaths: [...mask] }, currentDocument: { updateTime: d.updateTime } });
}
return [{ json: { writes, bin, notes, count: docs.length } }];
