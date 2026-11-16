// "Newest change?" Code node of "Static OS - Website changed". One save on the website can send several calls (and our
// own sends to the website send them too), and every "Website to app" run reads the website about 20 times. Too many
// reads in a short time made the website's host block the engine computer (2026-11-16 17:28 Cairo 19:28). So each call
// waits 30 s, and only the newest call of a burst starts "Website to app"; at most one start per burst.
const t = $('Real product change?').first().json.t;
const row = $input.all().map(i => i.json).find(r => r && r.key === 'pull') || {};
if (Number(row.lastHook || 0) > t) return []; // a newer call came in; that one starts it
if (Number(row.lastStart || 0) > t) return []; // already started after this call
return [{ json: { t } }];
