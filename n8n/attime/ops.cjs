// Prints the update_workflow operations applied on 2026-11-20 for "post at the minute from the app":
//   node ops.cjs sched   -> scheduler Oa5WOuoSdrNquHHe
//   node ops.cjs custom  -> text/photo/video posts loraXApCLeMZ2aP8 (needs the live "One action each" code in argv[3])
const fs = require('fs');
const rd = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
const WAITER = 'O7LGzamX1eTPHxIs';
const field = (id, type) => ({ id, displayName: id, required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type, removed: false });
const startTimer = (name, position) => ({ type: 'addNode', node: { name, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position,
  notes: 'Starts "Static OS - Post at time" for each post and does not wait: it sleeps until the post minute, then runs this workflow again.',
  parameters: { source: 'database', mode: 'each', options: { waitForSubWorkflow: false },
    workflowId: { __rl: true, mode: 'id', value: WAITER, cachedResultName: 'Static OS - Post at time' } } } });
const cond = (name, position, c) => ({ type: 'addNode', node: { name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position, parameters: {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and',
    conditions: [{ leftValue: '={{ ' + c + ' }}', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } } });
const code = (name, position, js) => ({ type: 'addNode', node: { name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: js } } });

if (process.argv[2] === 'sched') {
  const ops = [
    { type: 'updateNodeParameters', nodeName: 'Plan Queue', parameters: { jsCode: rd('plan-queue.js') } },
    { type: 'updateNodeParameters', nodeName: 'Find Changed Posts', parameters: { jsCode: rd('find-changed-posts.js') } },
    { type: 'setNodePosition', nodeName: 'Plan Queue', position: [512, 208] },
    cond('Post from the app later?', [624, 208], '$json.local === true'),
    { type: 'addNode', node: { name: 'Save waiting status', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: [848, -96],
      parameters: { source: 'database', mode: 'each', options: { waitForSubWorkflow: true },
        workflowId: { __rl: true, mode: 'id', value: 'e0uQUJm6ImAuoEfV', cachedResultName: 'PosterPilot - Posts store' },
        workflowInputs: { mappingMode: 'defineBelow', matchingColumns: [], attemptToConvertTypes: false, convertFieldsToString: false,
          schema: [field('op', 'string'), field('purpose', 'string'), field('raw', 'boolean'), field('id', 'string'), field('cols', 'object')],
          value: { op: 'write', purpose: '', raw: false, id: '={{ $json.row_number }}', cols: '={{ ({ "FB status": $json.status }) }}' } } } } },
    code('Timers to start', [848, 32], "// One timer per post that waits in the app (time under 30 minutes away): it runs the queue at that minute.\nreturn $input.all().map(i => ({ json: { at: i.json.waitUntil, target: 'posters', id: i.json.row_number } }));\n"),
    startTimer('Start post timer', [1072, 32]),
    { type: 'removeConnection', source: 'Plan Queue', target: 'Download Design From Drive' },
    { type: 'addConnection', source: 'Plan Queue', target: 'Post from the app later?' },
    { type: 'addConnection', source: 'Post from the app later?', sourceIndex: 0, target: 'Save waiting status' },
    { type: 'addConnection', source: 'Post from the app later?', sourceIndex: 0, target: 'Timers to start' },
    { type: 'addConnection', source: 'Timers to start', target: 'Start post timer' },
    { type: 'addConnection', source: 'Post from the app later?', sourceIndex: 1, target: 'Download Design From Drive' },
    { type: 'setNodePosition', nodeName: 'Download Design From Drive', position: [848, 208] }
  ];
  console.log(JSON.stringify(ops));
}
if (process.argv[2] === 'custom') {
  // The live "One action each" = lib.js helpers + plan.js; only the plan part (from its '"Plan" Code node' line) is replaced.
  const live = fs.readFileSync(process.argv[3], 'utf8');
  const cut = live.indexOf('// "Plan" Code node');
  const plan = rd('../custom/plan.js');
  const ops = [
    { type: 'updateNodeParameters', nodeName: 'One action each', parameters: { jsCode: live.slice(0, cut) + plan.slice(plan.indexOf('// "Plan" Code node')) } },
    code('Timers to start', [1120, 640], "// One timer per post that waits in the app (time under 30 minutes away): it runs this workflow at that minute.\nreturn $input.all().filter(i => i.json.wait).map(i => ({ json: { at: i.json.wait, target: 'custom', id: i.json.id } }));\n"),
    startTimer('Start post timer', [1344, 640]),
    { type: 'addConnection', source: 'One action each', target: 'Timers to start' },
    { type: 'addConnection', source: 'Timers to start', target: 'Start post timer' }
  ];
  console.log(JSON.stringify(ops));
}
