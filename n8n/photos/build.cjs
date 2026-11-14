// Prints n8n Workflow SDK code for "PosterPilot - Website photos": node n8n/photos/build.cjs
const fs = require('fs');
const J = JSON.stringify;
const src = fs.readFileSync(__dirname + '/choices.js', 'utf8');
const FB = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const FS = "https://firestore.googleapis.com/v1/projects/{{ $('Settings').first().json.projectId }}/databases/(default)/documents";
const QUERY = { structuredQuery: { from: [{ collectionId: 'posts' }], where: { fieldFilter: { field: { fieldPath: 'photoAsk' }, op: 'GREATER_THAN', value: { integerValue: '0' } } }, limit: 20 } };
console.log(`import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';
const every = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every 30 seconds', parameters: { rule: { interval: [ { field: 'seconds', secondsInterval: 30 } ] } } } });
const settings = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Settings', parameters: { mode: 'manual', assignments: { assignments: [ { id: 'cfg-project', name: 'projectId', value: 'poster-pilot-8d35e', type: 'string' } ] } } } });
const find = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Find photo requests', retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, credentials: ${FB}, parameters: { method: 'POST', url: expr(${J(FS + ':runQuery')}), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${J(J(QUERY))}, options: { timeout: 60000 } } } });
const look = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Find website photos', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J(src)} } } });
const save = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Save photos to the app', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, credentials: ${FB}, parameters: { method: 'POST', url: expr(${J(FS + ':batchWrite')}), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ { writes: $json.writes } }}'), options: { timeout: 60000 } } } });
export default workflow('website-photos', 'PosterPilot - Website photos')
  .add(every).to(settings).to(find).to(look).to(save);
`);
