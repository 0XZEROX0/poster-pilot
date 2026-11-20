// "Build website orders" Code node: one WooCommerce orders/batch "create" for the links this run claimed (the claim's
// batchWrite answer has one status per link, empty = claimed). Each link becomes an On hold order:
// - the customer's name, phone, email, and for delivery the address (governorate -> WooCommerce state code);
// - items linked to a website product (pid, vid) as that product at the link's price; others as fee lines with their name;
// - the discount as a negative fee line; pickup = local pickup at 0, delivery = flat rate with the link's fee;
// - the pickup day and time in the same meta the website's pickup plugin uses; the link's token in _static_link.
// No payment is taken: the shop records payments on the order in the app.
const plan = $('Order links to send').first().json;
const res = $input.first().json || {};
const st = Array.isArray(res.status) ? res.status : [];
const links = plan.docs.filter((d, i) => st[i] && !st[i].code);
const CODE = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [v.toLowerCase(), k]));
const money = n => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const create = links.map(d => {
  const f = d.f, form = f.form || {};
  const words = s(form.name, 120).split(/\s+/).filter(Boolean);
  const who = { first_name: words[0] || '', last_name: words.slice(1).join(' '), phone: s(form.phone, 20) };
  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s(form.email, 120)) ? s(form.email, 120) : '';
  const delivery = f.delivery === 'delivery';
  const area = s(form.area, 80);
  const place = delivery ? { address_1: s(form.address, 300), address_2: '', city: s(form.city, 80), state: CODE[area.toLowerCase()] || area, country: 'EG' } : { country: 'EG' };
  const lines = [], fees = [];
  for (const it of Array.isArray(f.items) ? f.items.slice(0, 30) : []) {
    const qty = Math.max(1, Math.round(Number(it.qty) || 1)), total = money(it.total);
    const pid = Number(it.pid) || 0, vid = Number(it.vid) || 0;
    if (pid) lines.push({ product_id: pid, ...(vid ? { variation_id: vid } : {}), quantity: qty, subtotal: total, total });
    else fees.push({ name: `${qty > 1 ? qty + ' × ' : ''}${s(it.name, 190)}`, total, tax_status: 'none', meta_data: [{ key: '_static_os', value: 'link' }] });
  }
  const discount = Math.max(0, Number(f.discount) || 0);
  if (discount > 0) fees.push({ name: 'Discount', total: money(-discount), tax_status: 'none', meta_data: [{ key: '_static_os', value: 'link' }] });
  const meta = [{ key: '_static_link', value: d.id }];
  if (!delivery && /^\d{4}-\d{2}-\d{2}$/.test(f.date || '')) meta.push({ key: '_pickup_date', value: f.date });
  if (!delivery && /^\d{1,2}:\d{2}$/.test(f.time || '')) meta.push({ key: '_pickup_time', value: f.time });
  return {
    status: 'on-hold', set_paid: false, payment_method: '', payment_method_title: 'Order link',
    billing: { ...who, ...place, email }, shipping: { ...who, ...place },
    customer_note: s(form.note, 500),
    line_items: lines, fee_lines: fees,
    shipping_lines: [delivery ? { method_id: 'flat_rate', method_title: 'Home delivery', total: money(f.shipping) } : { method_id: 'local_pickup', method_title: 'Store pickup', total: '0.00' }],
    meta_data: meta,
  };
});
return [{ json: { go: create.length > 0 && !DRY, body: { create }, links } }];
