// "Website reads" Code node of "Static OS - Website sync": the fewest website reads for the planned products.
// All simple products in one request (products?include=..., up to 100 ids), and one request per product with
// options for its options (variations). Before 2026-11-16 every product was read on its own.
const plans = $('What to send').all().map(i => i.json);
const out = [];
const simple = [...new Set(plans.filter(p => p.type !== 'variable').map(p => p.id))];
for (let i = 0; i < simple.length; i += 100) {
  const ids = simple.slice(i, i + 100);
  out.push({ json: { parent: null, url: `https://static-eg.com/wp-json/wc/v3/products?include=${ids.join(',')}&per_page=100` } });
}
for (const id of [...new Set(plans.filter(p => p.type === 'variable').map(p => p.id))]) {
  out.push({ json: { parent: id, url: `https://static-eg.com/wp-json/wc/v3/products/${id}/variations?per_page=100` } });
}
return out;
