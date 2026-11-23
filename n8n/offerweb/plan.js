// "Plan" Code node of "Static OS - Offer to website".
// Posts with "Also add to the website" that need work:
// - webAdd 'asked': make or update the website product (or wait: no approved poster, no date and time yet)
// - webAdd 'remove': hide the website product again (draft)
// - webAdd 'scheduled' whose time passed (5 min grace): make sure the product is published (WordPress publishes a
//   scheduled product by itself at its time; this is the safety net if its timer was late)
// - webAdd 'working' left by a run that stopped (over 30 minutes): tried again
// Each post is claimed first (webAdd 'working', with the document's updateTime as a precondition), so two runs at the
// same moment never work on the same post. At most 5 posts per run.
const str = v => (v === undefined || v === null) ? '' : String(v);
const clean = v => str(v).trim();
const dec = v => {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) { const o = {}; const f = (v.mapValue && v.mapValue.fields) || {}; for (const k of Object.keys(f)) o[k] = dec(f[k]); return o; }
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(dec);
  return null;
};
const ZONE = 'Africa/Cairo';
const now = Date.now();
const cairo = (date, time) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const d = DateTime.fromFormat(date + ' ' + time.padStart(5, '0'), 'yyyy-MM-dd HH:mm', { zone: ZONE });
  return d.isValid ? d : null;
};
const posts = [];
const writes = [];
for (const j of $input.all().map(i => i.json)) {
  if (!j || !j.document) continue;
  const d = j.document;
  const f = dec({ mapValue: { fields: d.fields || {} } }) || {};
  const id = d.name.split('/').pop();
  const state = clean(f.webAdd);
  const productId = Number(f.webProductId || 0) || 0;
  const live = f.webLive === true;
  let job = null;
  if (state === 'working' && now - Number(f.webTry || 0) < 30 * 60 * 1000) continue;
  if (state === 'scheduled') {
    const at = f.webAt ? DateTime.fromFormat(clean(f.webAt), 'yyyy-MM-dd HH:mm', { zone: ZONE }) : null;
    if (!productId || !at || !at.isValid || at.toMillis() > now - 5 * 60 * 1000) continue;
    job = { kind: 'publish' };
  } else if (state === 'remove' || (state === 'working' && clean(f.webJob) === 'hide')) {
    job = productId ? { kind: 'hide' } : { kind: 'clear', state: 'removed', note: 'Off.' };
  } else if (state === 'asked' || state === 'working') {
    const posterUrl = clean(f.posterUrl);
    const driveId = (posterUrl.match(/\/d\/([\w-]{20,})/) || posterUrl.match(/[?&]id=([\w-]{20,})/) || [])[1] || '';
    const posted = /^published/i.test(clean(f.fbStatus)) || /^(posted|published)/i.test(clean(f.igStatus));
    const approved = clean(f.feedback) === 'Done';
    const wait = note => (productId && !live) ? { kind: 'hide', state: 'waiting', note } : { kind: 'clear', state: 'waiting', note };
    if (clean(f.kind)) job = { kind: 'clear', state: 'failed', note: 'Only offers with a poster go on the website.' };
    else if (!driveId) job = wait('Waits for the poster.');
    else if (!posted && !approved) job = wait('Waits for the poster to be approved.');
    else {
      // When the post goes out: the minute it was published, else its date and time.
      const at = posted ? null : cairo(clean(f.postDate), clean(f.postTime));
      if (!posted && !at) job = wait('Waits for a date and time.');
      else job = { kind: 'upsert', at: at && at.toMillis() > now + 2 * 60 * 1000 ? at.toFormat('yyyy-MM-dd HH:mm') : '', driveId };
    }
  }
  if (!job) continue;
  const items = Array.isArray(f.items) ? f.items : [];
  posts.push(Object.assign({
    id, name: d.name,
    items: items.map(it => ({ name: clean(it && it.name), label: clean(it && it.label) })),
    variants: f.variants === true, title: clean(f.title), company: clean(f.company),
    priceBefore: clean(f.priceBefore), priceAfter: clean(f.priceAfter),
    posterUrl: clean(f.posterUrl), webPoster: clean(f.webPoster), productId, live,
  }, job));
  writes.push({
    update: { name: d.name, fields: { webAdd: { stringValue: 'working' }, webTry: { integerValue: String(now) }, webJob: { stringValue: job.kind } } },
    updateMask: { fieldPaths: ['webAdd', 'webTry', 'webJob'] },
    currentDocument: { updateTime: d.updateTime },
  });
  if (posts.length >= 5) break;
}
return posts.length ? [{ json: { posts, writes } }] : [];
