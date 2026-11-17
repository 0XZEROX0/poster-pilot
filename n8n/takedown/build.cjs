// Prints n8n Workflow SDK code for "Static OS - Delete from Facebook and Instagram": node build.cjs
const fs = require('fs');
const rd = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
const J = JSON.stringify;
const FS = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const META = "{ httpHeaderAuth: { id: 'mkgnFIzTWTgamXBY', name: 'Meta Page Token' } }";
const DB = 'https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents';
const QUERY = { structuredQuery: { from: [{ collectionId: 'posts' }], where: { fieldFilter: { field: { fieldPath: 'takeDown' }, op: 'IN', value: { arrayValue: { values: [{ stringValue: 'asked' }, { stringValue: 'working' }] } } } }, limit: 20 } };
console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const asked = trigger({ type: 'n8n-nodes-base.executeWorkflowTrigger', version: 1.1, config: { name: 'When app asks', parameters: { inputSource: 'passthrough' } } });
const hourly = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every hour (safety)', parameters: { rule: { interval: [ { field: 'hours', hoursInterval: 1 } ] } } } });
const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Run Now (manual)' } });
const find = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Find posts to remove', executeOnce: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, credentials: ${FS}, parameters: { method: 'POST', url: '${DB}:runQuery', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${J(J(QUERY))}, options: { timeout: 60000 } } } });
const plan = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Plan', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J(rd('plan.js'))} } } });
const claim = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Claim posts', retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, credentials: ${FS}, parameters: { method: 'POST', url: '${DB}:batchWrite', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ { writes: $json.writes } }}'), options: { timeout: 60000 } } } });
const each = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'One post each', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J(rd('one-each.js'))} } } });
const delFb = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Delete Facebook post', onError: 'continueRegularOutput', credentials: ${META}, notes: 'Deletes the published Page post. No retry: an answer that got lost is checked by the next run (an already deleted post counts as removed).', parameters: { method: 'DELETE', url: expr('https://graph.facebook.com/v26.0/{{ $json.fbPostId || "0" }}'), authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 30000 } } } });
const hasIg = ifElse({ version: 2.2, config: { name: 'On Instagram?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: expr("{{ !!$('One post each').item.json.igId }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });
const delIg = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Delete Instagram post', onError: 'continueRegularOutput', credentials: ${META}, notes: 'Deletes the Instagram post (Instagram API with Facebook Login, needs instagram_manage_contents on the Meta Page Token).', parameters: { method: 'DELETE', url: expr("https://graph.facebook.com/v26.0/{{ $('One post each').item.json.igId }}"), authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 30000 } } } });
const noIg = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Not on Instagram', parameters: { mode: 'manual', assignments: { assignments: [ { id: 'noig', name: 'noIg', value: true, type: 'boolean' } ] } } } });
const result = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Result', parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: ${J(rd('result.js'))} } } });
const save = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Save result', retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, credentials: ${FS}, parameters: { method: 'POST', url: '${DB}:batchWrite', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ { writes: $json.writes } }}'), options: { timeout: 60000 } } } });
export default workflow('static-os-takedown', 'Static OS - Delete from Facebook and Instagram')
  .add(asked).to(find)
  .add(hourly).to(find)
  .add(manual).to(find)
  .add(find).to(plan).to(claim).to(each).to(delFb).to(hasIg.onTrue(delIg.to(result)).onFalse(noIg.to(result)))
  .add(result).to(save);
`);
