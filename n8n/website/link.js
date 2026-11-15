// "Match website products" Code node of n8n workflow "Static OS - Website link".
// Reads every product of static-eg.com (WooCommerce REST API, read only) and the app's price list, and for each app
// product suggests the website product with the same name. It saves:
//   web/products                      every website product, for the app's "Website product" picker
//   prices/{cat}.items.<pid>.web      the suggested link { id, name, ok: false, score, price, sale, stock, type, at }
//   prices/{cat}.items.<pid>.online   the website's current regular price, only when Online price is empty
//   prices/{cat}.items.<pid>.onlineSale  the website's current sale price, only when Online sale is empty
// A link is used by the sync only after someone confirms it in the app (ok: true). Links already confirmed are kept.
// Settings.dryRun = true only reports. Nothing is ever written to the website here.
const S = $('Settings').first().json;
const DRY = S.dryRun !== false;
const NOW = new Date().toISOString();

const dv = v => { if (!v || typeof v !== 'object') return null; if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return Number(v.doubleValue); if ('timestampValue' in v) return v.timestampValue; if ('nullValue' in v) return null; if ('mapValue' in v) { const o = {}; const f = (v.mapValue && v.mapValue.fields) || {}; for (const k of Object.keys(f)) o[k] = dv(f[k]); return o; } if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(dv); return null; };
const ev = v => { if (v === null || v === undefined) return { nullValue: null }; if (typeof v === 'string') return { stringValue: v }; if (typeof v === 'boolean') return { booleanValue: v }; if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (Array.isArray(v)) return { arrayValue: { values: v.map(ev) } }; const fields = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) fields[k] = ev(v[k]); return { mapValue: { fields } }; };

// ---------- names to words (same rules as the photo picker) ----------
const STOP = ['asus', 'msi', 'gigabyte', 'amd', 'intel', 'lenovo', 'the', 'rev', 'geforce', 'radeon', 'gddr5', 'gddr6', 'gddr6x', 'gddr7', 'edition', 'motherboard', 'motherboards', 'graphics', 'card', 'cards', 'processor'];
const COLORS = ['black', 'white', 'pink', 'silver', 'blue', 'red', 'gray', 'grey', 'green', 'purple', 'gold', 'snow', 'ice', 'mauve'];
const decode = s => String(s || '').replace(/&#215;|&times;|×/gi, 'x').replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ');
const tok = s => decode(s).toLowerCase()
  .replace(/wi[\s-]*fi/g, 'wifi').replace(/mouse\s*pad/g, 'mousepad')
  .replace(/(\d+)\s*x\s*(\d+)\s*gb/g, '$1x$2').replace(/(\d+)\s*x\s*(\d+)/g, '$1x$2')
  .replace(/(\d+)\s+(gb|tb|w|hz|mm)\b/g, '$1$2')
  .replace(/\+/g, ' plus ')
  .split(/[^a-z0-9]+/).filter(Boolean).filter(t => !STOP.includes(t));
const mustMatch = t => COLORS.includes(t) || /\d/.test(t) || /^(ii|iii|iv|vi|vii)$/.test(t);
const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };

// ---------- website products ----------
const web = $('Read website products').all().map(i => i.json).filter(p => p && p.id && p.name);
if (web.length < 20) throw new Error('Only ' + web.length + ' website products came back; stopping so nothing is linked by mistake.');
const W = web.map(p => ({
  id: Number(p.id), name: decode(p.name).replace(/\s+/g, ' ').trim(), type: String(p.type || 'simple'), status: String(p.status || ''),
  price: num(p.regular_price), sale: num(p.sale_price), stock: String(p.stock_status || ''), sku: String(p.sku || ''),
  url: String(p.permalink || ''), nameWords: new Set(tok(p.name)),
  // A product with options (colour, Tray/Box) also answers to its option words; the sync picks the option later.
  words: new Set(tok(p.name + ' ' + (p.type === 'variable' ? (p.attributes || []).map(a => (a.options || []).join(' ')).join(' ') : ''))),
}));

// The whole name counts here (a case "+ 750W" is a different product from the case alone), and the brand must match.
function score(itemName, w) {
  const item = new Set(tok(itemName));
  if (!item.size || !w.words.size) return 0;
  const brand = decode(itemName).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] || '';
  if (brand && !STOP.includes(brand) && !w.words.has(brand)) return 0;
  let inter = 0;
  for (const t of item) if (w.words.has(t)) inter++;
  if ([...item].some(t => mustMatch(t) && !w.words.has(t))) return 0;
  if ([...w.nameWords].some(t => mustMatch(t) && !item.has(t) && !COLORS.includes(t)) && inter / w.nameWords.size < 0.75) return 0;
  const cont = inter / item.size, jac = inter / (item.size + w.words.size - inter);
  if (!(jac >= 0.5 || cont >= 0.75)) return 0;
  return Math.round((cont * 0.6 + jac * 0.4) * 100);
}

