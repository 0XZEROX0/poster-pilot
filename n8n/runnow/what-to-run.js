// "What to run" Code node of the App engine: which workflows the app asked to start now.
// The app sends run=<keys, comma separated> with its sign-in token; no run means 'app' (carry out post changes).
// Unknown keys are ignored. The scheduler's parts (queue, changes, captions, status, instagram) go to it together.
const SCHED = ['queue', 'changes', 'captions', 'status', 'instagram'];
const KEYS = ['app', 'lists', 'poster', 'move', 'market', 'photos', 'website', 'pull'].concat(SCHED);
const body = $('App nudge').first().json.body || {};
const run = [...new Set(String(body.run || 'app').split(',').map(s => s.trim().toLowerCase()).filter(k => KEYS.includes(k)))];
if (!run.length) run.push('app');
return [{ json: { run, parts: run.filter(k => SCHED.includes(k)) } }];
