// "Instagram post" Code node: the Instagram pieces made for each post's photos (one container per photo) become one
// post: a single photo, or a carousel (album) of 2 to 10. A photo that failed stops the post; its error goes on.
const made = $input.all();
const sent = $('Photos to send (Instagram)').all();
const byPost = new Map();
made.forEach((u, n) => {
  const s = sent[n] ? sent[n].json : {};
  const g = byPost.get(s.postId) || { first: n, ids: [], errors: [], count: s.count };
  const id = u.json && u.json.id;
  if (id && !u.json.error) g.ids[s.index] = String(id); else g.errors.push(errText(u.json));
  byPost.set(s.postId, g);
});
const out = [];
for (const [postId, g] of byPost) {
  const p = $('One action each').all().map(i => i.json).find(x => x.id === postId);
  if (!p) continue;
  const ids = g.ids.filter(Boolean);
  const ok = !g.errors.length && ids.length > 0;
  out.push({ json: { postId, ok, error: g.errors[0] || (ids.length ? '' : 'no photo'), album: ok && ids.length > 1, container: ok && ids.length === 1 ? ids[0] : '', body: { media_type: 'CAROUSEL', children: ids.join(','), caption: p.caption } }, pairedItem: { item: g.first } });
}
return out;
function errText(a) {
  const e = a && a.error;
  if (!e) return 'no answer';
  const raw = typeof e === 'string' ? e : [e.message, e.description].filter(Boolean).join(' ');
  const m = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)+)"/);
  return (m ? m[1] : raw).replace(/\s+/g, ' ').slice(0, 200);
}
