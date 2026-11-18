// "Real product change?" Code node of "Static OS - Website changed": the website (WooCommerce webhook
// "product updated") calls this right after a product is saved there. Only a real product from static-eg.com goes on:
// the call must carry WooCommerce's signature of its body, made with the secret this workflow gave the website webhook
// ("Sign the call" worked out what it must be). A call without it, or with a wrong one, is dropped. The first call
// WooCommerce makes when the webhook is created is a ping without a product: dropped too.
const it = $input.first() || {};
const j = it.json || {};
const h = j.headers || {};
const from = String(h['x-wc-webhook-source'] || '');
if (!/^https:\/\/(www\.)?static-eg\.com\/?$/i.test(from)) return [];
const sig = String(h['x-wc-webhook-signature'] || '');
if (!sig || !j.sig || sig !== String(j.sig)) return [];
let b = j.body || {};
if (!b.id) { try { b = JSON.parse(Buffer.from(it.binary.data.data, 'base64').toString('utf8')) || {}; } catch (e) { b = {}; } }
if (!b.id) return [];
return [{ json: { id: b.id, name: String(b.name || ''), type: String(b.type || ''), at: String(b.date_modified_gmt || ''), t: Date.now() } }];
