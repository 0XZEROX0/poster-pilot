// "Real order change?" Code node: the website calls this (WooCommerce webhooks "order created" and "order updated").
// Only real orders from static-eg.com go on (the first call WooCommerce makes when a webhook is created is a ping).
const j = $input.first().json || {};
const h = j.headers || {};
const b = j.body || {};
const from = String(h['x-wc-webhook-source'] || '');
if (!/^https:\/\/(www\.)?static-eg\.com\/?$/i.test(from)) return [];
if (!b.id) return [];
return [{ json: { id: b.id, status: String(b.status || ''), t: Date.now() } }];
