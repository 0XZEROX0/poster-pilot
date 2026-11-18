// "Webhook fine?" Code node of "Static OS - Website changed", every hour: makes sure the website still has its
// "product updated" webhook to this workflow and that it is on. WooCommerce turns a webhook off after several failed
// deliveries in a row (for example while the engine computer is off), so it is switched back on here. If it is missing,
// it is created with the signing secret (Settings.secret, the same as in "Sign the call"). A webhook to an older
// address of this workflow is deleted, so the website stops calling an address that is gone.
const URL = $('Settings').first().json.deliveryUrl;
const SECRET = $('Settings').first().json.secret;
const list = $input.all().map(i => i.json).filter(w => w && w.id);
const mine = list.find(w => String(w.delivery_url || '') === URL);
const W = 'https://static-eg.com/wp-json/wc/v3/webhooks';
const out = [];
if (!mine) out.push({ json: { action: 'create', method: 'POST', url: W, body: { name: 'Static OS - product updated', topic: 'product.updated', delivery_url: URL, secret: SECRET, status: 'active' } } });
else if (mine.status !== 'active') out.push({ json: { action: 'enable', method: 'PUT', url: `${W}/${mine.id}`, body: { status: 'active' } } });
for (const w of list) {
  const u = String(w.delivery_url || '');
  if (u !== URL && /\/webhook\/static-website-changed-[0-9a-f]+$/.test(u)) out.push({ json: { action: 'delete old', method: 'DELETE', url: `${W}/${w.id}?force=true`, body: {} } });
}
if (!out.length) out.push({ json: { action: 'none', id: mine.id } });
return out;
