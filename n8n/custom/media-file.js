// "Check file" Code node: the uploaded file must sit in AI Designs / Uploads (so nothing else in Drive can be shared
// this way). Answers its id, kind and size in pixels (and length, for a video) for the app.
const f = $('Look up file').first().json || {};
const folder = $('Upload plan').first().json.folder;
const inUploads = Array.isArray(f.parents) && f.parents.includes(folder);
const img = f.imageMediaMetadata || {}, vid = f.videoMediaMetadata || {};
const ok = !!f.id && inUploads && !f.error;
return [{ json: { ok, error: ok ? '' : (f.error ? 'File not found' : 'Not an upload'), id: f.id || '', type: String(f.mimeType || ''), w: Number(img.width || vid.width) || 0, h: Number(img.height || vid.height) || 0, ms: Number(vid.durationMillis) || 0 } }];
