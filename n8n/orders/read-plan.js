// "Which orders to read" Code node: the website orders changed since the last read (10 minutes of overlap), 100 a
// page, oldest change first. The first run reads the last `sinceDays` days plus every order still open, however old.
const sd = $getWorkflowStaticData('global');
const start = new Date();
const since = sd.lastPull ? new Date(Date.parse(sd.lastPull) - 10 * 60 * 1000) : new Date(start.getTime() - Number(S.sinceDays || 30) * 86400000);
sd.pending = start.toISOString();
const W = 'https://static-eg.com/wp-json/wc/v3/orders';
const urls = [`${W}?per_page=100&orderby=modified&order=asc&dates_are_gmt=true&modified_after=${encodeURIComponent(since.toISOString().slice(0, 19))}`];
if (!sd.lastPull) urls.push(`${W}?per_page=100&status=pending,on-hold,processing`);
return urls.map(url => ({ json: { url, first: !sd.lastPull } }));
