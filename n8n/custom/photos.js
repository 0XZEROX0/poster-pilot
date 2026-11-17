// "Photos to send" Code node: one item per photo of each post in this branch (Facebook photos, or Instagram photos),
// paired with its post, so each photo is downloaded from Drive and uploaded on its own.
const out = [];
$input.all().forEach((i, n) => {
  const p = i.json;
  (p.photos || []).forEach((m, k) => out.push({ json: { postId: p.id, fileId: m.id, index: k, count: p.photos.length }, pairedItem: { item: n } }));
});
return out;
