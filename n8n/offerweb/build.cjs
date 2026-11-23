// Prints n8n Workflow SDK code for "Static OS - Offer to website" (VxHTLa1Rv6xqbgH8): node build.cjs
// The poster webhook has a path with a parameter, so n8n puts its webhookId in the address
// (.../webhook/d4c1dd09-58b2-4dce-8b84-26010d881e3b/offer-poster/:file); POSTER in build.js uses it.
const fs = require('fs');
const rd = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
const J = JSON.stringify;
const FS = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const WOO = "{ wooCommerceApi: { id: 'coKsvik1ximz06rn', name: 'Static website' } }";
const DRIVE = "{ googleDriveOAuth2Api: { id: 'DGga87o4UiwLGddI', name: 'Google Drive account' } }";
const DB = 'https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents';
const QUERY = { structuredQuery: { from: [{ collectionId: 'posts' }], where: { fieldFilter: { field: { fieldPath: 'webAdd' }, op: 'IN', value: { arrayValue: { values: ['asked', 'working', 'remove', 'scheduled'].map(s => ({ stringValue: s })) } } } }, limit: 30 } };
const code = (name, file, each) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${J(name)}, parameters: { mode: '${each ? 'runOnceForEachItem' : 'runOnceForAllItems'}', language: 'javaScript', jsCode: ${J(rd(file))} } } })`;
const fsPost = (name, path, body, extra = '') => `node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: ${J(name)}${extra}, credentials: ${FS}, parameters: { method: 'POST', url: '${DB}${path}', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${body}, options: { timeout: 60000 } } } })`;
console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const asked = trigger({ type: 'n8n-nodes-base.executeWorkflowTrigger', version: 1.1, config: { name: 'When app asks', parameters: { inputSource: 'passthrough' } } });
const hourly = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every hour (safety)', parameters: { rule: { interval: [ { field: 'hours', hoursInterval: 1, triggerAtMinute: 7 } ] } } } });
const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Run Now (manual)' } });
const find = ${fsPost('Find posts for the website', ':runQuery', J(J(QUERY)), ', executeOnce: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000')};
const plan = ${code('Plan', 'plan.js')};
const claim = ${fsPost('Claim posts', ':batchWrite', "expr('{{ { writes: $json.writes } }}')", ', retryOnFail: true, maxTries: 3, waitBetweenTries: 3000')};
const brands = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read brands', executeOnce: true, retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, credentials: ${WOO}, parameters: { method: 'GET', url: 'https://static-eg.com/wp-json/wc/v3/products/brands?per_page=100&_fields=id,name,slug', authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', options: { timeout: 60000 } } } });
const build = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Build', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J(rd('build.js'))} } } });
const call = ifElse({ version: 2.2, config: { name: 'Website call?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: expr('{{ $json.call }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });
const send = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Send to website', onError: 'continueRegularOutput', credentials: ${WOO}, notes: 'POST /products makes the product, POST /products/{id} changes it. No retry: the website fetches the poster during this call.', parameters: { method: 'POST', url: expr('{{ $json.url }}'), authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.body) }}'), options: { timeout: 120000, batching: { batch: { batchSize: 1, batchInterval: 1000 } } } } } });
const keep = ${code('Keep answer', 'keep.js', true)};
const result = ${code('Result', 'result.js', true)};
const save = ${fsPost('Save result', ':batchWrite', "expr('{{ { writes: $json.writes } }}')", ', retryOnFail: true, maxTries: 3, waitBetweenTries: 3000')};
const hook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Poster link', parameters: { httpMethod: 'GET', path: 'offer-poster/:file', responseMode: 'responseNode', options: {} } } });
const readPost = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read the post', onError: 'continueRegularOutput', credentials: ${FS}, parameters: { method: 'GET', url: expr("${DB}/posts/{{ String($json.params.file || '').split('-')[0].replace(/[^A-Za-z0-9]/g, '') || 'none' }}"), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', options: { timeout: 30000 } } } });
const check = ${code('Is it that poster?', 'poster-check.js')};
const okPoster = ifElse({ version: 2.2, config: { name: 'That poster?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: expr('{{ $json.ok }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });
const download = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Download poster', credentials: ${DRIVE}, parameters: { method: 'GET', url: expr('https://www.googleapis.com/drive/v3/files/{{ $json.driveId }}?alt=media'), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api', options: { timeout: 60000, response: { response: { responseFormat: 'file' } } } } } });
const give = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.1, config: { name: 'Give the poster', parameters: { respondWith: 'binary', inputDataFieldName: 'data', options: { responseHeaders: { entries: [ { name: 'Content-Type', value: 'image/jpeg' }, { name: 'Cache-Control', value: 'no-store' } ] } } } } });
const refuse = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.1, config: { name: 'Not found', parameters: { respondWith: 'text', responseBody: 'Not found', options: { responseCode: 404 } } } });
export default workflow('static-os-offer-website', 'Static OS - Offer to website')
  .add(asked).to(find)
  .add(hourly).to(find)
  .add(manual).to(find)
  .add(find).to(plan).to(claim).to(brands).to(build).to(call.onTrue(send.to(keep.to(result))).onFalse(result))
  .add(result).to(save)
  .add(hook).to(readPost).to(check).to(okPoster.onTrue(download.to(give)).onFalse(refuse));
`);
