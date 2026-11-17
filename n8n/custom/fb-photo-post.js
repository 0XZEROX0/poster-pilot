// "Facebook photo post" Code node: the hidden photos of each post (uploaded one by one just before) become one Page
// post: one photo, or an album of up to 10. Scheduled, or published at once for Post now. A post with a photo that
// could not be uploaded is not posted; its error goes to the result.
const ups = $input.all();
const sent = $('Photos to send (Facebook)').all();
const byPost = new Map();
ups.forEach((u, n) => {
  const s = sent[n] ? sent[n].json : {};
  const g = byPost.get(s.postId) || { first: n, ids: [], errors: [] };
  const id = u.json && u.json.id;
  if (id && !u.json.error) g.ids[s.index] = String(id); else g.errors.push(errText(u.json));
  byPost.set(s.postId, g);
});
const out = [];
for (const [postId, g] of byPost) {
  const p = $('One action each').all().map(i => i.json).find(x => x.id === postId);
  if (!p) continue;
  const ids = g.ids.filter(Boolean);
  const body = { message: p.caption, attached_media: ids.map(id => ({ media_fbid: id })) };
  if (p.now) body.published = true; else { body.published = false; body.scheduled_publish_time = p.unix; }
  out.push({ json: { postId, ok: !g.errors.length && ids.length > 0, error: g.errors[0] || (ids.length ? '' : 'no photo uploaded'), body, photoIds: ids }, pairedItem: { item: g.first } });
}
return out;
function errText(a) {
  const e = a && a.error;
  if (!e) return 'no answer';
  const raw = typeof e === 'string' ? e : [e.message, e.description].filter(Boolean).join(' ');
  const m = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)+)"/);
  return (m ? m[1] : raw).replace(/\s+/g, ' ').slice(0, 200);
}
