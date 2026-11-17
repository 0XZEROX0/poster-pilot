// "Remember the read" Code node: after the app was updated, the next run reads only website orders changed since this
// run started. Writes the website refused because the app changed the order meanwhile are read again next run.
const res = $input.all().map(i => i.json || {});
const statuses = (res[0] && res[0].status) || [];
const refused = statuses.filter(s => s && s.code).length;
const sd = $getWorkflowStaticData('global');
if (!refused) sd.lastPull = sd.pending;
return [{ json: { saved: statuses.length - refused, refused } }];
