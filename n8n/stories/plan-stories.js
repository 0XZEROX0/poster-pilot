// Stories part of "Static OS - Schedule Posters" (Oa5WOuoSdrNquHHe): "Plan Stories" Code node.
// Input: the Posts store rows of queue 'story' (raw). Output: one item per post that needs work now:
//   { id, make, fb, ig, poster, image, photoId, late }
// - make: the 1080x1920 story picture is missing or was made from an older poster -> make it first
//   (never for a picture designed in the story editor).
// - fb / ig: the story's time has come (post time + Story delay, Cairo) and the post itself went out
//   (Facebook scheduled time passed, or Published on Facebook or Instagram) -> publish the story there.
// At most MAX posts per run; Instagram allows 50 API posts a day, so a run never posts more than a few.
const MAX = 4;
const rows = $input.all().map(i => i.json).filter(r => r && r.row_number);
const str = v => (v === undefined || v === null) ? '' : String(v);
const clean = v => str(v).trim();
const done = s => /^(posted|published)/i.test(clean(s));
const failed = s => clean(s) !== '' && !done(s) && !/^waiting/i.test(clean(s));
const fileId = v => { const m = str(v).match(/\/d\/([\w-]+)/) || str(v).match(/[?&]id=([\w-]+)/); return m ? m[1] : ''; };
// Cairo wall-clock "YYYY-MM-DD HH:mm" -> minutes, compared as plain numbers (both sides are Cairo time).
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
const get = t => (parts.find(x => x.type === t) || {}).value || '';
const mins = s => { const m = clean(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : null; };
const now = mins(`${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`);
const out = [];
for (const r of rows) {
  if (out.length >= MAX) break;
  const places = clean(r['Story']).split('+').filter(w => w === 'fb' || w === 'ig');
  const poster = clean(r['Image link']);
  if (!places.length || !fileId(poster)) continue;
  const image = clean(r['Story image']);
  // A picture designed in the app's story editor ('Story from' = 'design') is kept even when the poster changes.
  const designed = /^design/i.test(clean(r['Story from']));
  const make = !fileId(image) || (!designed && clean(r['Story from']) !== poster);
  // When the post goes out: the time Facebook holds, else the person's Post date and time.
  const postAt = mins(r['Scheduled for']) ?? mins(`${clean(r['Post date'])} ${clean(r['Post time'])}`);
  const fbs = clean(r['FB status']), igs = clean(r['IG status']);
  const out1 = done(fbs) || done(igs) || (/^scheduled/i.test(fbs) && postAt !== null && postAt <= now);
  const delay = Math.max(0, Math.min(1440, parseInt(clean(r['Story delay']) || '0', 10) || 0));
  const due = out1 && postAt !== null && postAt + delay <= now;
  const want = w => places.includes(w) && !done(r[w === 'fb' ? 'Story FB status' : 'Story IG status']) && !failed(r[w === 'fb' ? 'Story FB status' : 'Story IG status']);
  const fb = due && want('fb'), ig = due && want('ig');
  if (!make && !fb && !ig) continue;
  out.push({ json: { id: r.row_number, make, fb, ig, poster, posterId: fileId(poster), image, imageId: fileId(image), photoId: clean(r['Story photo id']), late: due && postAt + delay < now - 180 } });
}
return out;
