// "Build website changes" Code node. Input: what "Read website product" returned for the requests of "Website reads"
// (simple products together, and the options of each product with options). Picks the option that fits the app
// product's name (colour, Tray/Box...), and builds the change WooCommerce needs. "Group into batches" then sends
// all changes in as few requests as possible.
const plans = $('What to send').all().map(i => i.json);
const reqs = $('Website reads').all().map(i => i.json);
const byId = {}, optionsOf = {}, failed = {};
for (const it of $input.all()) {
  const pi = Array.isArray(it.pairedItem) ? it.pairedItem[0] : it.pairedItem;
  const req = reqs[pi && typeof pi.item === 'number' ? pi.item : 0] || {};
  const j = it.json || {};
  if (j.error || !j.id) { failed[req.parent === null ? 'simple' : req.parent] = String((j.error && j.error.message) || j.message || 'no answer').slice(0, 200); continue; }
  // Every product and option read in this run, by id (ids are unique on the website).
  byId[j.id] = j;
  if (req.parent !== null && req.parent !== undefined) (optionsOf[req.parent] = optionsOf[req.parent] || []).push(j);
}
const decode = s => String(s || '').replace(/&#215;|&times;|×/gi, 'x').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ');
const tok = s => decode(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const DRY = $('Settings').first().json.dryRun !== false;
const out = [];
plans.forEach(p => {
  const rows = p.type === 'variable' ? (optionsOf[p.id] || []).slice() : (byId[p.id] ? [byId[p.id]] : []);
  if (!rows.length && p.type === 'variable' && p.variation && byId[p.variation]) rows.push(byId[p.variation]);
  // A product that cannot be sent skips "Send to website"; its error is still saved.
  const fail = msg => out.push({ json: { ...p, method: '', url: '', body: {}, error: msg } });
  const why = failed[p.type === 'variable' ? p.id : 'simple'];
  if (!rows.length) return fail(why ? 'The website did not answer: ' + why : 'The website product was not found');
  let target = rows[0], url = `https://static-eg.com/wp-json/wc/v3/products/${p.id}`;
  if (p.type === 'variable') {
    const words = new Set(tok(p.name));
    const fits = rows.filter(v => v && v.id && (v.attributes || []).length && (v.attributes || []).every(a => tok(a.option).every(t => words.has(t))));
    // The chosen option; when it is gone from the website (options edited there get new ids), the option that fits the name.
    const picked = p.variation ? (rows.find(v => v.id === p.variation) || (byId[p.variation] && (byId[p.variation].attributes || []).length ? byId[p.variation] : null)) : null;
    const chosen = picked || (fits.length === 1 ? fits[0] : null);
    const names = rows.map(v => (v.attributes || []).map(a => a.option).join(' ')).join(', ').slice(0, 200);
    if (!chosen) return fail(p.variation ? 'The chosen website option is no longer on the website; choose the option again (read ' + rows.map(v => v.id + ' ' + (v.attributes || []).map(a => a.option).join(' ')).join(', ').slice(0, 200) + ')' : fits.length > 1 ? 'More than one option of the website product fits this name' : 'No option of the website product fits this name (' + names + ')');
    target = chosen;
    url = `https://static-eg.com/wp-json/wc/v3/products/${p.id}/variations/${chosen.id}`;
  }
  const body = {};
  if (p.want.price !== null) body.regular_price = String(p.want.price);
  body.sale_price = p.want.sale === null ? '' : String(p.want.sale);
  if (target.manage_stock === true) {
    // The website counts this product's stock; out of stock sets the count to 0, in stock needs a count on the website.
    if (p.want.stock === 'outofstock') body.stock_quantity = 0;
    else if (!(Number(target.stock_quantity) > 0)) return fail('The website counts stock for this product; set how many are in stock on the website');
  } else body.stock_status = p.want.stock;
  // A new name belongs to the product itself; for a product with options that is a second change, to the main product.
  if (p.want.name && p.type !== 'variable') body.name = p.want.name;
  // Settings.dryRun: everything is worked out, but nothing is sent.
  out.push({ json: { ...p, variation: p.type === 'variable' ? target.id : null, option: p.type === 'variable' ? decode((target.attributes || []).map(a => a.option).join(' ')).replace(/\s+/g, ' ').trim() : null, method: DRY ? '' : 'PUT', url, body, dry: DRY, error: '' } });
  if (p.want.name && p.type === 'variable') out.push({ json: { ...p, part: 'name', variation: null, method: DRY ? '' : 'PUT', url: `https://static-eg.com/wp-json/wc/v3/products/${p.id}`, body: { name: p.want.name }, dry: DRY, error: '' } });
});
return out;
