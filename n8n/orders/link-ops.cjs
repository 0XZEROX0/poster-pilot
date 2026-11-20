// Prints the update_workflow operations that added the order links part to the live "Static OS - Website orders"
// (2026-11-20): node n8n/orders/link-ops.cjs. The live "Decide app changes" kept its own copy of webPart (same code);
// the live link Code nodes carry only the helpers from common.js that each one uses.
const fs = require('fs');
const COMMON = fs.readFileSync(__dirname + '/common.js', 'utf8');
const R = f => COMMON + '\n' + fs.readFileSync(__dirname + '/' + f, 'utf8');
const FB = { googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } };
const WOO = { wooCommerceApi: { id: 'coKsvik1ximz06rn', name: 'Static website' } };
const FS = "=https://firestore.googleapis.com/v1/projects/{{ $('Settings').first().json.projectId }}/databases/(default)/documents";
const http = (name, path, body, pos) => ({ type: 'addNode', node: { name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, credentials: FB, parameters: { method: 'POST', url: FS + path, authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: body, options: { timeout: 60000 } } } });
const code = (name, file, pos) => ({ type: 'addNode', node: { name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: R(file) } } });
const cond = (name, left, pos) => ({ type: 'addNode', node: { name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ id: name, leftValue: left, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } } });
const LINKS = '={{ JSON.stringify({ structuredQuery: { from: [{ collectionId: "orderLinks" }], where: { fieldFilter: { field: { fieldPath: "state" }, op: "EQUAL", value: { stringValue: "filled" } } }, limit: 10 } }) }}';
const y = 900;
const ops = [
  { type: 'addNode', node: { name: 'Every 5 minutes', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [1344, 576], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } } },
  http('Find order links', ':runQuery', LINKS, [1792, y]),
  { type: 'setNodeSettings', nodeName: 'Find order links', settings: { alwaysOutputData: true, retryOnFail: true, maxTries: 2, waitBetweenTries: 3000 } },
  code('Order links to send', 'link-plan.js', [2016, y]),
  cond('Any link?', '={{ $json.claim }}', [2240, y]),
  http('Claim the links', ':batchWrite', '={{ JSON.stringify({ writes: $json.writes }) }}', [2464, y - 100]),
  { type: 'setNodeSettings', nodeName: 'Claim the links', settings: { retryOnFail: true, maxTries: 2, waitBetweenTries: 3000 } },
  code('Build website orders', 'link-build.js', [2688, y - 100]),
  cond('Claimed any?', '={{ $json.go }}', [2912, y - 100]),
  { type: 'addNode', node: { name: 'Make website orders', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [3136, y - 200], credentials: WOO, parameters: { method: 'POST', url: 'https://static-eg.com/wp-json/wc/v3/orders/batch', authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}', options: { timeout: 60000 } } } },
  { type: 'setNodeSettings', nodeName: 'Make website orders', settings: { onError: 'continueRegularOutput' } },
  code('Save link orders', 'link-results.js', [3360, y - 200]),
  http('Save link orders to the app', ':batchWrite', '={{ JSON.stringify({ writes: $json.writes }) }}', [3584, y - 200]),
  { type: 'setNodeSettings', nodeName: 'Save link orders to the app', settings: { onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 } },
  cond('Links only?', "={{ $('Every 5 minutes').isExecuted }}", [3808, y]),
  { type: 'removeConnection', source: 'Settings', target: 'Find orders to send' },
  { type: 'addConnection', source: 'Every 5 minutes', target: 'Settings' },
  { type: 'addConnection', source: 'Settings', target: 'Find order links' },
  { type: 'addConnection', source: 'Find order links', target: 'Order links to send' },
  { type: 'addConnection', source: 'Order links to send', target: 'Any link?' },
  { type: 'addConnection', source: 'Any link?', target: 'Claim the links', sourceIndex: 0 },
  { type: 'addConnection', source: 'Any link?', target: 'Links only?', sourceIndex: 1 },
  { type: 'addConnection', source: 'Claim the links', target: 'Build website orders' },
  { type: 'addConnection', source: 'Build website orders', target: 'Claimed any?' },
  { type: 'addConnection', source: 'Claimed any?', target: 'Make website orders', sourceIndex: 0 },
  { type: 'addConnection', source: 'Claimed any?', target: 'Links only?', sourceIndex: 1 },
  { type: 'addConnection', source: 'Make website orders', target: 'Save link orders' },
  { type: 'addConnection', source: 'Save link orders', target: 'Save link orders to the app' },
  { type: 'addConnection', source: 'Save link orders to the app', target: 'Links only?' },
  { type: 'addConnection', source: 'Links only?', target: 'Find orders to send', sourceIndex: 1 },
];
console.log(JSON.stringify(ops));
