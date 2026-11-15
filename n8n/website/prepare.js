// "Build website changes" Code node. Input: what "Read website product" returned for each planned product
// (a simple product, or the list of options of a product with options). Picks the option that fits the app
// product's name (colour, Tray/Box...), and builds the change WooCommerce needs.
const plans = $('What to send').all().map(i => i.json);
const got = {};
for (const it of $input.all()) {
  const k = it.pairedItem && typeof it.pairedItem.item === 'number' ? it.pairedItem.item : 0;
  (got[k] = got[k] || []).push(it.json);
}
const decode = s => String(s || '').replace(/&#215;|&times;|×/gi, 'x').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ');
const tok = s => decode(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const DRY = $('Settings').first().json.dryRun !== false;
const out = [];
plans.forEach((p, i) => {
  const rows = (got[i] || []).filter(r => r && !r.error);
  // A product that cannot be sent skips "Send to website"; its error is still saved.
  const fail = msg => out.push({ json: { ...p, method: '', url: '', body: {}, error: msg } });
  if (!rows.length) return fail(((got[i] || [])[0] || {}).error ? 'The website did not answer: ' + String(((got[i] || [])[0].error || {}).message || '').slice(0, 200) : 'The website product was not found');
  let target = rows[0], url = `https://static-eg.com/wp-json/wc/v3/products/${p.id}`;
  if (p.type === 'variable') {
    const words = new Set(tok(p.name));
    const fits = rows.filter(v => v && v.id && (v.attributes || []).length && (v.attributes || []).every(a => tok(a.option).every(t => words.has(t))));
    // The chosen option; when it is gone from the website (options edited there get new ids), the option that fits the name.
    const picked = p.variation ? rows.find(v => v.id === p.variation) : null;
    const chosen = picked || (fits.length === 1 ? fits[0] : null);
    const names = rows.map(v => (v.attributes || []).map(a => a.option).join(' ')).join(', ').slice(0, 200);
    if (!chosen) return fail(p.variation ? 'The chosen website option is no longer on the website; choose the option again (' + names + ')' : fits.length > 1 ? 'More than one option of the website product fits this name' : 'No option of the website product fits this name (' + names + ')');
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
  // Settings.dryRun: everything is worked out, but nothing goes to "Send to website".
  out.push({ json: { ...p, variation: p.type === 'variable' ? target.id : null, option: p.type === 'variable' ? decode((target.attributes || []).map(a => a.option).join(' ')).replace(/\s+/g, ' ').trim() : null, method: DRY ? '' : 'PUT', url, body, dry: DRY, error: '' } });
  if (p.want.name && p.type === 'variable') out.push({ json: { ...p, part: 'name', variation: null, method: DRY ? '' : 'PUT', url: `https://static-eg.com/wp-json/wc/v3/products/${p.id}`, body: { name: p.want.name }, dry: DRY, error: '' } });
});
return out;
