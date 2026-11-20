// "Is a member" Code node (Static OS - Health): after the members/{uid} read (only for people not seen in the last hour).
const sd = $getWorkflowStaticData('global');
sd.members = sd.members || {};
const who = $('Known member?').first().json;
let ok = who.known;
if (!ok && $('Read member').isExecuted) {
  const doc = $('Read member').first().json || {};
  ok = !!doc.name && !doc.error;
}
if (ok && who.uid) sd.members[who.uid] = Date.now() + 3600 * 1000;
const body = $('App asks').first().json.body || {};
return [{ json: { ok, uid: who.uid, op: body.op === 'report' ? 'report' : 'get', range: body.range === '7d' ? '7d' : '24h', errors: body.errors || '' } }];
