// Plans one sync run between the Posts sheet and the PosterPilot database.
// It only reads here. The nodes after it carry the plan out.
// Sheet -> app: every post row is mirrored to posts/{id}. A row is recognised by a hidden id tag on
//   the row itself (Sheets "developer metadata", key "p"), which travels with the row when it moves.
//   No column is added and no visible cell is used for it.
// App -> sheet: changes waiting in the app (appDirty) are written into the matching row, and posts
//   created in the app are put into the first blank row.
// Never written: Company, Price before, Preview (formulas) and everything the poster and
//   scheduling workflows fill in.
const cfg = $('Settings').first().json;
const mem = $('Check memory').first().json;
const sd = $getWorkflowStaticData('global');
const full = mem.full === true;
const KEY = 'p';
const SHEET = Number(cfg.postsSheetId) || 0;
const clean = v => (v === undefined || v === null) ? '' : String(v).trim();
const text = v => (v === undefined || v === null) ? '' : String(v);

const dec = v => {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) { const o = {}; const f = (v.mapValue && v.mapValue.fields) || {}; for (const k of Object.keys(f)) o[k] = dec(f[k]); return o; }
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(dec);
  return null;
};
const enc = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  const fields = {}; for (const k of Object.keys(v)) fields[k] = enc(v[k]); return { mapValue: { fields } };
};
const fieldsOf = o => enc(o).mapValue.fields;
const path = (col, id) => 'projects/' + cfg.projectId + '/databases/(default)/documents/' + col + '/' + id;
const hash = s => { let a = 0xdeadbeef, b = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); } a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909); b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909); return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36); };
const newId = () => { const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (let i = 0; i < 10; i++) s += abc[Math.floor(Math.random() * abc.length)]; return s; };
const num = s => Number(String(s).replace(/[^\d.]/g, '')) || 0;

// ---------- the sheet ----------
const vr = $('Read sheet').first().json.valueRanges || [];
const grid = i => (vr[i] && vr[i].values) || [];
const posts = grid(0);
const head = (posts[0] || []).map(clean);
const col = name => head.indexOf(name);
const NEED = ['Category 1', 'Category 2', 'Category 3', 'Item 1', 'Item 2', 'Item 3', 'Next photo 1', 'Next photo 2', 'Next photo 3', 'Manual photo 1', 'Manual photo 2', 'Manual photo 3', 'Company', 'Price before', 'Price after', 'Style', 'Details', 'Image link', 'Photo status', 'Feedback', 'Post date', 'Post time', 'Scheduled for', 'Caption', 'Caption style', 'FB status', 'IG status', 'FB post id'];
for (const n of NEED) if (col(n) < 0) throw new Error('Posts sheet: the column "' + n + '" was not found. The sync stopped and changed nothing.');
const USER_COLS = ['Category 1', 'Category 2', 'Category 3', 'Manual photo 1', 'Manual photo 2', 'Manual photo 3', 'Price after', 'Details', 'Photo status', 'Feedback', 'Post date', 'Post time', 'Scheduled for', 'Caption', 'Caption style', 'FB status', 'IG status', 'FB post id'];
const FEEDBACK = { '': '', 'done': 'Done', 'redo': 'Redo', 'redo next image': 'Redo next image', 'ignore': 'Ignore' };

// The poster workflow paints the cell of an item whose photo it could not find red. Reading that
// colour tells the app which item of a bundle is the missing one.
let marks = [];
try { marks = ((((($('Read item marks').first().json.sheets || [])[0] || {}).data || [])[0] || {}).rowData) || []; } catch (e) { marks = []; }
const isRed = (i, c) => {
  const bg = ((((marks[i - 1] || {}).values || [])[c] || {}).userEnteredFormat || {}).backgroundColor;
  return !!bg && (bg.red || 0) > 0.85 && (bg.green || 0) < 0.5 && (bg.blue || 0) < 0.5;
};

