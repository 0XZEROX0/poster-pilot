// "Anything new?" Code node: stops the run (no price list read) when the app's version did not move since the last run
// and no retry is due. Manual runs always go on.
const sd = $getWorkflowStaticData('global');
const version = Number((($json.fields || {}).version || {}).integerValue || 0);
if ($execution.mode !== 'manual' && sd.version === version && !(sd.retryAt && Date.now() >= sd.retryAt)) return [];
return [{ json: { version } }];
