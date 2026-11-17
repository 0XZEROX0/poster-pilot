// "Build the website update" Code node: one WooCommerce orders/batch body for the orders the app wants sent.
// - want set: the new status.
// - push set (details changed in the app): name, phone, email, address, pickup/delivery and fee, pay method (only when
//   it changed), note, and the
//   items. Lines are matched with the website's current lines (read just before): a kept product line gets the app's
//   quantity and price, a line the app no longer has is removed, a website product the app added is added, and an item
//   that is not a website product (typed by hand) goes on as a fee line with its name. WooCommerce then adds up the total.
// An order the website did not give back is sent without its details (status only) and reported.
const plan = $('What to send').first().json;
const got = new Map();
for (const it of $input.all()) {
  const j = it.json || {};
  for (const o of Array.isArray(j) ? j : [j]) if (o && o.id) got.set(Number(o.id), o);
}
const CODE = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [v.toLowerCase(), k]));
const PAYCODE = { instapay: ['bacs', 'Instapay'], 'e-wallet': ['cheque', 'E-wallet'], cash: ['cod', 'Cash on delivery'] };
const money = n => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const FEE_MARK = ' ×';
function details(f, web) {
  const words = String(f.customer || '').trim().split(/\s+/).filter(Boolean);
  const who = { first_name: words[0] || '', last_name: words.slice(1).join(' '), phone: f.phone || '' };
  const area = String(f.area || '').trim();
  const place = { address_1: f.address || '', address_2: '', city: f.city || '', state: CODE[area.toLowerCase()] || area, country: 'EG' };
  const body = { billing: { ...who, ...place } };
  if (!f.email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) body.billing.email = f.email || '';
  body.shipping = { ...who, ...(f.delivery === 'delivery' ? place : { address_1: '', address_2: '', city: '', state: '' }) };
  body.customer_note = f.customerNote || '';
  const pay = PAYCODE[String(f.payMethod || '').toLowerCase()];
  if (pay && pay[0] !== web.payment_method) { body.payment_method = pay[0]; body.payment_method_title = pay[1]; }
  // Delivery: keep the website's own delivery method when it had one, else a plain flat rate; pickup = local pickup.
  const ship = web.shipping_lines || [];
  const wasDelivery = ship.find(l => l.method_id && l.method_id !== 'local_pickup');
  const line = f.delivery === 'delivery'
    ? { method_id: wasDelivery ? wasDelivery.method_id : 'flat_rate', method_title: wasDelivery ? wasDelivery.method_title : 'Home delivery', total: money(f.shipping) }
    : { method_id: 'local_pickup', method_title: (ship.find(l => l.method_id === 'local_pickup') || {}).method_title || 'Store pickup', total: '0.00' };
  body.shipping_lines = ship.length ? [{ id: ship[0].id, ...line }, ...ship.slice(1).map(l => ({ id: l.id, method_id: null }))] : [line];
  // Items.
  const lines = (web.line_items || []).map(l => ({ ...l, used: false }));
  const items = Array.isArray(f.items) ? f.items : [];
  const out = [], fees = [];
  for (const it of items) {
    const qty = Math.max(1, Math.round(Number(it.qty) || 1)), total = money(it.total);
    const pid = Number(it.pid) || 0, vid = Number(it.vid) || 0;
    const match = lines.find(l => !l.used && (pid ? Number(l.product_id) === pid && Number(l.variation_id || 0) === vid : String(l.name).trim() === String(it.name).trim()));
    if (match) { match.used = true; out.push({ id: match.id, quantity: qty, subtotal: total, total }); }
    else if (pid) out.push({ product_id: pid, ...(vid ? { variation_id: vid } : {}), quantity: qty, subtotal: total, total });
    else fees.push({ name: `${qty > 1 ? qty + FEE_MARK + ' ' : ''}${String(it.name).slice(0, 190)}`, total, tax_status: 'none' });
  }
  for (const l of lines) if (!l.used) out.push({ id: l.id, product_id: null });
  body.line_items = out;
  // Fee lines: the ones the app sent before are replaced; any other website fee stays as it was.
  const oldFees = (web.fee_lines || []).filter(l => (l.meta_data || []).some(m => m && m.key === '_static_os'));
  body.fee_lines = [...oldFees.map(l => ({ id: l.id, name: null })), ...fees.map(x => ({ ...x, meta_data: [{ key: '_static_os', value: '1' }] }))];
  return body;
}
const update = [], missing = [];
for (const d of plan.docs) {
  const one = { id: d.f.wooId };
  if (d.f.want) one.status = d.f.want;
  if (d.f.push) {
    const web = got.get(Number(d.f.wooId));
    if (web) Object.assign(one, details(d.f, web));
    else missing.push(d.f.wooId);
  }
  update.push(one);
}
return [{ json: { body: { update }, missing } }];
