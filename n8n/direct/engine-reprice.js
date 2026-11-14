// When product prices changed: Price before and Company of every post that is not published yet are
// worked out again, the way the sheet's formulas did. The scheduler then notices a changed price, as before.
const plan = $('Plan lists').first().json;
const products = plan.products || [];
const writes = [...plan.writes];
for (const j of $('Read open posts').all().map(i => i.json)) {
  if (!j || !j.document) continue;
  const d = docOf(j.document);
  if (d.f.appNew === true || d.f.appDeleted === true) continue;
  const p = pricesFrom(d.f.items, products);
  if (p.priceBefore === clean(d.f.priceBefore) && p.company === clean(d.f.company)) continue;
  writes.push({ update: { name: d.name, fields: fieldsOf(p) }, updateMask: { fieldPaths: ['priceBefore', 'company'] }, currentDocument: { updateTime: d.updateTime } });
}
return [{ json: { writes } }];
