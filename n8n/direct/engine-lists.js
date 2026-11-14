// App engine, every 10 minutes: the product list from the app's price list, the style names from
// the Backgrounds folder in Drive, and a heartbeat so the app can show that the engine is alive.
// Only what changed is written. If the price list suddenly has far fewer products (a read problem), it is
// not used.
const PROJECT = 'poster-pilot-8d35e';
const DB = 'projects/' + PROJECT + '/databases/(default)/documents';
// Since 2026-11-14 the price list lives in the app (prices/{category}, edited on the Prices page); the sheet is
// no longer read. The product list the rest of the engine uses (catalog/products) is made from it with the
// sheet's tab names as categories and the "alone" price, exactly as the sheet columns gave them before.
const TAB_OF = { mb: 'MB', cpu: 'CPU', vga: 'VGA', ssd: 'SSD', ram: 'RAM', cooler: 'Cooler', fans: 'Case Fans', psu: 'PSU', monitor: 'Monitor', case: 'Case', acc: 'Acc', laptop: 'Laptop', accfan: 'ACC FAN', paste: 'Thermalpaste' };
const ORDER = Object.keys(TAB_OF);
const cats = (($('Read price list').first().json.documents) || []).map(docOf).filter(d => d.id !== '_meta');
cats.sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));
const products = [];
for (const c of cats) {
  const items = Object.values((c.f.items && typeof c.f.items === 'object') ? c.f.items : {}).filter(it => it && clean(it.name));
  items.sort((a, b) => (Number(a.n) || 1e9) - (Number(b.n) || 1e9));
  for (const it of items) products.push({ category: TAB_OF[c.id] || clean(c.f.name) || c.id, name: clean(it.name), price: (it.alone === null || it.alone === undefined || it.alone === '') ? '' : Number(it.alone).toLocaleString('en-US'), company: clean(it.company) });
}
const priced = products.filter(p => isNum(p.price)).length;
const files = ($('List backgrounds').first().json.files || []);
const styles = [...new Set(files.filter(f => /\.(png|jpe?g|webp)$/i.test(f.name || '')).map(f => clean(f.name).replace(/\.(png|jpe?g|webp)$/i, '')).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const have = {};
for (const j of $('Read lists').all().map(i => i.json)) if (j && j.found) { const d = docOf(j.found); have[d.id] = d.f; }
const oldProducts = (have.products && have.products.items) || [];
const oldStyles = (have.styles && have.styles.names) || [];
const writes = []; const notes = [];
let pricesChanged = false;
if (products.length && products.length >= oldProducts.length * 0.5 && priced >= products.length * 0.6) {
  if (JSON.stringify(products) !== JSON.stringify(oldProducts)) { writes.push({ update: { name: DB + '/catalog/products', fields: fieldsOf({ items: products }) } }); pricesChanged = true; }
} else notes.push('price list skipped: ' + products.length + ' products, ' + priced + ' with a price (had ' + oldProducts.length + ')');
if (styles.length && JSON.stringify(styles) !== JSON.stringify(oldStyles)) writes.push({ update: { name: DB + '/catalog/styles', fields: fieldsOf({ names: styles }) } });
writes.push({ update: { name: DB + '/status/engine', fields: fieldsOf({ lastSync: Date.now(), note: 'App engine: ' + products.length + ' products' }) } });
return [{ json: { writes, pricesChanged, products, notes } }];
