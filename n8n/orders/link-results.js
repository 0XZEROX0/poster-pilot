// "Save link orders" Code node: what the website answered for each link. A made order:
// - the link becomes 'done' with the website order's id and number (the customer page then shows the number);
// - the app order orders/W<id> is written at once (like a new website order, with the link, who made it, the sales rep,
//   category, day and time), so it is in Orders without waiting for the website's webhook. If the webhook was quicker,
//   the second write only adds the link's fields to the order it made;
// - one line in the activity log.
// A refused one (or no answer at all) becomes 'error' with the reason; someone sends it again from Orders.
const built = $('Build website orders').first().json;
const res = $input.first().json || {};
const answers = Array.isArray(res.create) ? res.create : [];
const writes = [], report = [];
built.links.forEach((d, i) => {
  const f = d.f, a = answers[i];
  const ok = a && a.id && !a.error;
  if (!ok) {
    const err = !answers.length ? `No answer from the website${res.message ? ': ' + String(res.message).slice(0, 200) : ''}. Check the website before sending again.` : String((a && a.error && (a.error.message || a.error.code)) || 'Refused').slice(0, 300);
    writes.push({ update: { name: d.name, fields: { state: ev('error'), webError: ev(err) } }, updateMask: { fieldPaths: ['state', 'webError'] } });
    writes.push({ update: { name: `${base}/activity/${rid()}`, fields: { app: ev('orders'), act: ev('order.link_error'), what: ev(`Order link by ${f.byName || '?'}`), note: ev(err), ref: ev(d.id), by: ev('website'), byName: ev('Website'), at: { timestampValue: NOW } } }, currentDocument: { exists: false } });
    report.push(`${d.id.slice(0, 6)}… refused: ${err}`);
    return;
  }
  const w = webPart(a);
  const number = String(a.number || a.id);
  writes.push({ update: { name: d.name, fields: { state: ev('done'), wooId: ev(Number(a.id)), number: ev(number), webError: ev(''), doneAt: { timestampValue: NOW } } }, updateMask: { fieldPaths: ['state', 'wooId', 'number', 'webError', 'doneAt'] } });
  const tags = { link: d.id, linkByName: String(f.byName || '').slice(0, 200), rep: String(f.rep || '').slice(0, 80), category: String(f.category || '').slice(0, 80), date: /^\d{4}-\d{2}-\d{2}$/.test(f.date || '') ? f.date : '', time: /^\d{1,2}:\d{2}$/.test(f.time || '') ? f.time : '' };
  const status = fromWeb(a.status);
  const placedAt = Date.parse(`${a.date_created_gmt || ''}Z`) || Date.now();
  const order = { ...w, ...tags, webStatus: String(a.status || 'on-hold'), want: '', status, closed: !OPEN.includes(status), agreed: null, webError: '',
    steps: [{ at: placedAt, by: String(f.by || 'website'), byName: String(f.byName || 'Order link'), kind: 'placed', note: `Order link · ${w.delivery === 'pickup' ? 'Store pickup' : 'Home delivery'}` }] };
  const fields = Object.fromEntries(Object.entries(order).map(([k, v]) => [k, ev(v)]));
  fields.placedAt = { timestampValue: new Date(placedAt).toISOString() };
  fields.updatedAt = { timestampValue: NOW };
  const name = `${base}/orders/W${a.id}`;
  writes.push({ update: { name, fields }, currentDocument: { exists: false } });
  writes.push({ update: { name, fields: Object.fromEntries(Object.entries(tags).map(([k, v]) => [k, ev(v)])) }, updateMask: { fieldPaths: Object.keys(tags) }, currentDocument: { exists: true } });
  writes.push({ update: { name: `${base}/activity/${rid()}`, fields: { app: ev('orders'), act: ev('order.link_done'), what: ev(`Order #${number}`), note: ev(`${w.customer} · ${w.webTotal} EGP · link by ${f.byName || '?'}`), ref: ev(`W${a.id}`), by: ev('website'), byName: ev('Website'), at: { timestampValue: NOW } } }, currentDocument: { exists: false } });
  report.push(`#${number} from link by ${f.byName || '?'}`);
});
return [{ json: { writes, report } }];
