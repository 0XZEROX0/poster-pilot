// "Find website photos" Code node of n8n workflow "PosterPilot - Website photos".
// The app asks for photos by setting `photoAsk` (a time) on a post. For each item of that post this finds the
// product on static-eg.com, the same way the poster maker does ("Pick Static Store Photo"), and saves every photo of
// that product in `photoChoices`, then removes `photoAsk`. The app shows them as a picker; the chosen photo goes into
// the item's Manual photo and the poster is rebuilt. Reads only the store's public product search.
// It also answers New offer's "Versions of one product" picker: photoAsks/{uid} { name, ask } gets `choice` (one
// PhotoChoiceItem, each option's own photo labelled with the option, e.g. "Jungle Panda") and `answered` = ask.
const START = Date.now();
const BUDGET = 40 * 1000; // stop starting new posts after this, so a run ends before the next one starts
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'application/json' };

// ---------- Firestore values ----------
const dv = v => { if (!v || typeof v !== 'object') return null; if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return Number(v.doubleValue); if ('nullValue' in v) return null; if ('mapValue' in v) { const o = {}; const f = (v.mapValue && v.mapValue.fields) || {}; for (const k of Object.keys(f)) o[k] = dv(f[k]); return o; } if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(dv); return null; };
const ev = v => { if (v === null || v === undefined) return { nullValue: null }; if (typeof v === 'string') return { stringValue: v }; if (typeof v === 'boolean') return { booleanValue: v }; if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (Array.isArray(v)) return { arrayValue: { values: v.map(ev) } }; const fields = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) fields[k] = ev(v[k]); return { mapValue: { fields } }; };

