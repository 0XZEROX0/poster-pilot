// "Check request" Code node of "Static OS - Upload post media". The app asks in two steps:
//   op 'start'  { name, type, size }  -> a Google Drive upload link; the browser sends the file there itself (so a big
//                                        video never goes through n8n or this computer's internet link)
//   op 'finish' { id }                -> the file is checked (it must be in AI Designs / Uploads), shared "anyone with
//                                        the link" (Facebook and Instagram fetch videos by link) and its size answered.
// Only a signed-in member may ask. Photos up to 30 MB (JPEG, PNG, WebP), videos up to 300 MB (MP4, MOV).
const m = $('Member').first().json || {};
const body = $('Upload from the app').first().json.body || {};
const op = String(body.op || '');
const LIMITS = { 'image/jpeg': 30, 'image/png': 30, 'image/webp': 30, 'video/mp4': 300, 'video/quicktime': 300 };
let error = '';
const type = String(body.type || '').toLowerCase();
const size = Number(body.size) || 0;
const id = String(body.id || '').trim();
const safe = String(body.name || 'file').replace(/[^\w.\- ]+/g, '').trim().slice(-60) || 'file';
if (!m.name || m.error) error = 'Not a member';
else if (op === 'start') {
  if (!LIMITS[type]) error = 'Only JPEG, PNG or WebP photos and MP4 or MOV videos';
  else if (size <= 0 || size > LIMITS[type] * 1024 * 1024) error = 'Too big: up to ' + LIMITS[type] + ' MB';
} else if (op === 'finish') {
  if (!/^[\w-]{20,80}$/.test(id)) error = 'Bad file id';
} else error = 'Bad request';
const stamp = $now.setZone('Africa/Cairo').toFormat('yyyy-MM-dd HHmmss');
return [{ json: { ok: !error, error, op, type, size, id, name: stamp + ' ' + safe } }];
