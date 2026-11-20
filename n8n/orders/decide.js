// "Decide app changes" Code node. For each website order:
// - not in the app yet: the order is made (status from the website, a "placed" step by Website).
// - in the app: the website part (customer, items, totals, delivery) is brought up to date, unless someone changed
//   the order's details in the app (local: true; the app sends them to the website, see build-send.js). A new website status:
//   - the app is sending this very status (want) -> want is emptied, nothing else;
//   - the app has another status waiting -> the app wins, the next send overwrites the website;
//   - otherwise the app follows the website, with a "website" step in the log (only when the app's status changes).
//   The website's pickup date and time fill the app's date only while the app has none.
// Each write carries the document's updateTime (or must not exist), so nothing the app wrote meanwhile is lost; a refused
// write is simply read again on the next run.
// webPart(o) (the website part of an order) is in common.js, shared with the order links.
// Firestore gives map keys in its own order, so compare with sorted keys.
const stable = v => (Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v);
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const plan = $('Orders to look up').first().json;
const docs = new Map();
for (const it of $input.all()) { const r = it.json || {}; if (r.found) docs.set(r.found.name.split('/').pop(), r.found); }
const writes = [], report = [];
for (const o of plan.orders) {
  const id = `W${o.id}`, name = `${base}/orders/${id}`;
  const w = webPart(o), pDate = meta(o, '_pickup_date').slice(0, 10), pTime = meta(o, '_pickup_time').slice(0, 5);
  const doc = docs.get(id);
  if (!doc) {
    const status = fromWeb(o.status);
    const placedAt = Date.parse(`${o.date_created_gmt || o.date_created}Z`) || Date.now();
    const f = { ...w, webStatus: o.status, want: '', status, closed: !OPEN.includes(status), agreed: null, date: /^\d{4}-\d{2}-\d{2}$/.test(pDate) ? pDate : '', time: /^\d{1,2}:\d{2}$/.test(pTime) ? pTime : '', webError: '',
      steps: [{ at: placedAt, by: 'website', byName: 'Website', kind: 'placed', note: `${w.delivery === 'pickup' ? 'Store pickup' : 'Home delivery'} · ${w.payMethod}` }] };
    const fields = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, ev(v)]));
    fields.placedAt = { timestampValue: new Date(placedAt).toISOString() };
    fields.updatedAt = { timestampValue: NOW };
    writes.push({ update: { name, fields }, currentDocument: { exists: false } });
    report.push(`#${w.number} new (${o.status})`);
    continue;
  }
  const f = fieldsOf(doc), set = {};
  // Details changed in the app (local) stay as the app has them; only the status still follows the website.
  if (!f.local) for (const k of Object.keys(w)) if (!same(f[k], w[k])) set[k] = w[k];
  if (o.status !== f.webStatus) {
    set.webStatus = o.status;
    if (f.want) {
      if (f.want === o.status) { set.want = ''; set.webError = ''; }
    } else {
      const status = fromWeb(o.status);
      if (status !== f.status) {
        set.status = status;
        set.closed = !OPEN.includes(status);
        set.steps = [...(f.steps || []), { at: Date.now(), by: 'website', byName: 'Website', kind: 'website', note: '', web: o.status }];
      }
    }
  }
  if (!f.date && /^\d{4}-\d{2}-\d{2}$/.test(pDate)) { set.date = pDate; set.time = /^\d{1,2}:\d{2}$/.test(pTime) ? pTime : ''; }
  const keys = Object.keys(set);
  if (!keys.length) continue;
  const fields = Object.fromEntries(keys.map(k => [k, ev(set[k])]));
  fields.updatedAt = { timestampValue: NOW };
  writes.push({ update: { name, fields }, updateMask: { fieldPaths: [...keys, 'updatedAt'] }, currentDocument: { updateTime: doc.updateTime } });
  report.push(`#${w.number} ${keys.join(', ')}`);
}
if (!writes.length && !DRY) { const sd = $getWorkflowStaticData('global'); sd.lastPull = sd.pending; }
return [{ json: { save: writes.length > 0 && !DRY, dry: DRY, writes, report } }];
