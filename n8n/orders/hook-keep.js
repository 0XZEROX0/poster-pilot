// "Webhooks fine?" Code node, every hour: makes sure static-eg.com has its "order created" and "order updated" webhooks
// to this workflow and that they are on (WooCommerce switches a webhook off after repeated failed deliveries, for
// example while the engine computer is off). Nothing happens while Hook settings.hooks is false.
// A new webhook is made with the signing secret (Hook settings.secret, the same as in "Sign the call"). Webhooks to an
// older address of this workflow are deleted, so the website stops calling an address that is gone.
if ($('Hook settings').first().json.hooks !== true) return [];
const URL = $('Hook settings').first().json.deliveryUrl;
const SECRET = $('Hook settings').first().json.secret;
const list = $input.all().map(i => i.json).filter(w => w && w.id);
const W = 'https://static-eg.com/wp-json/wc/v3/webhooks';
const out = [];
for (const topic of ['order.created', 'order.updated']) {
  const mine = list.find(w => String(w.delivery_url || '') === URL && w.topic === topic);
  if (!mine) out.push({ json: { action: 'create', method: 'POST', url: W, body: { name: `Static OS - ${topic.replace('.', ' ')}`, topic, delivery_url: URL, secret: SECRET, status: 'active' } } });
  else if (mine.status !== 'active') out.push({ json: { action: 'enable', method: 'PUT', url: `${W}/${mine.id}`, body: { status: 'active' } } });
}
for (const w of list) {
  const u = String(w.delivery_url || '');
  if (u !== URL && /\/webhook\/static-website-order-[0-9a-f]+$/.test(u)) out.push({ json: { action: 'delete old', method: 'DELETE', url: `${W}/${w.id}?force=true`, body: {} } });
}
return out;
