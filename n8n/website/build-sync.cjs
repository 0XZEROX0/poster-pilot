// Prints n8n Workflow SDK code for "Static OS - Website sync": node n8n/website/build-sync.cjs
const fs = require('fs');
const J = JSON.stringify;
const R = f => J(fs.readFileSync(__dirname + '/' + f, 'utf8'));
const FB = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const WOO = "{ wooCommerceApi: { id: 'coKsvik1ximz06rn', name: 'Static website' } }";
const FS = "https://firestore.googleapis.com/v1/projects/{{ $('Settings').first().json.projectId }}/databases/(default)/documents";
const code = (name, file) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${J(name)}, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${R(file)} } } })`;
console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const every = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every minute', parameters: { rule: { interval: [ { field: 'minutes', minutesInterval: 1 } ] } } } });
const settings = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Settings', parameters: { mode: 'manual', assignments: { assignments: [ { id: 'cfg-project', name: 'projectId', value: 'poster-pilot-8d35e', type: 'string' }, { id: 'cfg-dry', name: 'dryRun', value: true, type: 'boolean' }, { id: 'cfg-test', name: 'testNames', value: '', type: 'string' } ] } } } });
const version = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read version', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, credentials: ${FB}, parameters: { method: 'GET', url: expr(${J(FS + '/prices/_meta')}), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', options: { timeout: 30000 } } } });
const gate = ${code('Anything new?', 'gate.js')};
const list = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read price list', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, credentials: ${FB}, parameters: { method: 'GET', url: expr(${J(FS + '/prices?pageSize=100')}), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', options: { timeout: 60000 } } } });
const plan = ${code('What to send', 'plan.js')};
const reads = ${code('Website reads', 'reads.js')};
const read = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read website product', onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, credentials: ${WOO}, parameters: { method: 'GET', url: expr('{{ $json.url }}'), authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', options: { timeout: 30000, batching: { batch: { batchSize: 1, batchInterval: 300 } } } } } });
const prep = ${code('Build website changes', 'prepare.js')};
const group = ${code('Group into batches', 'batch.js')};
const send = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Send to website', onError: 'continueRegularOutput', credentials: ${WOO}, parameters: { method: 'POST', url: expr('{{ $json.url }}'), authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.body) }}'), options: { timeout: 60000, batching: { batch: { batchSize: 1, batchInterval: 300 } } } } } });
const sendIt = ifElse({ version: 2.2, config: { name: 'Send it?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [ { id: 's1', leftValue: expr('{{ $json.method }}'), rightValue: 'POST', operator: { type: 'string', operation: 'equals' } } ], combinator: 'and' }, options: {} } } });
const results = ${code('Save results to the app', 'results.js')};
const has = ifElse({ version: 2.2, config: { name: 'Anything to save?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [ { id: 'c1', leftValue: expr('{{ $json.writes.length }}'), rightValue: 0, operator: { type: 'number', operation: 'gt' } } ], combinator: 'and' }, options: {} } } });
const save = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Save to the app', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, credentials: ${FB}, parameters: { method: 'POST', url: expr(${J(FS + ':batchWrite')}), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ { writes: $json.writes } }}'), options: { timeout: 60000 } } } });
export default workflow('website-sync', 'Static OS - Website sync')
  .add(every).to(settings).to(version).to(gate).to(list).to(plan).to(reads).to(read).to(prep).to(group).to(sendIt.onTrue(send.to(results)).onFalse(results))
  .add(results).to(has.onTrue(save));
`);
