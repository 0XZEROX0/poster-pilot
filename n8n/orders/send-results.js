// "Save what the website answered" Code node: for each order sent, the website's answer goes back into the app
// (webStatus, want and push emptied, or webError), only if the order did not change in the app meanwhile (updateTime). Plus one
// line per order in the app's activity log, by "Website". Non-atomic batchWrite: one refused write does not stop the rest.
const plan = $('What to send').first().json;
const missing = $('Build the website update').first().json.missing || [];
const res = $input.first().json || {};
const answers = Array.isArray(res.update) ? res.update : [];
const failedAll = !answers.length;
const writes = [];
for (const d of plan.docs) {
  const a = answers.find(x => x && Number(x.id) === Number(d.f.wooId));
  if (!a && failedAll) continue; // the request itself failed: try again next run
  const lost = d.f.push && missing.includes(d.f.wooId);
  const err = !a ? 'No answer from the website' : a.error ? String(a.error.message || a.error.code || 'Refused').slice(0, 300) : lost ? 'The website did not give this order back, the changes were not sent' : '';
  const fields = err ? { want: '', push: false, webError: err } : { webStatus: String(a.status || d.f.want), want: '', push: false, webError: '' };
  const what = [d.f.want ? `Order status: ${WEB_LABEL[d.f.want] || d.f.want}` : '', d.f.push ? 'Order details and items' : ''].filter(Boolean).join(' · ');
  writes.push({ update: { name: d.name, fields: Object.fromEntries(Object.entries({ ...fields }).map(([k, v]) => [k, ev(v)])) }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: d.updateTime } });
  writes.push({ update: { name: `${base}/activity/${rid()}`, fields: { app: ev('website'), act: ev(err ? 'website.error' : 'website.sent'), what: ev(`Order #${d.f.number || d.f.wooId}`), note: ev(err ? `${err} (${what})` : what), ref: ev(d.name.split('/').pop()), by: ev('website'), byName: ev('Website'), at: { timestampValue: NOW } } }, currentDocument: { exists: false } });
}
return [{ json: { writes, count: writes.length / 2 } }];
