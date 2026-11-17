// "Webhooks fine?" Code node, every hour: makes sure static-eg.com has its "order created" and "order updated" webhooks
// to this workflow and that they are on (WooCommerce switches a webhook off after repeated failed deliveries, for
// example while the engine computer is off). Nothing happens while Hook settings.hooks is false.
if ($('Hook settings').first().json.hooks !== true) return [];
const URL = $('Hook settings').first().json.deliveryUrl;
const list = $input.all().map(i => i.json).filter(w => w && w.id);
const W = 'https://static-eg.com/wp-json/wc/v3/webhooks';
const out = [];
for (const topic of ['order.created', 'order.updated']) {
  const mine = list.find(w => String(w.delivery_url || '') === URL && w.topic === topic);
  if (!mine) out.push({ json: { action: 'create', method: 'POST', url: W, body: { name: `Static OS - ${topic.replace('.', ' ')}`, topic, delivery_url: URL, status: 'active' } } });
  else if (mine.status !== 'active') out.push({ json: { action: 'enable', method: 'PUT', url: `${W}/${mine.id}`, body: { status: 'active' } } });
}
return out;