const rows = [];
const rowAt = new Map();
for (let i = 1; i < posts.length; i++) {
  const line = posts[i] || [];
  const g = n => clean(line[col(n)]);
  const items = [];
  for (const n of [1, 2, 3]) {
    const name = g('Item ' + n);
    if (name) items.push({ slot: n, category: g('Category ' + n), name, manualPhoto: g('Manual photo ' + n), nextPhoto: g('Next photo ' + n).toUpperCase() === 'TRUE', photoMissing: isRed(i, col('Item ' + n)) });
  }
  const isPost = items.length > 0 || g('Image link') !== '';
  const blank = !isPost && USER_COLS.every(n => g(n) === '');
  const fb = g('Feedback');
  const row = { r: i + 1, line, isPost, blank, id: '', d: null };
  if (isPost) row.d = {
    order: i + 1, items, company: g('Company'), priceBefore: g('Price before'), priceAfter: g('Price after'), style: g('Style'), details: g('Details'),
    posterUrl: g('Image link'), photoStatus: g('Photo status'), feedback: fb.toLowerCase() === 'ignore' ? 'ignore' : fb,
    postDate: g('Post date'), postTime: g('Post time'), scheduledFor: g('Scheduled for'), caption: text(line[col('Caption')]), captionStyle: g('Caption style'),
    fbStatus: g('FB status'), igStatus: g('IG status'), fbPostId: g('FB post id'),
  };
  rows.push(row);
  rowAt.set(row.r, row);
}
let postRows = rows.filter(x => x.isPost);

// ---------- which row is which post ----------
const sheetReq = [];
const tags = (($('Read row ids').first().json || {}).matchedDeveloperMetadata || []).map(m => m.developerMetadata)
  .filter(m => m && m.metadataKey === KEY && m.location && m.location.dimensionRange && m.location.dimensionRange.dimension === 'ROWS' && (m.location.dimensionRange.sheetId || 0) === SHEET)
  .sort((x, y) => x.metadataId - y.metadataId);
const dropTag = m => sheetReq.push({ deleteDeveloperMetadata: { dataFilter: { developerMetadataLookup: { metadataId: m.metadataId } } } });
const addTag = (r, id) => sheetReq.push({ createDeveloperMetadata: { developerMetadata: { metadataKey: KEY, metadataValue: id, visibility: 'DOCUMENT', location: { dimensionRange: { sheetId: SHEET, dimension: 'ROWS', startIndex: r - 1, endIndex: r } } } } });
const rowOf = new Map();
for (const m of tags) {
  const row = rowAt.get((m.location.dimensionRange.startIndex || 0) + 1);
  const id = clean(m.metadataValue);
  if (!row || !row.isPost || row.id || !id || rowOf.has(id)) { dropTag(m); continue; }
  row.id = id; rowOf.set(id, row);
}
const untagged = postRows.filter(x => !x.id);
const sameSheet = sd.sheet === cfg.spreadsheetId;
const known = sameSheet ? Object.keys(sd.hash || {}).length : 0;
if (known > 50 && untagged.length > 50 && untagged.length > postRows.length / 2) throw new Error('Safety stop: ' + untagged.length + ' of ' + postRows.length + ' rows lost their id tag at once. The sync changed nothing.');
for (const row of untagged) { let id = newId(); while (rowOf.has(id)) id = newId(); row.id = id; row.fresh = true; rowOf.set(id, row); addTag(row.r, id); }

// ---------- what the app is waiting for ----------
const docs = $('Get app changes').all().map(i => i.json).filter(j => j && j.document && j.document.name)
  .map(j => ({ id: j.document.name.split('/').pop(), name: j.document.name, updateTime: j.document.updateTime, f: dec({ mapValue: { fields: j.document.fields || {} } }) || {} }));
const docAt = new Map(docs.map(d => [d.id, d]));
const writes = [];   // Firestore writes
const meta = [];     // one entry per write, same order
const push = (w, m) => { writes.push(w); meta.push(m); };
const handled = new Set();
const notes = [];
const cellReq = (r, name, value) => sheetReq.push({ updateCells: { range: { sheetId: SHEET, startRowIndex: r - 1, endRowIndex: r, startColumnIndex: col(name), endColumnIndex: col(name) + 1 }, rows: [{ values: [value ? { userEnteredValue: value } : {}] }], fields: 'userEnteredValue' } });
const str = s => s === '' ? null : { stringValue: s };
const dateCell = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? { numberValue: Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000) } : undefined; };
const timeCell = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s); return m && +m[1] < 24 && +m[2] < 60 ? { numberValue: (+m[1] * 60 + +m[2]) / 1440 } : undefined; };
const priceCell = s => /\d/.test(s) ? { numberValue: num(s) } : str(s);
const pad = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s); return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : s; };

