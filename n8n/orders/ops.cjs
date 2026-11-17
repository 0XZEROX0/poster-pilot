// Prints the update_workflow operations that put the Code node sources into the live workflow: node n8n/orders/ops.cjs
const fs = require('fs');
const COMMON = fs.readFileSync(__dirname + '/common.js', 'utf8');
const R = (f, common) => (common ? COMMON + '\n' : '') + fs.readFileSync(__dirname + '/' + f, 'utf8');
const map = [['Real order change?', 'hook-check.js', false], ['Newest call?', 'newest.js', false], ['What to send', 'send-plan.js', true], ['Save what the website answered', 'send-results.js', true], ['Which orders to read', 'read-plan.js', true], ['Orders to look up', 'to-check.js', true], ['Decide app changes', 'decide.js', true], ['Remember the read', 'remember.js', false], ['Webhooks fine?', 'hook-keep.js', false]];
const only = process.argv[2] ? process.argv[2].split(',') : null;
console.log(JSON.stringify(map.filter(([n]) => !only || only.includes(n)).map(([nodeName, f, c]) => ({ type: 'setNodeParameter', nodeName, path: '/jsCode', value: R(f, c) }))));
