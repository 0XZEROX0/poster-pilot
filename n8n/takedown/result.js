// "Result" Code node (runs once for each post): what Facebook and Instagram answered, saved on the post.
// - Facebook: removed, or already gone ("does not exist"), or the error.
// - Instagram: removed, already gone, not posted there (nothing to remove), or the error.
// fbStatus stays 'Published' (the post stays on the Posted page and no other workflow picks it up again); the app
// shows it as removed from takeDown 'done'. IG status says it was removed, or that it was never posted (so the
// Instagram part can never post it after its Facebook post is gone). takeDown ends 'done' or 'failed'.
const PROJECT = 'poster-pilot-8d35e';
const p = $('One post each').item.json;
const fbAns = $('Delete Facebook post').item.json || {};
const igAns = $json.noIg ? null : ($json || {});
const when = $now.setZone('Africa/Cairo').toFormat('yyyy-MM-dd HH:mm');
const errText = a => {
  const e = a && a.error;
  if (!e) return '';
  const raw = typeof e === 'string' ? e : [e.message, e.description, e.error ? JSON.stringify(e.error) : ''].filter(Boolean).join(' ');
  // Facebook's own words, when the answer carries them: "(#10) Application does not have permission for this action".
  const m = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)+)"/);
  return (m ? m[1] : raw).replace(/\s+/g, ' ').slice(0, 300);
};
const gone = t => /does not exist|cannot be loaded|unsupported delete request|nonexisting/i.test(t) && !/permission/i.test(t);
const noRight = t => /\(#10\)|\(#200\)|\(#3\)|permission|not authorized|instagram_manage_contents/i.test(t);
const outcome = (ans, has) => {
  if (!has) return { ok: true, state: 'none' };
  const t = errText(ans);
  if (!t && (ans.success === true || ans.success === 'true')) return { ok: true, state: 'removed' };
  if (!t) return { ok: false, state: 'error', text: 'no answer' };
  if (gone(t)) return { ok: true, state: 'gone' };
  return { ok: false, state: noRight(t) ? 'denied' : 'error', text: t };
};
const fb = outcome(fbAns, !!p.fbPostId);
const ig = outcome(igAns, !!p.igId);
const notes = [];
const logs = [];
if (fb.state === 'removed' || fb.state === 'gone') { notes.push('Facebook: removed'); logs.push(['fb.removed', fb.state === 'gone' ? 'It was already gone' : '']); }
else if (fb.state === 'none') notes.push('Facebook: no post id, nothing removed');
else { notes.push('Facebook: not removed (' + (fb.state === 'denied' ? 'not allowed: ' : '') + fb.text + ')'); logs.push(['takedown.error', 'Facebook: ' + fb.text]); }
let igStatus = null;
if (ig.state === 'removed' || ig.state === 'gone') { notes.push('Instagram: removed'); igStatus = 'Removed from Instagram ' + when + ' (' + p.igId + ')'; logs.push(['ig.removed', ig.state === 'gone' ? 'It was already gone' : '']); }
else if (ig.state === 'none') {
  notes.push('Instagram: it was not posted there');
  // Not on Instagram (yet): make sure the Instagram part never posts it now.
  if (!p.igStatus) igStatus = 'Not posted - removed from Facebook first';
} else {
  notes.push('Instagram: not removed (' + (ig.state === 'denied' ? 'the Meta token is missing the instagram_manage_contents permission: ' : '') + ig.text + ')');
  logs.push(['takedown.error', 'Instagram: ' + ig.text]);
}
const ok = fb.ok && ig.ok;
const fields = {
  takeDown: { stringValue: ok ? 'done' : 'failed' },
  takeDownNote: { stringValue: notes.join('. ') + '. ' + when },
  q: { arrayValue: { values: p.q.filter(x => !['ig', 'status', 'story'].includes(x)).map(x => ({ stringValue: x })) } },
};
const mask = ['takeDown', 'takeDownNote', 'q'];
if (igStatus !== null) { fields.igStatus = { stringValue: igStatus }; mask.push('igStatus'); }
const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const rid = () => { let s = ''; for (let i = 0; i < 20; i++) s += abc[Math.floor(Math.random() * abc.length)]; return s; };
const at = new Date().toISOString();
const writes = [{ update: { name: p.name, fields }, updateMask: { fieldPaths: mask } }];
for (const [act, note] of logs) {
  const lf = { postId: { stringValue: p.id }, by: { stringValue: 'system' }, byName: { stringValue: '' }, act: { stringValue: act }, at: { timestampValue: at } };
  if (note) lf.note = { stringValue: note.slice(0, 1000) };
  if (p.title) lf.title = { stringValue: p.title };
  writes.push({ update: { name: 'projects/' + PROJECT + '/databases/(default)/documents/log/' + rid(), fields: lf }, currentDocument: { exists: false } });
}
return { json: { id: p.id, ok, fb: fb.state, ig: ig.state, note: notes.join('. '), writes } };
