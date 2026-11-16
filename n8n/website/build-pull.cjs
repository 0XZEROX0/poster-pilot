// Prints n8n Workflow SDK code for "Static OS - Website to app": node n8n/website/build-pull.cjs
const fs = require('fs');
const J = JSON.stringify;
const R = f => J(fs.readFileSync(__dirname + '/' + f, 'utf8'));
const FB = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const WOO = "{ wooCommerceApi: { id: 'coKsvik1ximz06rn', name: 'Static website' } }";
const FS = "https://firestore.googleapis.com/v1/projects/{{ $('Settings').first().json.projectId }}/databases/(default)/documents";
const code = (name, file) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${J(name)}, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${R(file)} } } })`;
const cond = (name, left, op) => `ifElse({ version: 2.2, config: { name: ${J(name)}, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [ { id: ${J(name)}, leftValue: expr(${J(left)}), rightValue: '', operator: ${op} } ], combinator: 'and' }, options: {} } } })`;
const TRUE = "{ type: 'boolean', operation: 'true', singleValue: true }";
console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const every = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every minute', parameters: { rule: { interval: [ { field: 'minutes', minutesInterval: 1 } ] } } } });
const settings = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Settings', parameters: { mode: 'manual', assignments: { assignments: [ { id: 'p-project', name: 'projectId', value: 'poster-pilot-8d35e', type: 'string' }, { id: 'p-dry', name: 'dryRun', value: true, type: 'boolean' } ] } } } });
const version = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read version', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, credentials: ${FB}, parameters: { method: 'GET', url: expr(${J(FS + '/prices/_meta')}), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', options: { timeout: 30000 } } } });
const gate = ${code('Refresh links?', 'pull-gate.js')};
const refresh = ${cond('Read the price list?', '{{ $json.refresh }}', TRUE)};
const list = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read price list', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, credentials: ${FB}, parameters: { method: 'GET', url: expr(${J(FS + '/prices?pageSize=100')}), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', options: { timeout: 60000 } } } });
const links = ${code('Links to check', 'pull-links.js')};
const web = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read website', onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, credentials: ${WOO}, parameters: { method: 'GET', url: expr('{{ $json.url }}'), authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', options: { timeout: 30000, batching: { batch: { batchSize: 1, batchInterval: 300 } } } } } });
const find = ${code('Find website changes', 'pull-find.js')};
const cat = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read category', onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, credentials: ${FB}, parameters: { method: 'GET', url: expr(${J(FS + '/prices/{{ $json.cat }}')}), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', options: { timeout: 30000 } } } });
const decide = ${code('Decide and build changes', 'pull-decide.js')};
const sendIt = ${cond('Save it?', '{{ $json.send }}', TRUE)};
const save = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Save to the app', onError: 'continueRegularOutput', credentials: ${FB}, parameters: { method: 'POST', url: expr(${J(FS + ':commit')}), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ writes: $json.writes }) }}'), options: { timeout: 60000, batching: { batch: { batchSize: 1, batchInterval: 300 } } } } } });
const remember = ${code('Remember what was saved', 'pull-remember.js')};
export default workflow('website-pull', 'Static OS - Website to app')
  .add(every).to(settings).to(version).to(gate).to(refresh.onTrue(list.to(links)).onFalse(links))
  .add(links).to(web).to(find).to(cat).to(decide).to(sendIt.onTrue(save.to(remember)));
`);
