// "Real order change?" Code node: the website calls this (WooCommerce webhooks "order created" and "order updated").
// Only real orders from static-eg.com go on: the call must carry WooCommerce's signature of its body, made with the
// secret this workflow gave the website webhook ("Sign the call" worked out what it must be). A call without it, or
// with a wrong one, is dropped. The first call WooCommerce makes when a webhook is created is a ping: dropped too.
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
return [{ json: { id: b.id, status: String(b.status || ''), t: Date.now() } }];
