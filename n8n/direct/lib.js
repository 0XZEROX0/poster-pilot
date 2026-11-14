// Shared code for the workflows that use the app's database (Firestore) directly instead of the Posts sheet.
// build.cjs pastes this file into each Code node that needs it, so every node has the same rules.
//
// A post in Firestore (posts/{id}) has typed fields the app uses (see src/data/types.ts) plus `ex`, a map with
// the columns only the workflows use. The poster and scheduling workflows were written for sheet rows, so
// rowOf() turns a post into an object with the sheet's column names (row_number = the post id), and
// applyCols() does the opposite for a write. That way their own logic did not have to change.

const HEADERS = ['Category 1', 'Category 2', 'Category 3', 'Item 1', 'Next photo 1', 'Manual photo 1', 'Item 2', 'Next photo 2', 'Manual photo 2', 'Item 3', 'Next photo 3', 'Manual photo 3', 'Company', 'Price before', 'Price after', 'Style', 'Details', 'Image link', 'Product image', 'Photo status', 'Feedback', 'Preview', 'Photo #', 'Post date', 'Post time', 'Scheduled for', 'Caption', 'Caption style', 'FB status', 'IG status', 'Cached from', 'FB photo id', 'FB post id', 'Scheduled price', 'Scheduled image', 'Auto reschedule', 'Reschedule slot', 'Poster price', 'Offer approval'];
// Sheet column -> post field.
const TYPED = { 'Company': 'company', 'Price before': 'priceBefore', 'Price after': 'priceAfter', 'Style': 'style', 'Details': 'details', 'Image link': 'posterUrl', 'Photo status': 'photoStatus', 'Feedback': 'feedback', 'Post date': 'postDate', 'Post time': 'postTime', 'Scheduled for': 'scheduledFor', 'Caption': 'caption', 'Caption style': 'captionStyle', 'FB status': 'fbStatus', 'IG status': 'igStatus', 'FB post id': 'fbPostId', 'Offer approval': 'offer' };
// Sheet column -> key in the post's `ex` map (columns the app does not show).
const EX = { 'Product image': 'productImage', 'Photo #': 'photoNo', 'Cached from': 'cachedFrom', 'FB photo id': 'fbPhotoId', 'Scheduled price': 'scheduledPrice', 'Scheduled image': 'scheduledImage', 'Auto reschedule': 'autoReschedule', 'Reschedule slot': 'rescheduleSlot', 'Poster price': 'posterPrice' };
const ITEM_COL = /^(Category|Item|Manual photo|Next photo) ([123])$/;
const ITEM_KEY = { 'Category': 'category', 'Item': 'name', 'Manual photo': 'manualPhoto', 'Next photo': 'nextPhoto' };

const str = v => (v === undefined || v === null) ? '' : String(v);
const clean = v => str(v).trim();
const low = v => clean(v).toLowerCase();

