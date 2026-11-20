// "Known member?" Code node (Static OS - Health, webhook "App asks").
// Google said who is asking. A person seen as a member in the last hour is not looked up again, so the page's
// regular checks cost no database reads. `see` = their role has "See system health" (health.view) or they are the owner.
const sd = $getWorkflowStaticData('global');
sd.members = sd.members || {};
const now = Date.now();
for (const [k, v] of Object.entries(sd.members)) if (!v || typeof v !== 'object' || v.until < now) delete sd.members[k];
const uid = (((($input.first().json || {}).users) || [])[0] || {}).localId || '';
const hit = uid ? sd.members[uid] : null;
return [{ json: { uid, known: !!hit, see: !!(hit && hit.see) } }];
