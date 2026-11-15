// "Plan turn" Code node of "Static OS - Run turn" (sub-workflow).
// One run at a time per job (key): the turn is the note status/run_<key> { until, by, at }. It is taken with a check that
// nobody changed the note since it was read, so two runs can never both get it. It lasts `seconds` at most, so a run
// that stops halfway never blocks the next ones for long. If the note cannot be read at all (anything but "not found"),
// the turn is taken anyway, so a database hiccup never stops the work.
const inp = $('When asked').first().json;
const key = String(inp.key || '').replace(/[^A-Za-z0-9_-]/g, '') || 'job';
const DOC = 'projects/poster-pilot-8d35e/databases/(default)/documents/status/run_' + key;
const seconds = Math.max(30, Math.min(3600, Number(inp.seconds) || 300));
const wait = inp.wait === true || inp.wait === 'true';
const j = $input.first().json || {};
const now = Date.now();
const found = !!(j.name && j.updateTime);
const missing = !found && /404|NOT_FOUND|not found/i.test(JSON.stringify(j.error || ''));
const until = found && j.fields && j.fields.until ? Number(j.fields.until.integerValue || j.fields.until.doubleValue || 0) : 0;
if (found && until > now) return [{ json: { go: false, ok: false, turn: 'busy', retry: wait, why: 'busy until ' + new Date(until).toISOString() } }];
const write = { update: { name: DOC, fields: { until: { integerValue: String(now + seconds * 1000) }, by: { stringValue: String(inp.by || '') }, at: { timestampValue: new Date(now).toISOString() } } } };
if (found) write.currentDocument = { updateTime: j.updateTime };
else if (missing) write.currentDocument = { exists: false };
return [{ json: { go: true, wait, body: { writes: [write] } } }];
