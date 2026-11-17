// "Newest call?" Code node. Placing one order sends several calls in a row (created, then updated by payment and
// pickup plugins), and our own status sends send one each. Every call waits 30 s and only the newest of a burst
// goes on, so the website is read once per burst (its host blocks bursts of requests, see n8n/website/README.md).
const t = $('Real order change?').first().json.t;
const row = $input.all().map(i => i.json).find(r => r && r.key === 'orders') || {};
if (Number(row.lastHook || 0) > t) return [];
if (Number(row.lastStart || 0) > t) return [];
return [{ json: { t } }];
