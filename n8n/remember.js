// Notes which posts are now the same in the sheet and the app, so the next run only sends changes.
const plan = $('Plan sync').first().json;
const cfg = $('Settings').first().json;
const sd = $getWorkflowStaticData('global');
const chunks = $('Split Firestore writes').all();
const res = $input.all();
const cache = { ...plan.base };
const catalog = { ...(sd.sheet === cfg.spreadsheetId ? (sd.catalog || {}) : {}) };
let failed = 0;
const errors = [];
chunks.forEach((c, k) => {
  const st = (res[k] && res[k].json && res[k].json.status) || null;
  c.json.writes.forEach((w, j) => {
    const m = plan.meta[c.json.start + j];
    const ok = !!st && !(st[j] && st[j].code);
    if (!ok) { failed++; if (errors.length < 5) errors.push(m.kind + ' ' + m.id + ': ' + ((st && st[j] && st[j].message) || 'no answer')); }
    if (m.kind === 'mirror') cache[m.id] = ok ? m.hash : '-';
    else if (m.kind === 'delete' && !ok) cache[m.id] = '-';
    else if (m.kind === 'catalog' && ok) catalog[m.id] = m.hash;
  });
});
sd.hash = cache;
sd.catalog = catalog;
sd.sheet = cfg.spreadsheetId;
if (plan.full) sd.lastFull = Date.now();
return [{ json: { ...plan.stats, failed, errors, notes: plan.notes } }];
