// App engine, every 10 minutes: the product list from the "Price List Hardware" sheet, the style names from
// the Backgrounds folder in Drive, and a heartbeat so the app can show that the engine is alive.
// Only what changed is written. If the price list suddenly has far fewer products (a read problem), it is
// not used.
const PROJECT = 'poster-pilot-8d35e';
const DB = 'projects/' + PROJECT + '/databases/(default)/documents';
const CATS = $('Settings').first().json.categories.split(',').map(s => s.trim()).filter(Boolean);
const vr = $('Read price list').first().json.valueRanges || [];
const products = [];
CATS.forEach((category, k) => {
  for (const row of ((vr[k] && vr[k].values) || [])) {
    const name = clean(row[0]);
    if (name && !/^(#|Loading)/.test(name)) products.push({ category, name, price: clean(row[2]), company: clean(row[4]) });
  }
});
const files = ($('List backgrounds').first().json.files || []);
const styles = [...new Set(files.filter(f => /\.(png|jpe?g|webp)$/i.test(f.name || '')).map(f => clean(f.name).replace(/\.(png|jpe?g|webp)$/i, '')).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const have = {};
for (const j of $('Read lists').all().map(i => i.json)) if (j && j.found) { const d = docOf(j.found); have[d.id] = d.f; }
const oldProducts = (have.products && have.products.items) || [];
const oldStyles = (have.styles && have.styles.names) || [];
const writes = []; const notes = [];
let pricesChanged = false;
if (products.length && products.length >= oldProducts.length * 0.5) {
  if (JSON.stringify(products) !== JSON.stringify(oldProducts)) { writes.push({ update: { name: DB + '/catalog/products', fields: fieldsOf({ items: products }) } }); pricesChanged = true; }
} else notes.push('price list skipped: ' + products.length + ' products (had ' + oldProducts.length + ')');
if (styles.length && JSON.stringify(styles) !== JSON.stringify(oldStyles)) writes.push({ update: { name: DB + '/catalog/styles', fields: fieldsOf({ names: styles }) } });
writes.push({ update: { name: DB + '/status/engine', fields: fieldsOf({ lastSync: Date.now(), note: 'App engine: ' + products.length + ' products' }) } });
return [{ json: { writes, pricesChanged, products, notes } }];
