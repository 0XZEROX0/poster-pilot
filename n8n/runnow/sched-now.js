// "Scheduler now?" Code node: starts the scheduler parts that the post changes just saved need (see Plan app changes).
const parts = $('Plan app changes').first().json.sched || [];
return parts.length ? [{ json: { parts } }] : [];
