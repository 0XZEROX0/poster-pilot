// Post results, step 2: turns Meta's answers into one small document, status/results, that the app reads:
//   { at: ms, need: ['fbIns' | 'fbEng' | 'igIns' ...], posts: { [postId]: { fb: {...}, ig: {...}, igLink, at } } }
// A number Meta did not give this time keeps its last value. `need` lists what the Meta token is not allowed to read.
const asks = $('Plan asks').all().map(i => i.json);
const answers = $input.all();
const posts = JSON.parse(JSON.stringify((asks[0] && asks[0].keep) || {}));
const now = Date.now();
const tried = {}, refused = {}, empty = {};
const num = v => (typeof v === 'number' && Number.isFinite(v)) ? v : (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : undefined);
const valueOf = d => {
  const v = d && Array.isArray(d.values) && d.values.length ? d.values[d.values.length - 1].value : (d && d.total_value ? d.total_value.value : undefined);
  if (v && typeof v === 'object') return Object.values(v).reduce((s, x) => s + (Number(x) || 0), 0);
  return num(v);
};
answers.forEach((it, idx) => {
  const pi = it.pairedItem;
  const a = asks[(pi && typeof pi === 'object' && !Array.isArray(pi) && typeof pi.item === 'number') ? pi.item : idx];
  if (!a) return;
  const j = it.json || {};
  tried[a.kind] = (tried[a.kind] || 0) + 1;
  if (j.error) {
    const msg = String((j.error && j.error.message) || j.error);
    if (/\(#10\)|\(#200\)|permission/i.test(msg)) refused[a.kind] = (refused[a.kind] || 0) + 1;
    return;
  }
  const e = posts[a.post] = posts[a.post] || {};
  const put = (side, vals) => {
    const got = {};
    for (const [k, v] of Object.entries(vals)) if (v !== undefined) got[k] = v;
    if (!Object.keys(got).length) return false;
    e[side] = { ...(e[side] || {}), ...got };
    e.at = now;
    return true;
  };
  if (a.kind === 'fbIns') {
    const m = {}; for (const d of (Array.isArray(j.data) ? j.data : [])) m[d.name] = valueOf(d);
    if (!put('fb', { reach: m.post_total_media_view_unique, views: m.post_media_view, reactions: m.post_reactions_by_type_total, clicks: m.post_clicks })) empty[a.kind] = (empty[a.kind] || 0) + 1;
  } else if (a.kind === 'fbEng') {
    put('fb', { reactions: num(j.reactions && j.reactions.summary && j.reactions.summary.total_count), comments: num(j.comments && j.comments.summary && j.comments.summary.total_count), shares: j.id ? (num(j.shares && j.shares.count) || 0) : undefined });
  } else if (a.kind === 'igBasic') {
    put('ig', { likes: num(j.like_count), comments: num(j.comments_count) });
    if (j.permalink) e.igLink = String(j.permalink);
  } else if (a.kind === 'igIns') {
    const m = {}; for (const d of (Array.isArray(j.data) ? j.data : [])) m[d.name] = valueOf(d);
    if (!put('ig', { reach: m.reach, saved: m.saved, shares: m.shares, views: m.views, interactions: m.total_interactions })) empty[a.kind] = (empty[a.kind] || 0) + 1;
  }
});
// A kind of number is "needed" when Meta refused it, or answered empty for every post (Facebook does that without read_insights).
const need = Object.keys(tried).filter(k => (refused[k] || 0) + (empty[k] || 0) >= tried[k]).sort();
// Keep the document small: at most 600 posts, the newest first.
const ids = Object.keys(posts).sort((x, y) => (posts[y].at || 0) - (posts[x].at || 0)).slice(0, 600);
const out = {}; for (const id of ids) out[id] = posts[id];
const enc = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  const fields = {}; for (const k of Object.keys(v)) fields[k] = enc(v[k]); return { mapValue: { fields } };
};
return [{ json: { body: { fields: enc({ at: now, need, posts: out }).mapValue.fields }, summary: { posts: ids.length, asked: answers.length, tried, refused, empty, need } } }];
