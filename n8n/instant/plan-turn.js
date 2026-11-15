// Only one poster run at a time may read and claim posts: two runs reading at the same moment could
// both build the same post. The turn is a small note in the database (status/posterRun) that says until
// when a run holds it. It is taken with a check that nobody changed the note since it was read, so two
// runs can never both get it. A run hands it back right after it has marked its posts WORKING (from then
// on WORKING keeps other runs away) and again when it ends. A run that stops halfway holds it 2 minutes at most.
// If the note cannot be read at all (not a "not found"), the run goes ahead and takes the turn anyway,
// so a database hiccup never stops posters from being made.
const DOC = 'projects/poster-pilot-8d35e/databases/(default)/documents/status/posterRun';
const j = $input.first().json || {};
const now = Date.now();
let nudged = false;
try { $('When engine asks').first(); nudged = true; } catch (e) {}
const found = !!(j.name && j.updateTime);
const errText = JSON.stringify(j.error || '');
const missing = !found && /404|NOT_FOUND|not found/i.test(errText);
const until = found && j.fields && j.fields.until ? Number(j.fields.until.integerValue || j.fields.until.doubleValue || 0) : 0;
if (found && until > now) return [{ json: { go: false, nudged, why: 'busy until ' + new Date(until).toISOString() } }];
const write = { update: { name: DOC, fields: { until: { integerValue: String(now + 120000) }, by: { stringValue: String($execution.id) }, at: { timestampValue: new Date(now).toISOString() } } } };
if (found) write.currentDocument = { updateTime: j.updateTime };
else if (missing) write.currentDocument = { exists: false };
return [{ json: { go: true, nudged, body: { writes: [write] } } }];
