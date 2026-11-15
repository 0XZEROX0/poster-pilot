// Keeps the automatic checks safe:
//  - a row marked WORKING in the last 15 minutes is being processed by another run, so it is skipped
//  - rows with MISSING photo are retried automatically, once every 15 minutes (not every 3-min run)
//  - rows with AI ERROR are not retried until you set Feedback to Redo
const posts = $('Read Posts Rows').all().map(i => i.json);
const byRow = {};
posts.forEach(p => { byRow[p.row_number] = p; });
let auto = false;
try { $('Check Sheet Every 3 Min').first(); auto = true; } catch (e) {}
try { $('When engine asks').first(); auto = true; } catch (e) {} // a run the app engine started counts as automatic too
const now = Date.now();
const retryMissingNow = new Date(now).getMinutes() % 15 < 3;
const out = [];
$input.all().forEach((it, idx) => {
  const p = byRow[it.json.row_number] || {};
  const status = String(p['Photo status'] || '').trim();
  const fb = String(p.Feedback || '').trim().toLowerCase();
  const redo = fb === 'redo' || fb === 'redo next image';
  const m = status.match(/^WORKING\s+(\S+)/i);
  if (m) { const t = Date.parse(m[1]); if (isFinite(t) && now - t < 15 * 60 * 1000) return; }
  const st = status.toUpperCase();
  if (auto && !redo && /^MISSING\b/.test(st) && !retryMissingNow) return;
  if (auto && !redo && st === 'AI ERROR - SEE RUN') return;
  out.push({ json: it.json, pairedItem: { item: idx } });
});
return out;