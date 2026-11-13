// Decides how much to read from the app database this run.
// Normally only the posts with a change waiting in the app are read (cheap).
// Once a day, and on the very first run, every post is read so that nothing can drift apart.
const cfg = $('Settings').first().json;
const sd = $getWorkflowStaticData('global');
const day = 24 * 60 * 60 * 1000;
const full = !sd.hash || !sd.lastFull || (Date.now() - sd.lastFull) > day || sd.sheet !== cfg.spreadsheetId;
const all = { structuredQuery: { from: [{ collectionId: 'posts' }] } };
const waiting = { structuredQuery: { from: [{ collectionId: 'posts' }], where: { fieldFilter: { field: { fieldPath: 'appDirty' }, op: 'EQUAL', value: { booleanValue: true } } }, limit: 200 } };
return [{ json: { full, query: full ? all : waiting } }];
