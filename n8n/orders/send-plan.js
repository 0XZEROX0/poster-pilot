// "What to send" Code node: orders whose status (want = the WooCommerce status to send) or details (push) were changed
// in the app. The website's current copies are read first (readUrl), then one WooCommerce batch request sends them all.
// Always returns one item; `send` says whether to send.
const docs = $input.all().map(i => i.json && i.json.document).filter(Boolean).map(d => ({ name: d.name, updateTime: d.updateTime, f: fieldsOf(d) }))
  .filter(d => (d.f.want || d.f.push) && d.f.wooId);
const ids = docs.map(d => d.f.wooId);
const readUrl = `https://static-eg.com/wp-json/wc/v3/orders?per_page=50&include=${ids.join(',')}`;
return [{ json: { send: ids.length > 0 && !DRY, dry: DRY, count: ids.length, readUrl, docs } }];
