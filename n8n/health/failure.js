// "Describe the failure" Code node (Static OS - Health, Error Trigger).
// Every Static workflow names this workflow as its "error workflow", so n8n starts this run each time one of them fails.
// One row per failed run goes into the "health events" data table. The System health page groups them by cause.
const j = $input.first().json || {};
const ex = j.execution || {};
const wf = j.workflow || {};
const err = ex.error || (j.trigger || {}).error || {};
const msg = String(err.message || err.description || 'Unknown error').replace(/\s+/g, ' ').slice(0, 400);
return [{ json: {
  at: Date.now(), kind: 'workflow', title: String(wf.name || 'A workflow').slice(0, 120), detail: msg,
  wf: String(wf.name || ''), wfId: String(wf.id || ''), node: String(ex.lastNodeExecuted || err.node?.name || '').slice(0, 120),
  exec: String(ex.id || ''), who: String(ex.mode || ''),
} }];