// Writes the allowed fields of an app edit into the post's row. Returns how many cells change.
const applyEdits = (row, e) => {
  let n = 0;
  const cur = name => clean(row.line[col(name)]);
  const put = (name, value) => { cellReq(row.r, name, value); n++; };
  if ('feedback' in e) { const v = FEEDBACK[clean(e.feedback).toLowerCase()]; if (v !== undefined && v !== cur('Feedback')) put('Feedback', str(v)); }
  if ('caption' in e && text(e.caption) !== text(row.line[col('Caption')])) put('Caption', str(text(e.caption)));
  if ('captionStyle' in e && clean(e.captionStyle) !== cur('Caption style')) put('Caption style', str(clean(e.captionStyle)));
  if ('details' in e && clean(e.details) !== cur('Details')) put('Details', str(clean(e.details)));
  if ('style' in e) { const v = clean(e.style) || 'Static'; if (v !== cur('Style')) put('Style', str(v)); }
  if ('postDate' in e) { const v = clean(e.postDate); const c = v === '' ? null : dateCell(v); if (c !== undefined && v !== cur('Post date')) put('Post date', c); }
  if ('postTime' in e) { const v = pad(clean(e.postTime)); const c = v === '' ? null : timeCell(v); if (c !== undefined && v !== pad(cur('Post time'))) put('Post time', c); }
  if ('priceAfter' in e) { const v = clean(e.priceAfter); const now = cur('Price after'); if (!(v === now || (v !== '' && now !== '' && /\d/.test(v) && num(v) === num(now)))) put('Price after', v === '' ? null : priceCell(v)); }
  if (Array.isArray(e.items)) for (const it of e.items) {
    if (!it || typeof it !== 'object') continue;
    const mine = row.d.items.find(x => x.name === clean(it.name));
    if (!mine) continue; // the product itself is only changed in the sheet for now
    if (clean(it.manualPhoto) !== mine.manualPhoto) put('Manual photo ' + mine.slot, str(clean(it.manualPhoto)));
    if ((it.nextPhoto === true) !== mine.nextPhoto) put('Next photo ' + mine.slot, { boolValue: it.nextPhoto === true });
  }
  return n;
};

const lastPost = postRows.length ? postRows[postRows.length - 1].r : 1;
const freeRows = rows.filter(x => x.blank && x.r > lastPost).concat(rows.filter(x => x.blank && x.r < lastPost));
const skipMirror = new Set();
const placed = [];
const stats = { mode: full ? 'full check' : 'quick', posts: postRows.length, newIds: untagged.length, appEdits: 0, appCells: 0, appNew: 0, mirrored: 0, removed: 0 };
const FLAGS = ['appDirty', 'appEdits', 'appNew', 'appDeleted', 'appNote'];
const settle = (d, note) => push({ update: { name: d.name, fields: fieldsOf(note ? { appDirty: false, appNote: note } : { appDirty: false }) }, updateMask: { fieldPaths: FLAGS }, currentDocument: { updateTime: d.updateTime } }, { kind: 'flags', id: d.id });

