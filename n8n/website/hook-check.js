// "Real product change?" Code node of "Static OS - Website changed": the website (WooCommerce webhook
// "product updated") calls this right after a product is saved there. Only a real product from static-eg.com goes on
// (the first call WooCommerce makes when the webhook is created is a ping without a product).
const j = $input.first().json || {};
const h = j.headers || {};
const b = j.body || {};
const from = String(h['x-wc-webhook-source'] || '');
if (!/^https:\/\/(www\.)?static-eg\.com\/?$/i.test(from)) return [];
if (!b.id) return [];
return [{ json: { id: b.id, name: String(b.name || ''), type: String(b.type || ''), at: String(b.date_modified_gmt || ''), t: Date.now() } }];
