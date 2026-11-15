// "Links to check" Code node. Keeps the confirmed links (web.ok) with what the app has for each, and asks the website
// for them: one request for up to 100 products, and one for the options of each product with options (Box/Tray, colours).
const sd = $getWorkflowStaticData('global');
const dv = v => { if (!v || typeof v !== 'object') return null; if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return Number(v.doubleValue); if ('timestampValue' in v) return v.timestampValue; if ('nullValue' in v) return null; if ('mapValue' in v) { const o = {}; const f = (v.mapValue && v.mapValue.fields) || {}; for (const k of Object.keys(f)) o[k] = dv(f[k]); return o; } if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(dv); return null; };
const n = v => (v === null || v === undefined || v === '' ? null : Number(v));
let list = null;
try { if ($('Read price list').isExecuted) list = $('Read price list').first().json; } catch (e) { list = null; }
if (list && Array.isArray(list.documents)) {
  const links = [];
  for (const d of list.documents) {
    const cat = d.name.split('/').pop();
    if (cat === '_meta') continue;
    const f = dv({ mapValue: { fields: d.fields || {} } }) || {};
    for (const [pid, it] of Object.entries(f.items || {})) {
      const w = it.web;
      if (!w || w.ok !== true || !w.id) continue;
      links.push({ cat, pid, name: String(it.name || ''), id: Number(w.id), type: String(w.type || 'simple'), variation: w.variation ? Number(w.variation) : null,
        app: { price: n(it.online), sale: n(it.onlineSale), stock: it.out === true ? 'outofstock' : 'instock' }, webName: String(w.name || '') });
    }
  }
  sd.links = links;
  sd.linksVersion = $('Refresh links?').first().json.version;
  sd.linksAt = Date.now();
}
const links = sd.links || [];
const ids = [...new Set(links.map(l => l.id))];
const out = [];
for (let i = 0; i < ids.length; i += 100) out.push({ json: { kind: 'products', url: `https://static-eg.com/wp-json/wc/v3/products?per_page=100&include=${ids.slice(i, i + 100).join(',')}` } });
for (const id of [...new Set(links.filter(l => l.type === 'variable' && l.variation).map(l => l.id))]) out.push({ json: { kind: 'options', id, url: `https://static-eg.com/wp-json/wc/v3/products/${id}/variations?per_page=100` } });
return out;
