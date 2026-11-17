// "Plan" Code node of "Static OS - Delete from Facebook and Instagram".
// Posts someone asked to take off Facebook and Instagram (takeDown 'asked'), plus any left half done by a run that
// stopped ('working' for over 30 minutes; deleting again is safe, a post that is already gone counts as removed).
// Each post is claimed first (takeDown 'working', with the document's updateTime as a precondition), so two runs
// at the same moment can never both work on it. At most 5 posts per run.
const PROJECT = 'poster-pilot-8d35e';
const str = v => (v === undefined || v === null) ? '' : String(v);
const clean = v => str(v).trim();
const dec = v => {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) { const o = {}; const f = (v.mapValue && v.mapValue.fields) || {}; for (const k of Object.keys(f)) o[k] = dec(f[k]); return o; }
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(dec);
  return null;
};
const now = Date.now();
const posts = [];
const writes = [];
for (const j of $input.all().map(i => i.json)) {
  if (!j || !j.document) continue;
  const d = j.document;
  const f = dec({ mapValue: { fields: d.fields || {} } }) || {};
  const id = d.name.split('/').pop();
  const state = clean(f.takeDown);
  if (state === 'working' && now - Number(f.takeDownTry || 0) < 30 * 60 * 1000) continue;
  if (state !== 'asked' && state !== 'working') continue;
  // The Instagram post's id is kept in IG status: "Posted 2026-11-17 15:02 (1789...)" / "Published ... (1789...)".
  const igs = clean(f.igStatus);
  const m = igs.match(/^(posted|published)\b.*\((\d+)\)\s*$/i);
  const fbPostId = clean(f.fbPostId);
  posts.push({
    id, name: d.name,
    title: (Array.isArray(f.items) ? f.items : []).map(it => [clean(it && it.name), clean(it && it.label)].filter(Boolean).join(' ')).filter(Boolean).join(' + ').slice(0, 280),
    fbPostId: /^[\d_]+$/.test(fbPostId) ? fbPostId : '',
    igId: m ? m[2] : '',
    igStatus: igs,
    q: Array.isArray(f.q) ? f.q : [],
    by: clean(f.takeDownBy),
  });
  writes.push({
    update: { name: d.name, fields: { takeDown: { stringValue: 'working' }, takeDownTry: { integerValue: String(now) } } },
    updateMask: { fieldPaths: ['takeDown', 'takeDownTry'] },
    currentDocument: { updateTime: d.updateTime },
  });
  if (posts.length >= 5) break;
}
return posts.length ? [{ json: { posts, writes } }] : [];
