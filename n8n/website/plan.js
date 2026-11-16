// "What to send" Code node of n8n workflow "Static OS - Website sync".
// Every minute the workflow reads prices/_meta; the app raises its version with every price change. Only when it moved
// (or a failed send is due for a retry) is the price list read and this node finds the products that are out of step
// with the website: a confirmed link (web.ok) whose Online price, Online sale or stock differs from what the website
// had when last read or sent (web.price / web.sale / web.stock). The same rule is webPending() in src/data/prices.ts.
const sd = $getWorkflowStaticData('global');
const manual = $execution.mode === 'manual';
const meta = $('Read version').first().json;
const version = Number(((meta.fields || {}).version || {}).integerValue || 0);
const list = $('Read price list').first().json;
const S = $('Settings').first().json;
// Test: in a dry run, the suggested links named in Settings.testNames (comma separated, part of the product name) are
// treated as confirmed, so the whole run can be tried without changing the website.
const TEST = S.dryRun !== false ? String(S.testNames || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean) : [];

const dv = v => { if (!v || typeof v !== 'object') return null; if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return Number(v.doubleValue); if ('timestampValue' in v) return v.timestampValue; if ('nullValue' in v) return null; if ('mapValue' in v) { const o = {}; const f = (v.mapValue && v.mapValue.fields) || {}; for (const k of Object.keys(f)) o[k] = dv(f[k]); return o; } if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(dv); return null; };
const n = v => (v === null || v === undefined || v === '' ? null : Number(v));

const out = [];
let waiting = false;
for (const d of (list.documents || [])) {
  const cat = d.name.split('/').pop();
  if (cat === '_meta') continue;
  const f = dv({ mapValue: { fields: d.fields || {} } }) || {};
  for (const [pid, it] of Object.entries(f.items || {})) {
    const w = it.web;
    const test = TEST.some(t => String(it.name || '').toLowerCase().includes(t));
    if (!w || (w.ok !== true && !test) || !w.id) continue;
    const want = { price: n(it.online), sale: n(it.onlineSale), stock: it.out === true ? 'outofstock' : 'instock' };
    const has = { price: n(w.price), sale: n(w.sale), stock: w.stock === 'outofstock' ? 'outofstock' : 'instock' };
    // A sale price that is not below the price is no sale: WooCommerce ignores it (sends back an empty sale price), so
    // sending it again would repeat forever. Same rule as webPending() in the app.
    const ref = want.price !== null ? want.price : has.price;
    if (want.sale !== null && ref !== null && want.sale >= ref) want.sale = null;
    const send = {};
    if (want.price !== null && want.price !== has.price) send.price = want.price;
    if (want.sale !== has.sale) send.sale = want.sale;
    if (w.stock && want.stock !== has.stock) send.stock = want.stock;
    if (!w.stock) send.stock = want.stock; // never read yet
    // A name chosen in the app for the website product ("Keep the price list name" or "New name").
    const rename = w.rename && String(w.rename).replace(/\s+/g, ' ').trim() !== String(w.name || '').replace(/\s+/g, ' ').trim() ? String(w.rename).trim() : null;
    if (rename) { send.name = rename; want.name = rename; }
    if (!Object.keys(send).length && !test) continue;
    // A send that failed is tried again after 30 minutes, not every minute (or at once when the product is changed again).
    const recentFail = w.error && w.triedAt && Date.now() - Date.parse(w.triedAt) < 30 * 60 * 1000;
    if (recentFail && !manual && sd.version === version) { waiting = true; continue; }
    out.push({ json: { cat, pid, name: String(it.name || ''), id: Number(w.id), type: String(w.type || 'simple'), variation: w.variation ? Number(w.variation) : null, want, send } });
  }
}
if (TEST.length) return out.slice(0, 40); // a test run leaves the run state alone
sd.version = version;
// Look again in 30 minutes while something is still out of step (a failed send, or more than 40 waiting).
sd.retryAt = out.length || waiting ? Date.now() + (out.length > 40 ? 60 * 1000 : 30 * 60 * 1000) : null;
return out.slice(0, 40); // at most 40 products a run; the rest go next minute
