// "Is a member" Code node (Static OS - Health): after the members/{uid} and roles/{role} reads (only for people not
// seen in the last hour). Any member may send app errors; only the owner and roles with "See system health"
// (health.view) get the report. A role the owner never saved keeps the built-in rights: Admin has everything.
const sd = $getWorkflowStaticData('global');
sd.members = sd.members || {};
const who = $('Known member?').first().json;
let ok = who.known;
let see = who.see;
if (!ok && $('Read member').isExecuted) {
  const doc = $('Read member').first().json || {};
  ok = !!doc.name && !doc.error;
  const role = ((doc.fields || {}).role || {}).stringValue || '';
  let perms = null;
  if ($('Read role').isExecuted) {
    const r = $('Read role').first().json || {};
    if (r.name && !r.error) perms = ((((r.fields || {}).perms || {}).arrayValue || {}).values || []).map(v => v.stringValue);
  }
  see = ok && (role === 'owner' || (perms ? perms.includes('health.view') : role === 'admin'));
}
if (ok && who.uid) sd.members[who.uid] = { until: Date.now() + 3600 * 1000, see: !!see };
const body = $('App asks').first().json.body || {};
const op = body.op === 'report' ? 'report' : 'get';
return [{ json: { ok: !!ok && (op === 'report' || !!see), uid: who.uid, op, range: body.range === '7d' ? '7d' : '24h', errors: body.errors || '' } }];