// ---------- the store search word: same as "Match Items Folder Photo" ----------
const clean = s => String(s || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
function storeQuery(name) {
  const want = clean(String(name || '').split(' + ')[0]);
  const BRANDS = ['asus', 'msi', 'gigabyte', 'amd', 'intel', 'lenovo', 'the', 'aorus', 'rog', 'tuf'];
  const words = want.split(' ').filter(w => w && !BRANDS.includes(w));
  const withDigit = words.filter(w => /\d/.test(w)).sort((a, b) => b.length - a.length);
  const best = withDigit[0] || '';
  return best.length >= 4 ? best : (words.slice(0, 3).join(' ') || want);
}

// ---------- the closest product and its photos: same as "Pick Static Store Photo" ----------
const STOP = ['asus', 'msi', 'gigabyte', 'amd', 'intel', 'lenovo', 'the', 'rev', 'geforce', 'radeon', 'gddr5', 'gddr6', 'gddr6x', 'gddr7', 'edition', 'motherboard', 'motherboards', 'graphics', 'card', 'cards'];
const COLORS = ['black', 'white', 'pink', 'silver', 'blue', 'red', 'gray', 'grey', 'green', 'purple', 'gold', 'snow', 'ice', 'mauve'];
const BUNDLE = ['and', 'with', 'bundle', 'combo', 'plus'];
const decode = s => String(s || '')
  .replace(/&#215;|&times;|×/gi, 'x')
  .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#\d+;/g, ' ');
const tok = s => decode(s).toLowerCase()
  .replace(/wi[\s-]*fi/g, 'wifi')
  .replace(/mouse\s*pad/g, 'mousepad')
  .replace(/(\d+)\s*x\s*(\d+)\s*gb/g, '$1x$2')
  .replace(/(\d+)\s*x\s*(\d+)/g, '$1x$2')
  .replace(/\+/g, ' plus ')
  .split(/[^a-z0-9]+/).filter(Boolean).filter(t => !STOP.includes(t));
const mustMatch = t => COLORS.includes(t) || /\d/.test(t) || /^(ii|iii|iv|vi|vii)$/.test(t);
const optionWords = p => (p.attributes || []).map(a => (a.terms || []).map(t => t.name).join(' ')).join(' ');

function pick(products, itemName) {
  const item = new Set(tok(String(itemName || '').split(' + ')[0]));
  const itemIsBundle = [...item].some(t => BUNDLE.includes(t));
  let best = null, bestScore = -1;
  for (const p of products) {
    const img = p.images && p.images[0] && p.images[0].src ? p.images[0].src : '';
    if (!img || item.size === 0) continue;
    const pt = new Set(tok(p.name + ' ' + optionWords(p)));
    let inter = 0;
    for (const t of item) { if (pt.has(t)) inter++; }
    const cont = inter / item.size;
    const jac = inter / (item.size + pt.size - inter);
    if ([...item].some(t => mustMatch(t) && !pt.has(t))) continue;
    if (cont < 1 && [...pt].some(t => COLORS.includes(t) && !item.has(t))) continue;
    if (!(jac >= 0.8 || cont >= 0.75)) continue;
    const bundle = !itemIsBundle && [...pt].some(t => BUNDLE.includes(t));
    const score = cont * 10 + jac - (bundle ? 5 : 0);
    if (score > bestScore) { best = p; bestScore = score; }
  }
  if (!best) return null;
  return { product: decode(best.name).replace(/\s+/g, ' ').trim(), page: best.permalink || '', photos: photosOf(best, item), raw: best };
}

// When no product is the same item, the closest ones (most words in common, at least 40%), so a photo can still be chosen by eye.
function near(products, itemName, n) {
  const item = new Set(tok(String(itemName || '').split(' + ')[0]));
  if (!item.size) return [];
  return products.filter(p => p.images && p.images.length).map(p => {
    const pt = new Set(tok(p.name + ' ' + optionWords(p)));
    let inter = 0;
    for (const t of item) { if (pt.has(t)) inter++; }
    return { p, cont: inter / item.size };
  }).filter(x => x.cont >= 0.4).sort((a, b) => b.cont - a.cont).slice(0, n)
    .map(x => ({ product: decode(x.p.name).replace(/\s+/g, ' ').trim(), page: x.p.permalink || '', photos: photosOf(x.p, item) }));
}

function photosOf(best, item) {
  let gallery = (best.images || []).filter(i => i && i.src);
  const optColors = [...new Set(tok(optionWords(best)).filter(t => COLORS.includes(t)))];
  const want = optColors.filter(c => item.has(c));
  if (want.length === 1 && optColors.length > 1) {
    const c = want[0];
    const ini = optColors.filter(o => o[0] === c[0]).length === 1 ? c[0] : '';
    const imgWords = i => tok(String(i.name || '') + ' ' + String(i.alt || '') + ' ' + String(i.src || '').split('/').pop().replace(/\.\w+$/, '').replace(/-/g, ' ').replace(/([a-z])(\d+)$/i, '$1 $2'));
    const mine = gallery.filter(i => { const w = imgWords(i); return w.includes(c) || (ini && w.includes(ini)); });
    if (mine.length) gallery = mine.sort((a, b) => (/\(\d+\)\s*$/.test(String(a.name || '')) ? 1 : 0) - (/\(\d+\)\s*$/.test(String(b.name || '')) ? 1 : 0));
  }
  const seen = new Set();
  return gallery.filter(i => !seen.has(i.src) && seen.add(i.src)).slice(0, 24).map(i => ({ src: i.src, thumb: i.thumbnail || i.src }));
}

// Each option's own photo of a product with options (colours...), labelled with the option's name. Read only for
// the versions picker. A photo that every option shares is not labelled.
async function labelled(p) {
  const vars = (Array.isArray(p.variations) ? p.variations : []).slice(0, 8);
  if (!vars.length) return [];
  const terms = {};
  for (const a of (p.attributes || [])) for (const t of (a.terms || [])) terms[String(t.slug || '').toLowerCase()] = decode(t.name);
  // An option kind every variation has the same value of (one switch for all colours) says nothing: left out.
  const valueOf = a => terms[String(a.value || '').toLowerCase()] || decode(a.value || '').replace(/-/g, ' ');
  const kinds = {};
  for (const v of vars) for (const a of (v.attributes || [])) (kinds[a.name] = kinds[a.name] || new Set()).add(valueOf(a));
  const out = [];
  for (const v of vars) {
    const label = (v.attributes || []).filter(a => !kinds[a.name] || kinds[a.name].size > 1 || vars.length === 1).map(valueOf).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    try {
      const r = await this.helpers.httpRequest({ url: 'https://static-eg.com/wp-json/wc/store/v1/products/' + v.id, headers: UA, json: true, timeout: 20000, returnFullResponse: true, ignoreHttpStatusErrors: true });
      const img = r.statusCode === 200 && r.body && Array.isArray(r.body.images) ? r.body.images.find(i => i && i.src) : null;
      if (img) out.push({ src: img.src, thumb: img.thumbnail || img.src, label });
    } catch (e) { /* no photo for this option */ }
    await new Promise(r => setTimeout(r, 300));
  }
  const count = {};
  for (const o of out) count[o.src] = (count[o.src] || 0) + 1;
  return out.filter(o => o.label && count[o.src] === 1);
}

async function search(q) {
  try {
    const r = await this.helpers.httpRequest({ url: 'https://static-eg.com/wp-json/wc/store/v1/products', qs: { search: q, per_page: 20 }, headers: UA, json: true, timeout: 30000, returnFullResponse: true, ignoreHttpStatusErrors: true });
    if (r.statusCode !== 200) return { err: 'The website answered ' + r.statusCode };
    return { products: Array.isArray(r.body) ? r.body : [] };
  } catch (e) { return { err: 'The website did not answer' }; }
}

// ---------- the posts that asked ----------
let asked = [];
try { asked = $('Find photo requests').all(); } catch (e) { asked = $input.all(); }
const docs = asked.map(i => i.json).filter(j => j && j.document && j.document.name)
  .map(j => ({ name: j.document.name, f: dv({ mapValue: { fields: j.document.fields || {} } }) || {} }))
  .sort((a, b) => (Number(a.f.photoAsk) || 0) - (Number(b.f.photoAsk) || 0));
let versionDocs = [];
try { versionDocs = $('Find version requests').all().map(i => i.json).filter(j => j && j.document && j.document.name).map(j => ({ name: j.document.name, updateTime: j.document.updateTime, f: dv({ mapValue: { fields: j.document.fields || {} } }) || {} })); } catch (e) { versionDocs = []; }
if (!docs.length && !versionDocs.length) return [];
const writes = [], report = [];
const cache = {};
// One name -> what the website has for it, the same way as for a post's item.
async function lookUp(name) {
  const q = storeQuery(name);
  if (!cache[q]) { cache[q] = await search.call(this, q); await new Promise(r => setTimeout(r, 800)); }
  let res = cache[q];
  const q2 = clean(name).split(' ').slice(0, 2).join(' ');
  if (!res.err && !pick(res.products, name) && q2 && q2 !== q) {
    if (!cache[q2]) { cache[q2] = await search.call(this, q2); await new Promise(r => setTimeout(r, 800)); }
    if (!cache[q2].err) res = { products: res.products.concat(cache[q2].products) };
  }
  if (res.err) return { name, product: '', page: '', photos: [], error: res.err };
  const hit = pick(res.products, name);
  return hit ? { name, ...hit, all: res.products } : { name, product: '', page: '', photos: [], near: near(res.products, name, 3), all: res.products };
}
for (const d of versionDocs) {
  if (Date.now() - START > BUDGET) break;
  const name = String(d.f.name || '').trim();
  const ask = Number(d.f.ask) || 0;
  let choice = name ? await lookUp.call(this, name) : { name: '', product: '', page: '', photos: [] };
  if (choice.raw) {
    // Every photo of the product, with each option's own photo first and named.
    const opts = await labelled.call(this, choice.raw);
    const all = (choice.raw.images || []).filter(i => i && i.src).map(i => ({ src: i.src, thumb: i.thumbnail || i.src }));
    const byLabel = new Map(opts.map(o => [o.src, o]));
    const seen = new Set();
    choice.photos = opts.concat(all.filter(p => !byLabel.has(p.src))).filter(p => !seen.has(p.src) && seen.add(p.src)).slice(0, 30);
    // Other products of the same family (other editions or colours listed on their own page), to pick versions from too.
    const others = near((choice.all || []).filter(p => p.id !== choice.raw.id), name, 4).filter(n => n.photos.length);
    // Named by the words their page has that the main product's does not ("White Blue").
    const mainWords = new Set(choice.product.toLowerCase().split(/\s+/));
    for (const n of others) { const label = n.product.split(/\s+/).filter(w => !mainWords.has(w.toLowerCase())).join(' '); if (label) for (const ph of n.photos) ph.label = label; }
    if (others.length) choice.near = others;
  }
  delete choice.raw; delete choice.all;
  const failed = !!choice.error;
  const keepAsk = failed && Date.now() - ask < 10 * 60000;
  writes.push({ update: { name: d.name, fields: { choice: ev(choice), answered: ev(ask) } }, updateMask: { fieldPaths: keepAsk ? ['choice', 'answered'] : ['choice', 'answered', 'ask'] }, currentDocument: { updateTime: d.updateTime } });
  report.push({ versions: d.name.split('/').pop(), name, result: choice.error || (choice.photos.length + ' photos, ' + choice.photos.filter(p => p.label).map(p => p.label).join(', ')) });
}
for (const d of docs) {
  if (Date.now() - START > BUDGET) break;
  const items = [];
  for (const it of (Array.isArray(d.f.items) ? d.f.items : [])) {
    const name = String((it && it.name) || '').trim();
    if (!name) { items.push({ name: '', product: '', page: '', photos: [] }); continue; }
    // The store wants every search word in the title; with nothing found, the first two words of the name are tried.
    const one = await lookUp.call(this, name);
    delete one.raw; delete one.all;
    items.push(one);
  }
  const failed = items.some(i => i.error);
  const choices = { checkedAt: Date.now(), asked: Number(d.f.photoAsk) || 0, items };
  // photoAsk is in the mask but not in the fields, so it is removed. A website error leaves it, so the next run tries again,
  // unless the ask is over 10 minutes old.
  const keepAsk = failed && Date.now() - (Number(d.f.photoAsk) || 0) < 10 * 60000;
  writes.push({ update: { name: d.name, fields: { photoChoices: ev(choices) } }, updateMask: { fieldPaths: keepAsk ? ['photoChoices'] : ['photoChoices', 'photoAsk'] }, currentDocument: { exists: true } });
  report.push({ post: d.name.split('/').pop(), items: items.map(i => i.name + ' -> ' + (i.error || (i.photos.length + ' photos' + (i.product ? ' (' + i.product + ')' : '') + (i.near ? ' near: ' + i.near.map(x => x.product + ' ' + x.photos.length).join(', ') : '')))) });
}
return writes.length ? [{ json: { writes, report, seconds: Math.round((Date.now() - START) / 1000) } }] : [];
