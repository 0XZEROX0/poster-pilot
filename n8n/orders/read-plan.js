// "Which orders to read" Code node: the website orders changed since the last read (10 minutes of overlap), 100 a
// page, oldest change first. The first run reads the last `sinceDays` days plus every order still open, however old.
const sd = $getWorkflowStaticData('global');
const W0 = 'https://static-eg.com/wp-json/wc/v3/orders';
// One-off catch-up of older orders: Settings.backfill = 'YYYY-MM-DD..YYYY-MM-DD' (created dates, Cairo days, up to 300
// orders), run by hand from the editor. The normal "changed since the last read" mark is left as it is.
const bf = String(S.backfill || '').match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
if (bf) {
  sd.pending = sd.lastPull;
  return [1, 2, 3].map(page => ({ json: { url: `${W0}?per_page=100&page=${page}&orderby=date&order=asc&after=${bf[1]}T00:00:00&before=${bf[2]}T23:59:59`, first: false } }));
}
const start = new Date();
const since = sd.lastPull ? new Date(Date.parse(sd.lastPull) - 10 * 60 * 1000) : new Date(start.getTime() - Number(S.sinceDays || 30) * 86400000);
sd.pending = start.toISOString();
const W = 'https://static-eg.com/wp-json/wc/v3/orders';
const urls = [`${W}?per_page=100&orderby=modified&order=asc&dates_are_gmt=true&modified_after=${encodeURIComponent(since.toISOString().slice(0, 19))}`];
if (!sd.lastPull) urls.push(`${W}?per_page=100&status=pending,on-hold,processing`);
return urls.map(url => ({ json: { url, first: !sd.lastPull } }));
