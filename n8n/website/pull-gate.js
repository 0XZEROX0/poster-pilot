// "Refresh links?" Code node of n8n workflow "Static OS - Website to app" (every minute).
// The confirmed links (and the app's values) are kept between runs, so the price list is read again only when the app's
// version moved, or every 30 minutes. Reading prices/_meta costs 1 Firestore read a run.
const sd = $getWorkflowStaticData('global');
const version = Number((($json.fields || {}).version || {}).integerValue || 0);
const refresh = !sd.links || sd.linksVersion !== version || !sd.linksAt || Date.now() - sd.linksAt > 30 * 60 * 1000 || $execution.mode === 'manual';
return [{ json: { version, refresh } }];
