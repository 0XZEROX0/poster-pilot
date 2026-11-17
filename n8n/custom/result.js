// resultOf(STEP, p, a): what Facebook or Instagram answered (a) for one post's step (p, from "One action each"), as the
// changes to save on it. Each branch ends in a small "Result (...)" node that names its STEP:
//   fb        the post was scheduled (or published at once) on Facebook       (answer: the Page post or video)
//   fbCheck   is the scheduled Facebook post out yet                           (answer: is_published / published)
//   drop      a cancel or a change took it off Facebook's schedule             (answer: the delete, or nothing)
//   note      nothing was sent; the plan's own note
//   igMade    Instagram is getting the post ready (container made)            (answer: the container, or an error)
//   igWait    Instagram's container is not ready yet                            (answer: status_code)
//   igDone    Instagram published it                                           (answer: the media id)
function resultOf(STEP, p, a) {
  a = a || {};
  const ZONE = 'Africa/Cairo';
  const minute = () => DateTime.now().setZone(ZONE).toFormat('yyyy-MM-dd HH:mm');
  const errText = x => {
    if (x && x.ok === false && x.error) return String(x.error).slice(0, 220);
    const e = x && x.error;
    if (!e) return '';
    const raw = typeof e === 'string' ? e : [e.message, e.description, e.error ? JSON.stringify(e.error) : ''].filter(Boolean).join(' ');
    const m = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)+)"/);
    return (m ? m[1] : raw).replace(/\s+/g, ' ').slice(0, 220) || 'no answer';
  };
  const gone = t => /does not exist|cannot be loaded|unsupported (get|delete) request|nonexisting/i.test(t) && !/permission/i.test(t);
  const patch = {};
  const err = errText(a);
  const ex = (p.f.ex && typeof p.f.ex === 'object') ? p.f.ex : {};
  const igPub = /^(published|posted)/i.test(String(p.f.igStatus || '').trim());
  const fbPub = /^(published|posted)/i.test(String(p.f.fbStatus || '').trim());

  if (STEP === 'fb') {
    const id = String(a.id || a.post_id || '');
    if (err || !id) patch.fbStatus = 'Facebook error: ' + (err || 'Facebook gave no post id');
    else {
      patch.fbPostId = id;
      patch.fbStatus = p.now ? 'Published' : 'Scheduled';
      patch.scheduledFor = p.local;
      patch['ex.key'] = p.key;
      if (p.now) { patch.postNow = ''; patch.postDate = p.local.slice(0, 10); patch.postTime = p.local.slice(11); patch['ex.key'] = ''; }
    }
  }
  if (STEP === 'fbCheck') {
    if (err && gone(err)) { patch.fbStatus = 'Facebook error: the post is no longer on Facebook'; patch.fbPostId = ''; patch.scheduledFor = ''; }
    else if (!err && (a.is_published === true || a.published === true)) patch.fbStatus = 'Published';
  }
  if (STEP === 'drop') {
    const failedDelete = p.del && err && !gone(err);
    if (failedDelete) patch.fbStatus = 'Facebook error: could not take it off the schedule: ' + err;
    else {
      if (!fbPub) { patch.fbPostId = ''; patch.scheduledFor = ''; patch.fbStatus = p.action === 'cancel' && p.del ? 'Cancelled' : ''; }
      patch['ex.key'] = '';
      if (p.action === 'cancel') {
        patch.feedback = 'Done'; patch.postDate = ''; patch.postTime = ''; patch.postNow = '';
        if (!igPub && ex.igContainer) { patch['ex.igContainer'] = ''; patch.igStatus = ''; }
      }
    }
  }
  if (STEP === 'note') Object.assign(patch, p.patch || {});
  if (STEP === 'igMade') {
    const id = String(a.container || a.id || '');
    if (err || !id) patch.igStatus = 'Instagram error: ' + (err || 'Instagram gave no id');
    else { patch['ex.igContainer'] = id; patch['ex.igMadeAt'] = String(Date.now()); patch.igStatus = 'Posting - Instagram is getting it ready'; }
  }
  if (STEP === 'igWait') {
    const code = String(a.status_code || '');
    const old = Date.now() - (Number(p.madeAt) || 0) > 60 * 60 * 1000;
    if (code === 'ERROR' || code === 'EXPIRED') { patch.igStatus = 'Instagram error: Instagram could not use this ' + (p.kind === 'video' ? 'video' : 'photo') + (a.status ? ' (' + String(a.status).slice(0, 160) + ')' : '') ; patch['ex.igContainer'] = ''; }
    else if (old) { patch.igStatus = 'Instagram error: Instagram was not ready after an hour' + (err ? ' (' + err + ')' : ''); patch['ex.igContainer'] = ''; }
  }
  if (STEP === 'igDone') {
    const id = String(a.id || '');
    if (err || !id) patch.igStatus = 'Instagram error: ' + (err || 'Instagram gave no id');
    else { patch.igStatus = 'Published ' + minute() + ' (' + id + ')'; patch.postNow = ''; }
    patch['ex.igContainer'] = '';
  }
  return patch;
}