for (const d of docs.filter(x => x.f.appDirty === true)) {
  handled.add(d.id);
  const row = rowOf.get(d.id);
  if (row && !row.fresh) {
    skipMirror.add(d.id);
    if (d.f.appDeleted === true) {
      // Deleting in the app empties the post's row, the way the sheet's Clear button does. Only a post
      // that is neither published nor on Facebook's schedule can go, so nothing is left behind there.
      const cur = name => clean(row.line[col(name)]);
      const live = /^(published|posted|scheduled)/i;
      if (live.test(cur('FB status')) || live.test(cur('IG status')) || cur('FB post id') !== '') { settle(d, 'This post is already scheduled or published, so it was not deleted.'); notes.push('delete refused: ' + d.id); continue; }
      if (/^(WORKING|PHOTO FOUND)/i.test(cur('Photo status'))) { notes.push('delete waits, poster being built: ' + d.id); continue; }
      const stop = head.findIndex(h => /^clear published/i.test(h));
      const end = stop > 0 ? stop : head.length;
      const keep = new Set([col('Company'), col('Price before'), col('Preview')]);
      let from = -1;
      for (let c = 0; c <= end; c++) {
        const wipe = c < end && !keep.has(c);
        if (wipe && from < 0) from = c;
        if (!wipe && from >= 0) { sheetReq.push({ updateCells: { range: { sheetId: SHEET, startRowIndex: row.r - 1, endRowIndex: row.r, startColumnIndex: from, endColumnIndex: c }, fields: 'userEnteredValue' } }); from = -1; }
      }
      cellReq(row.r, 'Style', str('Static'));
      for (const n of [1, 2, 3]) if (isRed(row.r - 1, col('Item ' + n))) sheetReq.push({ updateCells: { range: { sheetId: SHEET, startRowIndex: row.r - 1, endRowIndex: row.r, startColumnIndex: col('Item ' + n), endColumnIndex: col('Item ' + n) + 1 }, fields: 'userEnteredFormat.backgroundColor' } });
      const tag = tags.find(m => clean(m.metadataValue) === d.id && (m.location.dimensionRange.startIndex || 0) + 1 === row.r);
      if (tag) dropTag(tag);
      row.isPost = false; row.gone = true; rowOf.delete(d.id);
      push({ delete: d.name }, { kind: 'delete', id: d.id });
      stats.removed++;
      continue;
    }
    const n = applyEdits(row, (d.f.appEdits && typeof d.f.appEdits === 'object') ? d.f.appEdits : {});
    stats.appEdits++; stats.appCells += n;
    settle(d, '');
    continue;
  }
  if (d.f.appDeleted === true || d.f.appNew !== true) { push({ delete: d.name }, { kind: 'delete', id: d.id }); stats.removed++; continue; }
  // A post created in the app: put it into the first blank row.
  const items = (Array.isArray(d.f.items) ? d.f.items : []).filter(it => it && clean(it.name)).slice(0, 3);
  const free = freeRows.shift();
  if (!items.length) { push({ delete: d.name }, { kind: 'delete', id: d.id }); continue; }
  if (!free) { notes.push('no blank row left for ' + d.id); push({ update: { name: d.name, fields: fieldsOf({ appNote: 'The sheet has no blank row left for this post.' }) }, updateMask: { fieldPaths: ['appNote'] }, currentDocument: { updateTime: d.updateTime } }, { kind: 'note', id: d.id }); continue; }
  items.forEach((it, i) => {
    if (clean(it.category)) cellReq(free.r, 'Category ' + (i + 1), str(clean(it.category)));
    cellReq(free.r, 'Item ' + (i + 1), str(clean(it.name)));
    if (clean(it.manualPhoto)) cellReq(free.r, 'Manual photo ' + (i + 1), str(clean(it.manualPhoto)));
  });
  const f = d.f;
  if (clean(f.priceAfter)) cellReq(free.r, 'Price after', priceCell(clean(f.priceAfter)));
  if (clean(f.style) && clean(f.style) !== clean(free.line[col('Style')])) cellReq(free.r, 'Style', str(clean(f.style)));
  if (clean(f.details)) cellReq(free.r, 'Details', str(clean(f.details)));
  if (dateCell(clean(f.postDate))) cellReq(free.r, 'Post date', dateCell(clean(f.postDate)));
  if (timeCell(clean(f.postTime))) cellReq(free.r, 'Post time', timeCell(clean(f.postTime)));
  if (clean(f.captionStyle)) cellReq(free.r, 'Caption style', str(clean(f.captionStyle)));
  addTag(free.r, d.id);
  free.blank = false;
  placed.push(d.id);
  stats.appNew++;
  settle(d, '');
}