// ---------- app products ----------
const docs = (($('Read price list').first().json.documents) || []).filter(d => !/\/_meta$/.test(d.name));
const prods = [];
for (const d of docs) {
  const cat = d.name.split('/').pop();
  const f = dv({ mapValue: { fields: d.fields || {} } }) || {};
  for (const [pid, it] of Object.entries(f.items || {})) prods.push({ cat, catName: f.name || cat, pid, name: String(it.name || ''), online: it.online, onlineSale: it.onlineSale, web: it.web || null });
}
if (prods.length < 100) throw new Error('Only ' + prods.length + ' app products; stopping.');

// Best website product for each app product; a website product goes to the app product it fits best.
const cand = [];
for (const p of prods) {
  if (p.web && p.web.ok) continue; // confirmed by a person: kept as it is
  let best = null, bs = 0;
  for (const w of W) { const s = score(p.name, w); if (s > bs) { bs = s; best = w; } }
  if (best) cand.push({ p, w: best, s: bs });
}
const taken = new Map();
// A simple website product goes to one app product only; a product with options can serve several (one per option).
for (const c of cand.sort((a, b) => b.s - a.s)) { const key = c.w.type === 'variable' ? 'v' + c.p.pid : c.w.id; if (!taken.has(key)) taken.set(key, c); }
for (const p of prods) if (p.web && p.web.ok) taken.set('ok' + p.pid, null);
const links = [...taken.values()].filter(Boolean);

// ---------- writes ----------
const byCat = {};
for (const c of links) {
  const { p, w } = c;
  const link = { id: w.id, name: w.name, ok: false, score: c.s, price: w.price, sale: w.sale, stock: w.stock, type: w.type, url: w.url, at: NOW };
  // Copied once so the app starts with what the website shows; a price someone already typed is never replaced.
  const fields = { web: link };
  const paths = [`items.${p.pid}.web`];
  if ((p.online === null || p.online === undefined) && w.price !== null) { fields.online = w.price; paths.push(`items.${p.pid}.online`); }
  if ((p.onlineSale === null || p.onlineSale === undefined) && w.sale !== null) { fields.onlineSale = w.sale; paths.push(`items.${p.pid}.onlineSale`); }
  (byCat[p.cat] = byCat[p.cat] || { fields: {}, paths: [] });
  byCat[p.cat].fields[p.pid] = fields;
  byCat[p.cat].paths.push(...paths);
}
const writes = [];
const base = docs.length ? docs[0].name.replace(/\/prices\/[^/]+$/, '') : '';
for (const [cat, b] of Object.entries(byCat)) {
  writes.push({ update: { name: `${base}/prices/${cat}`, fields: { items: ev(b.fields) } }, updateMask: { fieldPaths: b.paths }, currentDocument: { exists: true } });
}
const catalog = {};
for (const w of W) catalog[String(w.id)] = { n: w.name, p: w.price, s: w.sale, st: w.stock, t: w.type, k: w.sku, u: w.url, v: w.status };
writes.push({ update: { name: `${base}/web/products`, fields: { at: { timestampValue: NOW }, count: ev(W.length), items: ev(catalog) } } });

const unlinked = prods.filter(p => !(p.web && p.web.ok) && !links.some(c => c.p.pid === p.pid));
const report = {
  dryRun: DRY,
  websiteProducts: W.length,
  websiteByType: W.reduce((o, w) => (o[w.type] = (o[w.type] || 0) + 1, o), {}),
  websiteOnSale: W.filter(w => w.sale !== null).length,
  websiteOutOfStock: W.filter(w => w.stock === 'outofstock').length,
  appProducts: prods.length,
  alreadyConfirmed: prods.filter(p => p.web && p.web.ok).length,
  suggested: links.length,
  strong: links.filter(c => c.s >= 80).length,
  onlineFilled: links.filter(c => (c.p.online === null || c.p.online === undefined) && c.w.price !== null).length,
  saleFilled: links.filter(c => (c.p.onlineSale === null || c.p.onlineSale === undefined) && c.w.sale !== null).length,
  linkedOutOfStockOnWebsite: links.filter(c => c.w.stock === 'outofstock').length,
  linkedVariable: links.filter(c => c.w.type !== 'simple').map(c => c.p.name + ' => ' + c.w.name),
  noMatch: unlinked.length,
  sample: links.filter(c => c.s < 100).slice(0, 60).map(c => `${c.s} | ${c.p.name} => ${c.w.name} | ${c.w.price ?? '-'}${c.w.sale !== null ? ' (sale ' + c.w.sale + ')' : ''} | ${c.w.stock}`),
  weak: links.filter(c => c.s < 80).slice(0, 40).map(c => `${c.s} | ${c.p.name} => ${c.w.name}`),
  noMatchNames: unlinked.slice(0, 80).map(p => `${p.catName}: ${p.name}`),
};
return [{ json: { report, writes: DRY ? [] : writes, writeCount: writes.length } }];
