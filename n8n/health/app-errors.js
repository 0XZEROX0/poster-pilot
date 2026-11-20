// "App error lines" Code node (Static OS - Health): errors the app caught on someone's phone or computer
// (a crash, a save that failed). At most 20 per call; the app sends them in groups.
const j = $input.first().json;
let list = j.errors;
if (typeof list === 'string') { try { list = JSON.parse(list); } catch (e) { list = []; } }
if (!Array.isArray(list)) list = [];
const now = Date.now();
const out = list.slice(0, 20).map(e => ({ json: {
  at: Math.min(now, Number(e.at) || now), kind: 'app', title: String(e.where || 'App').slice(0, 80),
  detail: String(e.msg || '').replace(/\s+/g, ' ').slice(0, 400), wf: '', wfId: '', node: String(e.page || '').slice(0, 60),
  exec: '', who: String(j.uid || '').slice(0, 64),
} })).filter(x => x.json.detail && x.json.at > now - 7 * 24 * 3600 * 1000);
return out.length ? out : [{ json: { skip: true } }];