postRows = postRows.filter(x => !x.gone);

// ---------- sheet -> app ----------
const MIRROR = ['order', 'items', 'company', 'priceBefore', 'priceAfter', 'style', 'details', 'posterUrl', 'photoStatus', 'feedback', 'postDate', 'postTime', 'scheduledFor', 'caption', 'captionStyle', 'fbStatus', 'igStatus', 'fbPostId', 'syncHash'];
const base = {};
const old = sameSheet ? (sd.hash || {}) : {};
for (const row of postRows) {
  if (skipMirror.has(row.id)) { base[row.id] = '-'; continue; }
  const h = hash(JSON.stringify(row.d));
  const have = full ? (docAt.get(row.id) ? docAt.get(row.id).f.syncHash : undefined) : old[row.id];
  if (have === h) { base[row.id] = h; continue; }
  push({ update: { name: path('posts', row.id), fields: fieldsOf({ ...row.d, syncHash: h }) }, updateMask: { fieldPaths: MIRROR } }, { kind: 'mirror', id: row.id, hash: h });
  stats.mirrored++;
}
for (const id of placed) base[id] = '-'; // mirrored on the next run, once the sheet has filled the row in
const gone = full ? docs.map(d => d.id) : Object.keys(old);
for (const id of gone) {
  if (rowOf.has(id) || handled.has(id)) continue;
  push({ delete: path('posts', id) }, { kind: 'delete', id });
  stats.removed++;
}

// ---------- product list, styles, caption templates ----------
const cat = sameSheet ? (sd.catalog || {}) : {};
const db = grid(1);
const dbHead = (db[0] || []).map(clean);
const products = [];
dbHead.forEach((h, c) => {
  if (!/ Name$/i.test(h)) return;
  const category = h.replace(/ Name$/i, '');
  const pc = dbHead.indexOf(category + ' Price'), cc = dbHead.indexOf(category + ' Company');
  for (let i = 1; i < db.length; i++) {
    const name = clean((db[i] || [])[c]);
    if (name && !/^(#|Loading)/.test(name)) products.push({ category, name, price: pc < 0 ? '' : clean(db[i][pc]), company: cc < 0 ? '' : clean(db[i][cc]) });
  }
});
const styles = grid(2).map(r => clean(r[0])).filter(Boolean);
const templates = grid(3).slice(1).map(r => ({ name: clean(r[0]), text: text(r[1]) })).filter(t => t.name);
const catalog = { products: { items: products }, styles: { names: styles }, templates: { items: templates } };
for (const k of Object.keys(catalog)) {
  const body = JSON.stringify(catalog[k]);
  const h = hash(body);
  if (cat[k] === h) continue;
  if (body.length > 900000) { notes.push(k + ' list is too big to store'); continue; }
  if (k === 'products' && !products.length) continue;
  push({ update: { name: path('catalog', k), fields: fieldsOf(catalog[k]) } }, { kind: 'catalog', id: k, hash: h });
}

// ---------- heartbeat ----------
// The app shows when the engine last answered. One write every ten minutes is enough for that and
// keeps the database's free daily writes for real changes. A quiet run then writes nothing at all.
const beatDue = full || !sameSheet || !sd.beat || Date.now() - sd.beat > 10 * 60 * 1000;
if (beatDue) push({ update: { name: path('status', 'engine'), fields: fieldsOf({ lastSync: Date.now(), note: 'Sheet sync: ' + postRows.length + ' posts' }) } }, { kind: 'beat', id: 'engine' });

stats.sheetRequests = sheetReq.length;
stats.writes = writes.length;
// A dry run only reports: it keeps a small sample so the result is easy to read.
if (cfg.dryRun === true) return [{ json: { dryRun: true, full, stats, notes, sheetRequests: sheetReq.slice(0, 6), writes: writes.slice(0, 2).concat(writes.slice(-4)), meta: meta.slice(0, 2).concat(meta.slice(-4)), base: {} } }];
return [{ json: { dryRun: false, full, stats, notes, sheetRequests: sheetReq, writes, meta, base } }];
