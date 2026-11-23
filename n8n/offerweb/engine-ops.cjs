// Prints the update_workflow operations applied to the App engine (qRX3fplFZLoSmgir): run=offerweb starts
// "Static OS - Offer to website" (VxHTLa1Rv6xqbgH8). node engine-ops.cjs
const fs = require('fs');
const cond = "$json.run.includes('offerweb')";
const rule = { outputKey: 'Offers to website', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ ' + cond + ' }}', operator: { type: 'boolean', operation: 'true', singleValue: true } }] } };
const ops = [
  { type: 'setNodeParameter', nodeName: 'What to run', path: '/jsCode', value: fs.readFileSync(__dirname + '/../runnow/what-to-run.js', 'utf8') },
  { type: 'setNodeParameter', nodeName: 'Run which', path: '/rules/values/11', value: rule },
  { type: 'addNode', node: { name: 'Start offers to website', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: [1120, -600], parameters: { mode: 'once', options: { waitForSubWorkflow: false }, source: 'database', workflowId: { __rl: true, mode: 'id', value: 'VxHTLa1Rv6xqbgH8', cachedResultName: 'Static OS - Offer to website' } } } },
  { type: 'setNodeSettings', nodeName: 'Start offers to website', settings: { onError: 'continueRegularOutput' } },
  { type: 'addConnection', source: 'Run which', target: 'Start offers to website', sourceIndex: 11 },
];
console.log(JSON.stringify(ops));