// ---------- Firestore values ----------
const dec = v => {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
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
const docOf = d => ({ id: d.name.split('/').pop(), name: d.name, updateTime: d.updateTime, f: dec({ mapValue: { fields: d.fields || {} } }) || {} });

// ---------- items ----------
// Each item remembers its sheet column (slot 1-3). Posts made in the app have none; their order counts.
const slotted = items => {
  const out = [null, null, null];
  const list = Array.isArray(items) ? items.filter(it => it && typeof it === 'object') : [];
  for (const it of list) { const s = Number(it.slot); if (s >= 1 && s <= 3 && !out[s - 1]) out[s - 1] = it; }
  for (const it of list) { if (out.includes(it)) continue; const free = out.indexOf(null); if (free >= 0) out[free] = it; }
  return out;
};

// ---------- numbers as the sheet showed them ----------
const isNum = s => /^-?[\d,]+(\.\d+)?$/.test(clean(s)) && /\d/.test(s);
const toNum = s => Number(clean(s).replace(/,/g, ''));
const grouped = s => { const n = toNum(s); return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : clean(s); };

/**
 * One post as a sheet row. `raw` = the way the poster workflow read the sheet (numbers as numbers, ticks as
 * true/false); otherwise the way the scheduler read it (everything as the text the sheet showed).
 */
function rowOf(doc, raw) {
  const f = doc.f || {}; const ex = (f.ex && typeof f.ex === 'object') ? f.ex : {};
  const row = {};
  const items = slotted(f.items);
  for (const h of HEADERS) {
    let v = '';
    const m = ITEM_COL.exec(h);
    if (m) {
      const it = items[Number(m[2]) - 1];
      if (m[1] === 'Next photo') v = raw ? !!(it && it.nextPhoto === true) : ((it && it.nextPhoto === true) ? 'TRUE' : 'FALSE');
      else v = it ? str(it[ITEM_KEY[m[1]]]) : '';
    } else if (h in TYPED) {
      v = str(f[TYPED[h]]);
      if (h === 'Feedback' && low(v) === 'ignore') v = 'Ignore';
      if ((h === 'Price before' || h === 'Price after') && isNum(v)) v = raw ? toNum(v) : grouped(v);
    } else if (h in EX) {
      v = str(ex[EX[h]]);
      if (raw && h === 'Photo #' && /^\d+(\.\d+)?$/.test(v)) v = Number(v);
    }
    row[h] = v;
  }
  row.row_number = doc.id;
  return row;
}

// ---------- where a post stands ----------
const OK_FB = /^(scheduled|published|cancelled|waiting)\b/i;
/** The app's zone, the same rule the sheet sync used. */
function zoneOf(f) {
  const ps = clean(f.photoStatus), fbs = clean(f.fbStatus), igs = clean(f.igStatus), fb = clean(f.feedback);
  const trouble = (ps !== '' && ps !== 'OK' && !/^(WORKING|PHOTO FOUND)/i.test(ps)) || !(fbs === '' || OK_FB.test(fbs)) || (igs !== '' && /error|fail/i.test(igs));
  if (clean(f.offer) !== 'Approved') return 'offer';
  if (trouble) return 'fix';
  if (/^published/i.test(fb) || /^(published|posted)/i.test(fbs)) return 'posted';
  if (/^(done|cancel)$/i.test(fb)) return 'approved';
  return 'design';
}
/** Which workflow queues a post is in. Each workflow reads only its own queue, which keeps database reads low. */
function queuesOf(f) {
  const ex = (f.ex && typeof f.ex === 'object') ? f.ex : {};
  const fb = low(f.feedback);
  const items = (Array.isArray(f.items) ? f.items : []).filter(it => it && clean(it.name));
  const fbPub = /^(published|posted)/i.test(clean(f.fbStatus)), igPub = /^(published|posted)/i.test(clean(f.igStatus));
  const poster = /\/d\//.test(str(f.posterUrl));
  const q = [];
  if (clean(f.offer) === 'Approved' && items.length && fb !== 'done' && fb !== 'ignore') q.push('poster');
  if (fb === 'done' && poster && !clean(f.scheduledFor)) q.push('queue');
  if (clean(f.scheduledFor) && clean(ex.fbPhotoId) && !clean(f.igStatus)) q.push('ig');
  if ((clean(f.fbPostId) && !/^published/i.test(clean(f.fbStatus))) || /^Posted/.test(clean(f.igStatus))) q.push('status');
  if (!clean(f.scheduledFor) && fb !== 'ignore' && items.length) q.push('caption');
  if (fb === 'cancel' || (poster && !fbPub && !igPub && !['redo', 'redo next image', 'ignore'].includes(fb))) q.push('changes');
  if ((fbPub || igPub) && clean(ex.moved) !== 'yes') q.push('move');
  return q;
}

// ---------- writing sheet columns into a post ----------
const nameKey = s => clean(s).replace(/\s+/g, ' ').toLowerCase();
/**
 * Applies the columns a workflow wrote to a post. Returns the new fields (a copy) and which top-level
 * fields changed. `_missing` / `_found` (an item name) set or clear that item's missing-photo mark;
 * `_moved` notes that the poster was moved to the Published folder.
 */
function applyCols(f0, cols) {
  const f = JSON.parse(JSON.stringify(f0 || {}));
  const changed = new Set();
  const set = (k, v) => { if (JSON.stringify(f[k]) !== JSON.stringify(v)) { f[k] = v; changed.add(k); } };
  let items = Array.isArray(f.items) ? f.items.map(x => ({ ...x })) : [];
  const ex = (f.ex && typeof f.ex === 'object') ? { ...f.ex } : {};
  let itemsDirty = false, exDirty = false;
  for (const [h, v0] of Object.entries(cols || {})) {
    if (h === 'row_number') continue;
    const m = ITEM_COL.exec(h);
    if (m) {
      const slots = slotted(items);
      const it = slots[Number(m[2]) - 1];
      if (!it) continue; // no item in that column: nothing to tick
      const key = ITEM_KEY[m[1]];
      const v = key === 'nextPhoto' ? (v0 === true || low(v0) === 'true') : clean(v0);
      if (it[key] !== v) { it[key] = v; itemsDirty = true; }
      continue;
    }
    if (h === '_missing' || h === '_found') {
      const want = h === '_missing';
      for (const it of items) if (nameKey(it.name) === nameKey(v0) && (it.photoMissing === true) !== want) { it.photoMissing = want; itemsDirty = true; }
      continue;
    }
    if (h === '_moved') { if (ex.moved !== 'yes') { ex.moved = 'yes'; exDirty = true; } continue; }
    if (h in TYPED) {
      let v = str(v0);
      if (h === 'Feedback' && low(v) === 'ignore') v = 'ignore';
      set(TYPED[h], v);
      continue;
    }
    if (h in EX) { const v = str(v0); if (str(ex[EX[h]]) !== v) { ex[EX[h]] = v; exDirty = true; } }
  }
  if (itemsDirty) { f.items = items; changed.add('items'); }
  if (exDirty) { f.ex = ex; changed.add('ex'); }
  return { f, changed };
}

// ---------- history lines the workflows add ----------
const working = s => /^(WORKING|PHOTO FOUND)/i.test(s);
const failed = s => s !== '' && s !== 'OK' && !working(s);
/** The history acts for a change made by a workflow, as [act, note] pairs. */
function historyOf(a, b) {
  const out = [];
  const g = (o, k) => clean(o[k]);
  if (g(b, 'feedback') !== g(a, 'feedback')) {
    const fb = g(b, 'feedback');
    if (/^redo$/i.test(fb)) out.push(['design.redo', 'Price changed, a new poster is made']);
    else if (/^done$/i.test(fb) && !/^cancel$/i.test(g(a, 'feedback'))) out.push(['design.approved', 'Approved again after the new poster']);
  }
  if (g(b, 'postDate') !== g(a, 'postDate') || g(b, 'postTime') !== g(a, 'postTime')) {
    if (!g(b, 'postDate') && !g(b, 'postTime')) out.push(['schedule.cleared', '']);
  }
  const ps = g(b, 'photoStatus');
  if (working(ps) && !working(g(a, 'photoStatus'))) out.push(['poster.building', '']);
  if (failed(ps) && ps !== g(a, 'photoStatus')) out.push(['poster.failed', ps.slice(0, 300)]);
  if (g(b, 'posterUrl') !== g(a, 'posterUrl') && g(b, 'posterUrl') && !failed(ps)) out.push(['poster.built', '']);
  const fbs = g(b, 'fbStatus');
  if (fbs !== g(a, 'fbStatus')) {
    if (/^scheduled/i.test(fbs)) out.push(['fb.scheduled', (g(b, 'scheduledFor') || fbs).slice(0, 300)]);
    else if (/^(published|posted)/i.test(fbs)) out.push(['fb.published', '']);
    else if (/^cancelled/i.test(fbs)) out.push(['fb.cancelled', '']);
    else if (fbs !== '' && !/^waiting/i.test(fbs)) out.push(['fb.error', fbs.slice(0, 300)]);
  }
  const igs = g(b, 'igStatus');
  if (igs !== g(a, 'igStatus')) {
    if (/^(published|posted)/i.test(igs) && !/^(published|posted)/i.test(g(a, 'igStatus'))) out.push(['ig.published', '']);
    else if (/error|fail/i.test(igs)) out.push(['ig.error', igs.slice(0, 300)]);
  }
  return out;
}
const randomId = n => { const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (let i = 0; i < n; i++) s += abc[Math.floor(Math.random() * abc.length)]; return s; };
const logWrite = (project, postId, act, note, title, at) => {
  const fields = fieldsOf({ postId, by: 'system', byName: '', act, ...(note ? { note } : {}), ...(title ? { title } : {}) });
  fields.at = { timestampValue: at };
  return { update: { name: 'projects/' + project + '/databases/(default)/documents/log/' + randomId(20), fields }, currentDocument: { exists: false } };
};
const titleOf = f => (Array.isArray(f.items) ? f.items : []).map(it => clean(it && it.name)).filter(Boolean).join(' + ').slice(0, 280);

// ---------- the product list ----------
/** Price before and Company, worked out from the product list like the sheet's formulas did. */
function pricesFrom(items, products) {
  const list = (Array.isArray(items) ? items : []).filter(it => it && clean(it.name));
  if (!list.length) return { priceBefore: '', company: '' };
  let sum = 0, bad = false; const companies = [];
  for (const it of list) {
    const p = products.find(x => x.category === clean(it.category) && clean(x.name).toLowerCase() === clean(it.name).toLowerCase()); // like the sheet: same category, any case
    if (!p || (clean(p.price) !== '' && !isNum(p.price))) { bad = true; continue; }
    sum += clean(p.price) === '' ? 0 : toNum(p.price);
    if (clean(p.company) && !companies.includes(clean(p.company))) companies.push(clean(p.company));
  }
  return { priceBefore: bad ? 'Check item' : sum.toLocaleString('en-US'), company: companies.join(' + ') };
}

if (typeof module !== 'undefined') module.exports = { HEADERS, TYPED, EX, dec, enc, fieldsOf, docOf, slotted, rowOf, zoneOf, queuesOf, applyCols, historyOf, logWrite, titleOf, pricesFrom, isNum, toNum, grouped, clean, randomId };
