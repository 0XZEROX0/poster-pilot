// Posts store, last step: hands the result back to the calling workflow (rows for a read, the written
// columns for a write, the way the old Google Sheets step answered).
const a = $('Apply').all();
const w = a[0] && a[0].json && a[0].json._op === 'write' ? a[0].json : null;
if (!w) return a.map(i => ({ json: i.json }));
return (w._echo || []).map(j => ({ json: j }));
