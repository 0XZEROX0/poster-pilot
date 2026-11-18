// "What needs fixing" Code node (Static OS - Self-heal, every 15 minutes).
// Checks what broke before and fixes what is safe to fix; anything a person must do goes to the app's Activity page,
// once when it starts and once when it is fixed (no WhatsApp or other outside alerts, by the owner's choice).
//  1. Website order alerts stalled: the newest website order changed more than 15 min ago but no order alert reached
//     n8n after it. Fix: kick the website's background queue (WP-Cron) every run. If still stalled after 45 min, tell
//     the app (orders still arrive through the hourly read).
//  2. Facebook/Instagram token: a cheap /me call. If it fails, tell the app (only a person can make a new token).
const sd = $getWorkflowStaticData('global');
sd.open = sd.open || {};
const now = Date.now();
const MIN = 60 * 1000;
const cairo = t => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
const lines = [];
const problem = (key, what, note) => { if (!sd.open[key]) { sd.open[key] = now; lines.push({ act: 'health.problem', what, note }); } };
const fixed = (key, what, note) => { if (sd.open[key]) { delete sd.open[key]; lines.push({ act: 'health.fixed', what, note }); } };
const first = name => { try { return $(name).first().json || {}; } catch (e) { return {}; } };

// 1. Website order alerts
let kickCron = false;
const order = first('Read newest website order');
const timing = first('Read hook timing');
const modified = order.date_modified_gmt ? Date.parse(order.date_modified_gmt + 'Z') : 0;
const lastHook = Number(timing.lastHook || 0);
const stalled = modified > 0 && now - modified > 15 * MIN && modified > lastHook + MIN;
if (stalled) {
  kickCron = true;
  sd.stallSince = sd.stallSince || modified;
  if (now - sd.stallSince > 45 * MIN) problem('webhooks', 'Website order alerts are stuck',
    `No order alert has reached n8n since ${cairo(lastHook || sd.stallSince)}. Orders still come into the app every hour at :40. ` +
    'On the website, open WooCommerce > Status > Scheduled Actions > In-progress and cancel the job that has been running for a long time.');
} else if (modified > 0) {
  if (sd.stallSince) fixed('webhooks', 'Website order alerts work again', 'Orders reach the app within a minute again.');
  sd.stallSince = 0;
}

// 2. Facebook / Instagram token
const me = first('Check Facebook token');
if (me.id) fixed('meta', 'Facebook and Instagram token works again', '');
else if (me.error) {
  const msg = String((me.error.message || me.error.description || JSON.stringify(me.error))).slice(0, 200);
  // A network blip is not a token problem: only count real Facebook answers about the token.
  if (!/timeout|ECONN|ENOTFOUND|socket|network|aborted/i.test(msg)) problem('meta', 'Facebook and Instagram token stopped working',
    `Posting and scheduling will fail until a new token is pasted into n8n's "Meta Page Token". Facebook said: ${msg}`);
}

const base = `projects/${$('Settings').first().json.projectId}/databases/(default)/documents`;
const ev = v => ({ stringValue: String(v) });
const rid = () => 'H' + now.toString(36) + Math.random().toString(36).slice(2, 8);
const writes = lines.map(l => ({ update: { name: `${base}/activity/${rid()}`, fields: { app: ev('engine'), act: ev(l.act), what: ev(l.what), ...(l.note ? { note: ev(l.note) } : {}), by: ev('system'), byName: ev('System'), at: { timestampValue: new Date(now).toISOString() } } }, currentDocument: { exists: false } }));
return [{ json: { kickCron, writes, count: writes.length, open: Object.keys(sd.open) } }];
