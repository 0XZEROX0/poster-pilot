// "Orders to look up" Code node: every website order read (no doubles), and the app documents to read for them.
const seen = new Map();
for (const it of $input.all()) { const o = it.json; if (o && o.id && o.status && o.status !== 'checkout-draft' && o.status !== 'trash') seen.set(o.id, o); }
const orders = [...seen.values()];
// A full page (100) means more changed orders wait: the next run goes on from the newest one read here, not from now.
if ($input.all().length >= 100) { const sd = $getWorkflowStaticData('global'); const newest = orders.map(o => String(o.date_modified_gmt || '')).sort().pop(); if (newest) sd.pending = `${newest}Z`; }
if (!orders.length) { if (!DRY) { const sd = $getWorkflowStaticData('global'); sd.lastPull = sd.pending; } return []; }
return [{ json: { orders, body: { documents: orders.map(o => `${base}/orders/W${o.id}`) } } }];
