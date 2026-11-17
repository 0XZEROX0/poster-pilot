// Builds the n8n Workflow SDK code for "Static OS - Post results" from the Code node files next to it.
// node build.cjs > workflow.sdk.js, then paste into n8n's validate/create (MCP).
const fs = require('fs');
const code = f => JSON.stringify(fs.readFileSync(__dirname + '/' + f, 'utf8'));
const DB = 'https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents';
const FIRE = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const META = "{ httpHeaderAuth: { id: 'mkgnFIzTWTgamXBY', name: 'Meta Page Token' } }";
process.stdout.write(`import { workflow, node, trigger } from '@n8n/workflow-sdk';

const twiceADay = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Twice a day (10:00 and 22:00 Cairo)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 10,22 * * *' }] } } } });

const readLast = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read last results', onError: 'continueRegularOutput', parameters: {
  url: '${DB}/status/results', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', options: { timeout: 30000 } }, credentials: ${FIRE} } });

const readPosts = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read published posts', executeOnce: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, parameters: {
  method: 'POST', url: '${DB}:runQuery', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json',
  jsonBody: '={{ { structuredQuery: { from: [{ collectionId: "posts" }], select: { fields: [{ fieldPath: "fbPostId" }, { fieldPath: "fbStatus" }, { fieldPath: "igStatus" }, { fieldPath: "scheduledFor" }] }, where: { fieldFilter: { field: { fieldPath: "fbPostId" }, op: "NOT_EQUAL", value: { stringValue: "" } } } } } }}',
  options: { timeout: 60000 } }, credentials: ${FIRE} } });

const plan = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Plan asks', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${code('plan-asks.js')} } } });

const ask = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Ask Meta', onError: 'continueRegularOutput', parameters: {
  url: '={{ $json.url }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  options: { timeout: 30000, batching: { batch: { batchSize: 10, batchInterval: 1000 } } } }, credentials: ${META} } });

const sum = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Sum up', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${code('sum-up.js')} } } });

const save = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Save results for the app', retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, parameters: {
  method: 'PATCH', url: '${DB}/status/results', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json',
  jsonBody: '={{ $json.body }}', options: { timeout: 30000 } }, credentials: ${FIRE} } });

export default workflow('post-results', 'Static OS - Post results (reach and likes)')
  .add(twiceADay).to(readLast).to(readPosts).to(plan).to(ask).to(sum).to(save);
`);
