// Prints the update_workflow operations applied to the App engine (qRX3fplFZLoSmgir): run=orders starts
// "Static OS - Website orders" (QP4OrcmkFHHZ8ulM). node engine-ops.cjs
const fs = require('fs');
const cond = "$json.run.includes('orders')";
const rule = { outputKey: 'Website orders', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ ' + cond + ' }}', operator: { type: 'boolean', operation: 'true', singleValue: true } }] } };
const ops = [
  { type: 'setNodeParameter', nodeName: 'What to run', path: '/jsCode', value: fs.readFileSync(__dirname + '/../runnow/what-to-run.js', 'utf8') },
  // n8n cannot append to an array: the whole /rules/values array (the 10 existing rules + this one) was set.
  { type: 'setNodeParameter', nodeName: 'Run which', path: '/rules/values/10', value: rule },
  { type: 'addNode', node: { name: 'Start website orders', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: [1120, -240], parameters: { mode: 'once', options: { waitForSubWorkflow: false }, source: 'database', workflowId: { __rl: true, mode: 'id', value: 'QP4OrcmkFHHZ8ulM', cachedResultName: 'Static OS - Website orders' } } } },
  { type: 'setNodeSettings', nodeName: 'Start website orders', settings: { onError: 'continueRegularOutput' } },
  { type: 'addConnection', source: 'Run which', target: 'Start website orders', sourceIndex: 10 },
];
console.log(JSON.stringify(ops));
