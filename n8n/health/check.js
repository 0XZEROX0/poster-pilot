// "Internet result" Code node (Static OS - Health, every 5 minutes).
// n8n asked two well-known addresses (Google and Cloudflare). If neither answered, the server has no internet.
// The answer is kept as one row in the "health checks" data table; the System health page reads those rows.
// A row from n8n also proves that n8n (and so the server) was running at that time.
const ok = name => {
  try {
    const j = $(name).first().json || {};
    const code = Number(j.statusCode || 0);
    return code >= 200 && code < 500;
  } catch (e) { return false; }
};
const google = ok('Ask Google');
const cloudflare = ok('Ask Cloudflare');
const internet = google || cloudflare ? 1 : 0;
const note = internet ? '' : 'No answer from Google or Cloudflare';
return [{ json: { at: Date.now(), src: 'n8n', internet, website: -1, meta: -1, disk: -1, up: -1, n8n: 1, note } }];
