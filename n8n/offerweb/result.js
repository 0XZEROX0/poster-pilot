// "Result" Code node (runs once for each post) of "Static OS - Offer to website": where the website product stands,
// saved on the post, plus a history line.
// webAdd: 'scheduled' (made, goes live at webAt), 'live', 'waiting' (with why), 'removed' (hidden), 'failed' (webNote).
// webProductId / webLink / webPoster (the poster the product shows) / webLive are kept for the next change.
const PROJECT = 'poster-pilot-8d35e';
const j = $json;
const when = $now.setZone('Africa/Cairo').toFormat('yyyy-MM-dd HH:mm');
const errText = a => {
  const e = a && a.error;
  if (!e) return '';
  const raw = typeof e === 'string' ? e : [e.message, e.description, e.error ? JSON.stringify(e.error) : ''].filter(Boolean).join(' ');
  const m = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)+)"/);
  return (m ? m[1] : raw).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 300);
};
const S = v => ({ stringValue: String(v) });
const fields = {};
const mask = [];
const set = (k, v) => { fields[k] = v; mask.push(k); };
let state = j.state, note = j.note, log = null;
if (j.call) {
  const a = j.answer || {};
  const err = errText(a);
  const ok = !err && a && a.id;
  if (!ok) {
    const gone = /invalid.?id|invalid product|not found|404/i.test(err) && j.productId;
    state = 'failed';
    note = gone ? 'The website product was deleted on the website. Turn the option off and on to add it again.' : 'The website said: ' + (err || 'no answer');
    if (gone) { set('webProductId', { integerValue: '0' }); set('webLive', { booleanValue: false }); set('webPoster', S('')); }
    log = ['website.error', note];
  } else {
    set('webProductId', { integerValue: String(a.id) });
    if (a.permalink) set('webLink', S(a.permalink));
    if (j.kind === 'hide' || a.status === 'draft') {
      state = j.state === 'waiting' ? 'waiting' : 'removed';
      note = state === 'waiting' ? j.note + ' Hidden on the website until then.' : 'Hidden on the website (kept as a draft there).';
      set('webLive', { booleanValue: false });
      log = ['website.hidden', state === 'waiting' ? j.note : ''];
    } else if (a.status === 'future' || (a.status === 'publish' && j.at)) {
      // Sent with the post's future time: WordPress holds it as scheduled (its answer may still say "publish").
      state = 'scheduled';
      note = 'Goes live on the website with the post.';
      set('webLive', { booleanValue: false });
      set('webAt', S(j.at));
      log = ['website.scheduled', j.at];
    } else if (a.status === 'publish') {
      state = 'live';
      note = 'Live on the website.';
      set('webLive', { booleanValue: true });
      set('webAt', S(when));
      log = ['website.live', ''];
    } else {
      state = 'failed';
      note = 'The website saved it as "' + a.status + '".';
      log = ['website.error', note];
    }
    if (j.kind === 'upsert' && j.posterUrl) set('webPoster', S(j.posterUrl));
  }
}
set('webAdd', S(state));
set('webNote', S((note + ' ' + when).trim()));
set('webJob', S(''));
const writes = [{ update: { name: j.name, fields }, updateMask: { fieldPaths: mask } }];
if (log) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let rid = ''; for (let i = 0; i < 20; i++) rid += abc[Math.floor(Math.random() * abc.length)];
  const lf = { postId: S(j.id), by: S('system'), byName: S(''), act: S(log[0]), at: { timestampValue: new Date().toISOString() } };
  if (log[1]) lf.note = S(String(log[1]).slice(0, 1000));
  if (j.title) lf.title = S(j.title.slice(0, 280));
  writes.push({ update: { name: 'projects/' + PROJECT + '/databases/(default)/documents/log/' + rid, fields: lf }, currentDocument: { exists: false } });
}
return { json: { id: j.id, state, note, writes } };
