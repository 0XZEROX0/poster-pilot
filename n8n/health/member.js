// "Known member?" Code node (Static OS - Health, webhook "App asks").
// Google said who is asking. A person seen as a member in the last hour is not looked up again, so the page's
// regular checks cost no database reads.
const sd = $getWorkflowStaticData('global');
sd.members = sd.members || {};
const now = Date.now();
for (const [k, until] of Object.entries(sd.members)) if (until < now) delete sd.members[k];
const uid = (((($input.first().json || {}).users) || [])[0] || {}).localId || '';
return [{ json: { uid, known: !!(uid && sd.members[uid]) } }];
