// "Plan the merge" Code node of n8n workflow "Static OS - Merge Box/Tray pages" (run by hand).
// Settings.groups lists website CPU pages that are the same CPU as Box and Tray, one group per ";" ("3811,12151; ...").
// For each group: the page with the most sales is kept, renamed without Box/Tray and turned into a product with
// options (attribute "Option": Box, Tray). Each option gets the price, sale, stock and main photo of its old page (the
// in-stock page when two pages are the same option). The other pages become drafts (never deleted).
// Settings.renames ("id=New name; ...") renames pages that already have options (the 7600X).
// Settings.dryRun = true reads and plans only.
const S = $('Settings').first().json;
const pages = {};
for (const it of $('Read pages').all()) if (it.json && it.json.id) pages[it.json.id] = it.json;
const decode = s => String(s || '').replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, '-').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ');
const baseName = n => decode(n).replace(/\(\s*(box|tray)\s*\)/ig, ' ').replace(/\b(box|tray)\b/ig, ' ').replace(/\s+/g, ' ').trim();
const optionOf = n => (/\btray\b/i.test(decode(n)) ? 'Tray' : 'Box');
// The attribute the 7600X page uses, so every CPU page looks the same.
const ref = Object.values(pages).find(p => p.type === 'variable' && (p.attributes || []).some(a => a.variation));
const refAttr = ref ? (ref.attributes || []).find(a => a.variation) : null;
const attrKey = refAttr && refAttr.id ? { id: refAttr.id } : { name: refAttr ? refAttr.name : 'Option' };
// Every attribute the pages have besides the option (Socket, TDP, Brand, cores... used by filters and the PC builder):
// the kept page's first, then any the other pages have that it lacks. The option attribute goes last.
const keyOf = a => (a.id ? 'i' + a.id : 'n' + String(a.name || '').toLowerCase());
function attrsOf(ps) {
  const seen = new Set(), list = [];
  for (const p of ps) for (const a of (p.attributes || [])) {
    if (a.variation || seen.has(keyOf(a))) continue;
    seen.add(keyOf(a));
    list.push({ ...(a.id ? { id: a.id } : { name: a.name }), options: a.options || [], visible: a.visible !== false, variation: false, position: list.length });
  }
  return list;
}
const out = [], problems = [];
for (const g of String(S.groups || '').split(';').map(x => x.split(',').map(Number).filter(Boolean)).filter(x => x.length)) {
  let ps = g.map(id => pages[id]).filter(Boolean);
  if (ps.length !== g.length) { problems.push(`${g.join(',')}: a page was not found`); continue; }
  // A page with options that was never published (Ryzen 7 7700) only lends its details; the shown simple page is kept.
  const unpublished = ps.filter(p => p.type !== 'simple' && p.status !== 'publish');
  if (unpublished.length && ps.some(p => p.type === 'simple')) ps = ps.filter(p => !unpublished.includes(p));
  if (ps.some(p => p.type !== 'simple')) {
    // Already merged (an earlier run): only puts back attributes the old pages had.
    const v = ps.find(p => p.type === 'variable'), opt = v && (v.attributes || []).find(a => a.variation);
    if (!v || !opt || ps.filter(p => p.type === 'variable').length > 1) { problems.push(`${g.join(',')}: a page already has options`); continue; }
    const rest = [v, ...ps.filter(p => p !== v)];
    const attrs = attrsOf(rest);
    attrs.push({ ...(opt.id ? { id: opt.id } : { name: opt.name }), options: opt.options, visible: opt.visible !== false, variation: true, position: attrs.length });
    out.push({ json: { label: `${decode(v.name)}: put back ${attrs.length - 1} attributes on ${v.id}`, keep: v.id, others: [], name: decode(v.name), put: { attributes: attrs }, variations: { create: [] }, moved: {} } });
    continue;
  }
  const byOpt = {};
  for (const p of ps) (byOpt[optionOf(p.name)] = byOpt[optionOf(p.name)] || []).push(p);
  // An option no page has yet is added out of stock with no price (set it later from the app).
  if (!byOpt.Box && !byOpt.Tray) { problems.push(`${ps.map(p => p.name).join(' + ')}: no Box or Tray page`); continue; }
  const best = l => l.slice().sort((a, b) => (a.stock_status === 'instock' ? 0 : 1) - (b.stock_status === 'instock' ? 0 : 1) || (b.total_sales || 0) - (a.total_sales || 0))[0];
  const none = { regular_price: '', sale_price: '', stock_status: 'outofstock', images: [] };
  const src = { Box: byOpt.Box ? best(byOpt.Box) : none, Tray: byOpt.Tray ? best(byOpt.Tray) : none };
  const keep = ps.slice().sort((a, b) => (b.total_sales || 0) - (a.total_sales || 0) || a.id - b.id)[0];
  const others = ps.filter(p => p.id !== keep.id);
  const name = baseName(keep.name);
  const imgs = [];
  for (const i of (keep.images || [])) if (!imgs.some(x => x.id === i.id)) imgs.push({ id: i.id });
  const photo = o => ((src[o].images || [])[0] || null);
  for (const o of ['Box', 'Tray']) { const im = photo(o); if (im && !imgs.some(i => i.id === im.id)) imgs.push({ id: im.id }); }
  const variation = o => {
    const p = src[o];
    const v = { regular_price: String(p.regular_price || ''), sale_price: String(p.sale_price || ''), attributes: [{ ...attrKey, option: o }] };
    if (p.manage_stock) { v.manage_stock = true; v.stock_quantity = Number(p.stock_quantity || 0); } else v.stock_status = p.stock_status;
    if (photo(o)) v.image = { id: photo(o).id };
    return v;
  };
  const inStock = ['Box', 'Tray'].find(o => src[o].stock_status === 'instock') || 'Box';
  out.push({ json: {
    label: `${name}: keep ${keep.id} (${keep.name}, ${keep.total_sales || 0} sold), drafts ${others.map(p => p.id + ' (' + p.name + ', ' + (p.total_sales || 0) + ' sold)').join(', ')}`,
    keep: keep.id, others: others.map(p => p.id), name,
    put: { type: 'variable', name, attributes: [...attrsOf([keep, ...others, ...unpublished]), { ...attrKey, options: ['Box', 'Tray'], variation: true, visible: true, position: attrsOf([keep, ...others, ...unpublished]).length }], default_attributes: [{ ...attrKey, option: inStock }], images: imgs },
    variations: { create: ['Box', 'Tray'].map(variation) },
    moved: Object.fromEntries(others.map(p => [p.id, keep.id])),
  } });
}
for (const part of String(S.renames || '').split(';')) {
  const m = part.match(/^\s*(\d+)\s*=\s*(.+?)\s*$/);
  if (m && pages[m[1]]) out.push({ json: { label: `rename ${m[1]} "${decode(pages[m[1]].name)}" -> "${m[2]}"`, keep: Number(m[1]), others: [], name: m[2], put: { name: m[2] }, variations: { create: [] }, moved: {} } });
}
if (!out.length) throw new Error('Nothing to do. ' + problems.join(' | '));
out[0].json.problems = problems;
out[0].json.attribute = refAttr ? { id: refAttr.id, name: refAttr.name, options: refAttr.options } : null;
out[0].json.dry = S.dryRun !== false;
return out;
