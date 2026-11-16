// "Webhook fine?" Code node of "Static OS - Website changed", every hour: makes sure the website still has its
// "product updated" webhook to this workflow and that it is on. WooCommerce turns a webhook off after several failed
// deliveries in a row (for example while the engine computer is off), so it is switched back on here. If it is missing,
// it is created (this is also how it was first made, 2026-11-16).
const URL = $('Settings').first().json.deliveryUrl;
const list = $input.all().map(i => i.json).filter(w => w && w.id);
const mine = list.find(w => String(w.delivery_url || '') === URL);
const W = 'https://static-eg.com/wp-json/wc/v3/webhooks';
if (!mine) return [{ json: { action: 'create', method: 'POST', url: W, body: { name: 'Static OS - product updated', topic: 'product.updated', delivery_url: URL, status: 'active' } } }];
if (mine.status !== 'active') return [{ json: { action: 'enable', method: 'PUT', url: `${W}/${mine.id}`, body: { status: 'active' } } }];
return [{ json: { action: 'none', id: mine.id } }];
