// Prints the update_workflow operations applied to the App engine (qRX3fplFZLoSmgir): run=takedown starts
// "Static OS - Delete from Facebook and Instagram" (AeH2jEtA0kOCPrhK). node engine-ops.cjs
const fs = require('fs');
const cond = "$json.run.includes('takedown')";
const rule = { outputKey: 'Remove from Facebook and Instagram', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ ' + cond + ' }}', operator: { type: 'boolean', operation: 'true', singleValue: true } }] } };
const ops = [
  { type: 'setNodeParameter', nodeName: 'What to run', path: '/jsCode', value: fs.readFileSync(__dirname + '/../runnow/what-to-run.js', 'utf8') },
  { type: 'setNodeParameter', nodeName: 'Run which', path: '/rules/values/9', value: rule },
  { type: 'addNode', node: { name: 'Start removing posts', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: [1120, -400], parameters: { mode: 'once', options: { waitForSubWorkflow: false }, source: 'database', workflowId: { __rl: true, mode: 'id', value: 'AeH2jEtA0kOCPrhK', cachedResultName: 'Static OS - Delete from Facebook and Instagram' } } } },
  { type: 'setNodeSettings', nodeName: 'Start removing posts', settings: { onError: 'continueRegularOutput' } },
  { type: 'addConnection', source: 'Run which', target: 'Start removing posts', sourceIndex: 9 },
];
console.log(JSON.stringify(ops));
