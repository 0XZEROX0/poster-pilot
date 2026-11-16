// "Add photos" Code node of n8n workflow "Static OS - Website link", right after "Match website products".
// Puts each website product's main photo into web/products (items.<id>.i), for the Builder's part photos.
// The photo comes from the same product list the workflow already reads (field "images"), so the website gets no
// extra requests. The app loads a photo from the website only when it shows on someone's screen.
const out = $input.first().json;
const photo = {};
for (const it of $('Read website products').all()) {
  const p = it.json || {};
  const src = Array.isArray(p.images) && p.images[0] && p.images[0].src;
  if (p.id && typeof src === 'string' && /^https:\/\//.test(src)) photo[String(p.id)] = src;
}
for (const w of out.writes || []) {
  const items = w.update && /\/web\/products$/.test(w.update.name) && w.update.fields.items && w.update.fields.items.mapValue && w.update.fields.items.mapValue.fields;
  if (!items) continue;
  for (const [id, v] of Object.entries(items)) if (photo[id] && v.mapValue && v.mapValue.fields) v.mapValue.fields.i = { stringValue: photo[id] };
}
if (out.report) out.report.withPhoto = Object.keys(photo).length;
return [{ json: out }];
