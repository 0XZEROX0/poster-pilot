// "Plan" Code node of "Static OS - Text, photo and video posts". lib.js is pasted above this code.
// Reads the posts in the 'custom' queue (text, photo and video posts made in the app) and picks, for each post, the one
// next step to take on Facebook or Instagram. One step per post per run; the workflow runs again 30 seconds later
// while there was work (up to 6 rounds), so Facebook, then Instagram, then Instagram's "ready" check follow quickly.
//   cancel   Cancel pressed: delete the Facebook post if it is on the schedule, empty the time, keep it approved.
//   reset    On Facebook's schedule but changed (caption, photos, video, places, time) or no longer approved:
//            delete it from the schedule; the next run schedules it again.
//   fb       Schedule it on Facebook (or publish at once for Post now): text, photos or video.
//   ig       Its time came: make the Instagram post (photo, album or reel). Instagram cannot hold a post on a schedule.
//   igCheck  Instagram is getting the post ready: publish it when it is.
//   fbCheck  The Facebook time passed: check that Facebook published it.
//   note     Nothing to send: a time that is too soon / too far, or a Post now that is too old.
const ZONE = 'Africa/Cairo';
const POST_NOW_HOURS = 2;
const IG_LATE_HOURS = 12;
const MAX = 6;
const now = DateTime.now().setZone(ZONE);
const fileId = v => (/^[\w-]{20,80}$/.test(clean(v)) ? clean(v) : '');
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
const whenOf = f => {
  const d = clean(f.postDate), t = clean(f.postTime);
  if (!d || !t) return null;
  const x = DateTime.fromFormat(d + ' ' + t, 'yyyy-MM-dd HH:mm', { zone: ZONE });
  return x.isValid ? x : null;
};
const titleFor = f => {
  const words = { text: 'Text post', image: 'Photo post', video: 'Video post' }[kindOf(f)];
  const first = clean(f.caption).split('\n').map(clean).find(Boolean) || '';
  return (words + (first ? ': ' + first : '')).slice(0, 280);
};

const actions = [];
for (const j of $input.all().map(i => i.json)) {
  if (!j || !j.document || actions.length >= MAX) continue;
  const d = docOf(j.document);
  const f = d.f;
  const kind = kindOf(f);
  if (!kind || f.appDeleted === true || f.appNew === true || clean(f.takeDown)) continue;
  const ex = (f.ex && typeof f.ex === 'object') ? f.ex : {};
  const places = placesOf(f);
  const media = (Array.isArray(f.media) ? f.media : []).filter(m => m && fileId(m.id)).map(m => ({ id: fileId(m.id), type: m.type === 'video' ? 'video' : 'image' }));
  const photos = media.filter(m => m.type === 'image').slice(0, 10);
  const video = media.find(m => m.type === 'video') || null;
  const caption = str(f.caption).slice(0, 63000);
  const fbPub = isPub(f.fbStatus), igPub = isPub(f.igStatus);
  const fbId = clean(f.fbPostId);
  const approved = low(f.feedback) === 'done';
  const when = whenOf(f);
  const pressed = low(f.postNow) === 'yes';
  const nowFresh = pressed && when && when >= now.minus({ hours: POST_NOW_HOURS }) && when <= now.plus({ minutes: 5 });
  // What Facebook was given: a change to any of these takes the post off the schedule, and it is scheduled again.
  const key = hash(JSON.stringify([kind, caption, media.map(m => m.id), places, clean(f.postDate), clean(f.postTime)]));
  const base = { id: d.id, name: d.name, f, kind, places, caption, title: titleFor(f), key, photos, video, fbId, nowFresh: !!nowFresh };
  const add = (action, extra) => actions.push({ json: Object.assign({}, base, { action }, extra || {}) });

  if (low(f.feedback) === 'cancel') { add('cancel', { del: fbId && !fbPub ? fbId : '' }); continue; }
  if (fbId && !fbPub && (!approved || !places.includes('fb') || clean(ex.key) !== key)) { add('reset', { del: fbId }); continue; }
  if (!approved) continue;
  if (pressed && !nowFresh && !fbId && !igPub && !clean(ex.igContainer)) {
    add('note', { patch: { postNow: '', fbStatus: places.includes('fb') ? 'Facebook error: Post now was not done within 2 hours. Press Post now again.' : clean(f.fbStatus), igStatus: places.includes('ig') ? 'Instagram error: Post now was not done within 2 hours. Press Post now again.' : clean(f.igStatus) } });
    continue;
  }
  const wantFb = places.includes('fb') && !fbId && !fbPub && !isFail(f.fbStatus) && (nowFresh || when);
  if (wantFb) {
    if (kind === 'text' && !clean(caption)) { add('note', { patch: { fbStatus: 'Facebook error: a text post needs its text. Write it and save.' } }); continue; }
    if (kind === 'image' && !photos.length) { add('note', { patch: { fbStatus: 'Facebook error: no photo was uploaded. Add a photo and save.' } }); continue; }
    if (kind === 'video' && !video) { add('note', { patch: { fbStatus: 'Facebook error: no video was uploaded. Add the video and save.' } }); continue; }
    if (!nowFresh && when < now.plus({ minutes: 15 })) { add('note', { patch: { fbStatus: 'Facebook error: the time must be at least 15 minutes from now. Pick a later time.' } }); continue; }
    if (!nowFresh && when > now.plus({ days: 74 })) { add('note', { patch: { fbStatus: 'Facebook error: Facebook schedules at most 75 days ahead. Pick an earlier date.' } }); continue; }
    const at = nowFresh ? now : when;
    add('fb', { now: !!nowFresh, unix: Math.floor(at.toMillis() / 1000), local: at.toFormat('yyyy-MM-dd HH:mm') });
    continue;
  }
  const wantIg = places.includes('ig') && !igPub && !isFail(f.igStatus);
  if (wantIg && clean(ex.igContainer)) { add('igCheck', { container: clean(ex.igContainer), madeAt: Number(ex.igMadeAt) || 0 }); continue; }
  if (wantIg && (nowFresh || (when && when <= now))) {
    if (!nowFresh && when < now.minus({ hours: IG_LATE_HOURS })) { add('note', { patch: { igStatus: 'Instagram error: its time passed more than 12 hours ago (the workflows were off). Set a new time.' } }); continue; }
    if (kind === 'image' && !photos.length) { add('note', { patch: { igStatus: 'Instagram error: no photo was uploaded.' } }); continue; }
    if (kind === 'video' && !video) { add('note', { patch: { igStatus: 'Instagram error: no video was uploaded.' } }); continue; }
    add(kind === 'video' ? 'igVideo' : 'igPhotos');
    continue;
  }
  const fbAt = DateTime.fromFormat(clean(f.scheduledFor), 'yyyy-MM-dd HH:mm', { zone: ZONE });
  if (fbId && !fbPub && /^scheduled/i.test(clean(f.fbStatus)) && (!fbAt.isValid || fbAt <= now.minus({ minutes: 1 }))) { add('fbCheck'); continue; }
}
return actions;
