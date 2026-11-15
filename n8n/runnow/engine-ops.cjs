// Prints the update_workflow operations for the App engine (qRX3fplFZLoSmgir): the app can start any timed workflow.
const fs = require('fs');
const ops = [];
const add = (node) => ops.push({ type: 'addNode', node });
const con = (source, target, sourceIndex = 0) => ops.push({ type: 'addConnection', source, target, sourceIndex });
const run = (name, id, cached, pos) => add({ name, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: pos, parameters: { mode: 'once', options: { waitForSubWorkflow: false }, source: 'database', workflowId: { __rl: true, mode: 'id', value: id, cachedResultName: cached } } });
add({ name: 'What to run', type: 'n8n-nodes-base.code', typeVersion: 2, position: [448, -336], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: fs.readFileSync(__dirname + '/what-to-run.js', 'utf8') } });
const outs = [
  ['App changes', "$json.run.includes('app')", 'Find app changes'],
  ['Lists and prices', "$json.run.includes('lists')", 'Settings'],
  ['Posters', "$json.run.includes('poster')", 'Start poster run'],
  ['Scheduler', '$json.parts.length > 0', 'Start scheduler'],
  ['Move posters', "$json.run.includes('move')", 'Start moving posters'],
  ['Competitor prices', "$json.run.includes('market')", 'Start competitor prices'],
  ['Website photos', "$json.run.includes('photos')", 'Start website photos'],
  ['Website sync', "$json.run.includes('website')", 'Start website sync'],
  ['Website to app', "$json.run.includes('pull')", 'Start website to app'],
];
add({ name: 'Run which', type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: [672, -336], parameters: { mode: 'rules', rules: { values: outs.map(([label, cond]) => ({ outputKey: label, renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ ' + cond + ' }}', operator: { type: 'boolean', operation: 'true', singleValue: true } }] } })) }, options: { allMatchingOutputs: true } } });
run('Start scheduler', 'Oa5WOuoSdrNquHHe', 'Static OS - Schedule Posters To Facebook and Instagram', [1120, -880]);
run('Start moving posters', '9lDhcMvHhbodLi8L', 'Static OS - Move Published Posters', [1120, -720]);
run('Start competitor prices', 'cBTEsBYTVhNS8p7q', 'Static OS - Competitor Prices', [1120, -560]);
run('Start website photos', '7WRJVybLkYgJh0Nh', 'Static OS - Website photos', [896, -880]);
run('Start website sync', 'GLZ7NazaF82FZm9S', 'Static OS - Website sync', [896, -720]);
run('Start website to app', 'fHuULHd2qUV5IMAn', 'Static OS - Website to app', [896, -560]);
add({ name: 'Scheduler now?', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1792, -448], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: fs.readFileSync(__dirname + '/sched-now.js', 'utf8') } });
ops.push({ type: 'removeConnection', source: 'Member?', target: 'Find app changes' });
con('Member?', 'What to run');
con('What to run', 'Run which');
outs.forEach(([, , target], i) => con('Run which', target, i));
con('Save app changes', 'Scheduler now?');
con('Scheduler now?', 'Start scheduler');
for (const n of ['Start scheduler', 'Start moving posters', 'Start competitor prices', 'Start website photos', 'Start website sync', 'Start website to app']) ops.push({ type: 'setNodeSettings', nodeName: n, settings: { onError: 'continueRegularOutput' } });
ops.push({ type: 'setNodeParameter', nodeName: 'Plan app changes', path: '/jsCode', value: fs.readFileSync(__dirname + '/plan-app-changes.js', 'utf8') });
ops.push({ type: 'setNodeParameter', nodeName: 'App nudge', path: '/notes', value: 'x' });
console.log(JSON.stringify(ops.filter(o => o.path !== '/notes')));
