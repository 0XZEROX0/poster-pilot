// "Group into batches" Code node: all changes worked out by "Build website changes" go to the website in as few
// requests as possible (WooCommerce batch API, up to 100 changes a request): one for products
// (products/batch) and one per product with options for its options (products/{id}/variations/batch).
// Two changes to the same website product or option are joined. When there is nothing to send (dry run, only
// errors), one empty item goes on so "Save results to the app" still runs.
const W = 'https://static-eg.com/wp-json/wc/v3/products';
const groups = {};
for (const c of $input.all().map(i => i.json)) {
  if (c.method !== 'PUT') continue;
  const m = String(c.url).match(/\/products\/(\d+)(?:\/variations\/(\d+))?$/);
  if (!m) continue;
  const url = m[2] ? `${W}/${m[1]}/variations/batch` : `${W}/batch`;
  const id = Number(m[2] || m[1]);
  const g = (groups[url] = groups[url] || {});
  g[id] = { ...(g[id] || {}), ...c.body, id };
}
const out = [];
for (const [url, byId] of Object.entries(groups)) {
  const list = Object.values(byId);
  for (let i = 0; i < list.length; i += 100) out.push({ json: { method: 'POST', url, body: { update: list.slice(i, i + 100) } } });
}
return out.length ? out : [{ json: { method: '', url: '', body: {} } }];
