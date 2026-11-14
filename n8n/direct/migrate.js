// One-time final copy from the Posts sheet into the app's database, run at the switch-over.
// For every sheet row that has a post id tag (the sync's hidden row tag), the post is brought fully up to
// date from the sheet: its items, every column (including the ones only the workflows use, kept in `ex`),
// its place in the list (order = row number), zone and queues. Nothing is deleted. With dryRun only a
// report comes out.
const PROJECT = 'poster-pilot-8d35e';
const cfg = $('Settings').first().json;
const vr = $('Read sheet').first().json.valueRanges || [];
const posts = (vr[0] && vr[0].values) || [];
const head = (posts[0] || []).map(clean);
const tags = (($('Read row ids').first().json || {}).matchedDeveloperMetadata || []).map(m => m.developerMetadata)
  .filter(m => m && m.metadataKey === 'p' && m.location && m.location.dimensionRange && (m.location.dimensionRange.sheetId || 0) === 0);
const idAt = new Map(tags.map(m => [(m.location.dimensionRange.startIndex || 0) + 1, clean(m.metadataValue)]));
const docs = $('Read posts').all().map(i => i.json).filter(j => j.document).map(j => docOf(j.document));
const byId = new Map(docs.map(d => [d.id, d]));
let marks = [];
try { marks = (((($('Read item marks').first().json.sheets || [])[0] || {}).data || [])[0] || {}).rowData || []; } catch (e) { marks = []; }
const isRed = (r, c) => { const bg = ((((marks[r - 2] || {}).values || [])[c] || {}).userEnteredFormat || {}).backgroundColor; return !!bg && (bg.red || 0) > 0.85 && (bg.green || 0) < 0.5 && (bg.blue || 0) < 0.5; };
const writes = []; const report = { rows: 0, updated: 0, untagged: [], noDoc: [], docsWithoutRow: [], keptAppEdits: [], sample: [] };
const seen = new Set();
for (let i = 1; i < posts.length; i++) {
  const r = i + 1; const line = posts[i] || [];
  const g = h => { const c = head.indexOf(h); return c < 0 ? '' : (line[c] === undefined ? '' : line[c]); };
  const items = [];
  for (const n of [1, 2, 3]) { const name = clean(g('Item ' + n)); if (name) items.push({ slot: n, category: clean(g('Category ' + n)), name, manualPhoto: clean(g('Manual photo ' + n)), nextPhoto: clean(g('Next photo ' + n)).toUpperCase() === 'TRUE', photoMissing: isRed(r, head.indexOf('Item ' + n)) }); }
  if (!items.length && !clean(g('Image link'))) continue;
  report.rows++;
  const id = idAt.get(r);
  if (!id) { report.untagged.push(r); continue; }
  const d = byId.get(id);
  if (!d) { report.noDoc.push(r + ':' + id); continue; }
  seen.add(id);
  const cols = {}; for (const h of head) if (h && !/^(Clear |Preview$)/.test(h)) cols[h] = g(h);
  const base = { ...d.f, items };
  const { f } = applyCols(base, cols);
  // A change made in the app that the old sync has not taken to the sheet yet wins over the sheet.
  const pending = d.f.appDirty === true && d.f.appEdits && typeof d.f.appEdits === 'object' ? Object.keys(d.f.appEdits) : [];
  for (const k of pending) if (k in d.f) f[k] = d.f[k];
  if (pending.length) report.keptAppEdits.push(id + ': ' + pending.join(','));
  f.order = r; f.zone = zoneOf(f); f.q = queuesOf(f);
  if (!f.offer) f.offer = '';
  const mask = ['items', 'order', 'zone', 'q', 'ex', 'migratedAt', ...Object.values(TYPED)];
  const fields = {}; for (const k of mask) if (k !== 'migratedAt') fields[k] = f[k] === undefined ? (k === 'ex' ? {} : '') : f[k];
  fields.migratedAt = Date.now();
  writes.push({ update: { name: d.name, fields: fieldsOf(fields) }, updateMask: { fieldPaths: mask }, currentDocument: { exists: true } });
  report.updated++;
  if (report.sample.length < 3) report.sample.push({ id, r, zone: f.zone, q: f.q, ex: f.ex });
}
for (const d of docs) if (!seen.has(d.id)) report.docsWithoutRow.push(d.id + (d.f.appNew ? ' (new in app)' : '') + (d.f.appDeleted ? ' (deleted in app)' : ''));
const ok = report.untagged.length === 0 && report.noDoc.length === 0;
return [{ json: { dryRun: cfg.dryRun === true, ok, report, writes: (cfg.dryRun === true || !ok) ? [] : writes } }];
