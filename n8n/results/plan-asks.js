// Post results, step 1: which Meta numbers to ask for.
// Input: the published posts (Firestore runQuery rows) and the last saved results (status/results).
// Posts published in the last DAYS days are asked again; older ones keep the numbers they had.
const DAYS = 60;
const G = 'https://graph.facebook.com/v26.0/';
const dec = v => {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('nullValue' in v) return null;
  if ('mapValue' in v) { const o = {}; const f = (v.mapValue && v.mapValue.fields) || {}; for (const k of Object.keys(f)) o[k] = dec(f[k]); return o; }
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(dec);
  return null;
};
const oldDoc = $('Read last results').first().json;
const old = (oldDoc && oldDoc.fields) ? (dec({ mapValue: { fields: oldDoc.fields } }) || {}) : {};
const oldPosts = (old.posts && typeof old.posts === 'object') ? old.posts : {};
const clean = v => (v === undefined || v === null) ? '' : String(v).trim();
const posts = $('Read published posts').all().map(i => i.json.document).filter(Boolean).map(d => {
  const f = dec({ mapValue: { fields: d.fields || {} } }) || {};
  return { id: d.name.split('/').pop(), fb: clean(f.fbPostId), fbs: clean(f.fbStatus), igs: clean(f.igStatus), when: clean(f.scheduledFor) };
});
const now = Date.now();
const asks = [];
const keep = {};
for (const p of posts) {
  const fbPub = /^published/i.test(p.fbs) && /^\d+_\d+$/.test(p.fb);
  const ig = /^(published|posted)/i.test(p.igs) ? (/\((\d+)\)\s*$/.exec(p.igs) || [])[1] || '' : '';
  if (!fbPub && !ig) continue;
  const at = Date.parse(p.when.replace(' ', 'T') + ':00+02:00');
  const age = Number.isFinite(at) ? (now - at) / 86400000 : 0;
  if (oldPosts[p.id]) keep[p.id] = oldPosts[p.id];
  if (age > DAYS && oldPosts[p.id]) continue;
  if (fbPub) {
    asks.push({ post: p.id, kind: 'fbIns', url: G + p.fb + '/insights?metric=post_total_media_view_unique,post_media_view,post_reactions_by_type_total,post_clicks&period=lifetime' });
    asks.push({ post: p.id, kind: 'fbEng', url: G + p.fb + '?fields=shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)' });
  }
  if (ig) {
    asks.push({ post: p.id, kind: 'igBasic', url: G + ig + '?fields=like_count,comments_count,permalink' });
    asks.push({ post: p.id, kind: 'igIns', url: G + ig + '/insights?metric=reach,saved,shares,views,total_interactions' });
  }
}
// The posts that are no longer published (or were deleted) drop out of the saved results.
return asks.map((a, i) => ({ json: i === 0 ? { ...a, keep } : a }));
