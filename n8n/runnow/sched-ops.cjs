// Prints the update_workflow operations that let the app start parts of the scheduler (Oa5WOuoSdrNquHHe).
const call = require('./call.cjs');
const ops = [];
const add = (node) => ops.push({ type: 'addNode', node });
const con = (source, target, sourceIndex = 0) => ops.push({ type: 'addConnection', source, target, sourceIndex });
add({ name: 'When app asks', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, position: [-1120, 1400], parameters: { inputSource: 'passthrough' }, notes: 'The app engine starts parts of this workflow right after a change in the app ({ parts: [queue, instagram, status, captions, changes] }), instead of waiting for the timers.' });
const parts = [['queue', 'Queue'], ['instagram', 'Instagram'], ['status', 'Status'], ['captions', 'Captions'], ['changes', 'Changes']];
add({ name: 'Which parts', type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: [-896, 1400], parameters: { mode: 'rules', rules: { values: parts.map(([k, label]) => ({ outputKey: label, renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: `={{ ([].concat($json.parts || [])).includes('${k}') }}`, operator: { type: 'boolean', operation: 'true', singleValue: true } }] } })) }, options: { allMatchingOutputs: true } } });
// One run at a time for the parts that post to Facebook / Instagram or cancel posts.
const guarded = [
  { label: 'Queue', key: 'sched-queue', seconds: 600, trig: 'Check For New Designs Every 15 Min', read: 'Read Posts Sheet (Queue)', y: 208, giveY: 420 },
  { label: 'Instagram', key: 'sched-instagram', seconds: 300, trig: 'Check Instagram Queue Every 5 Min', read: 'Read Posts Sheet (Instagram)', y: 672, giveY: 880 },
  { label: 'Changes', key: 'sched-changes', seconds: 300, trig: 'Check For Changed Posts Every 5 Min', read: 'Read Posts Sheet (Changes)', y: 2752, giveY: 3000 },
];
for (const g of guarded) {
  const take = `Take turn (${g.label})`, got = `Got turn (${g.label})?`, give = `Give back turn (${g.label})`;
  add({ name: take, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: [-448, g.y], parameters: call({ op: 'take', key: g.key, seconds: g.seconds, wait: "={{ $('When app asks').isExecuted }}", updateTime: '', by: `={{ $('When app asks').isExecuted ? 'app' : 'timer' }}` }), notes: 'Only one run of this part at a time (the timer and the app can both start it). A run started by the app waits for its turn; a timer run that finds it busy just stops.' });
  add({ name: got, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [-224, g.y], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.ok === true || $json.turn === undefined }}', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } });
  add({ name: give, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: [288, g.giveY], parameters: call({ op: 'give', key: g.key, seconds: 0, wait: false, updateTime: `={{ $('${take}').first().json.updateTime }}`, by: '' }), notes: 'Placed below the main branch, so it runs after the whole part has finished.' });
  ops.push({ type: 'removeConnection', source: g.trig, target: g.read });
  con(g.trig, take); con(take, got); con(got, g.read); con(got, give);
}
con('When app asks', 'Which parts');
con('Which parts', 'Take turn (Queue)', 0);
con('Which parts', 'Take turn (Instagram)', 1);
con('Which parts', 'Read Posts Sheet (Status)', 2);
con('Which parts', 'Read Posts Sheet (Captions)', 3);
con('Which parts', 'Take turn (Changes)', 4);
for (const n of ['Take turn (Queue)', 'Take turn (Instagram)', 'Take turn (Changes)', 'Give back turn (Queue)', 'Give back turn (Instagram)', 'Give back turn (Changes)']) ops.push({ type: 'setNodeSettings', nodeName: n, settings: { onError: 'continueRegularOutput', alwaysOutputData: true } });
console.log(JSON.stringify(ops));
