// "Is it that poster?" Code node: the poster link the website fetches is
// .../offer-poster/<post id>-<last 8 of the Drive file id>-<name>.jpg. The poster is served only while that post is
// being added to the website (webAdd 'working') and only when the file is that post's own poster.
const file = String(($('Poster link').first().json.params || {}).file || '');
const doc = $json || {};
const f = doc.fields || {};
const sv = k => (f[k] && f[k].stringValue) || '';
const posterUrl = sv('posterUrl');
const driveId = (posterUrl.match(/\/d\/([\w-]{20,})/) || posterUrl.match(/[?&]id=([\w-]{20,})/) || [])[1] || '';
const parts = file.split('-');
const ok = !!driveId && sv('webAdd') === 'working' && /\.jpg$/i.test(file) && parts[1] === driveId.replace(/[^A-Za-z0-9]/g, '').slice(-8);
return [{ json: { ok, driveId: ok ? driveId : '' } }];
