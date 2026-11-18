// Prints n8n Workflow SDK code for "Static OS - Website orders": node n8n/orders/build.cjs
const fs = require('fs');
const J = JSON.stringify;
const COMMON = fs.readFileSync(__dirname + '/common.js', 'utf8');
const R = (f, common) => J((common ? COMMON + '\n' : '') + fs.readFileSync(__dirname + '/' + f, 'utf8'));
const FB = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const WOO = "{ wooCommerceApi: { id: 'coKsvik1ximz06rn', name: 'Static website' } }";
const FS = "https://firestore.googleapis.com/v1/projects/{{ $('Settings').first().json.projectId }}/databases/(default)/documents";
// The webhook's address and its signing secret are secrets: they live only in n8n, never in this (public) repository.
// To print the workflow with the real ones, pass them in: HOOK_PATH=static-website-order-<hex> HOOK_SECRET=<hex> node ...
const PATH = process.env.HOOK_PATH || 'static-website-order-SECRET-ADDRESS-KEPT-IN-N8N';
const SECRET = process.env.HOOK_SECRET || 'SIGNING-SECRET-KEPT-IN-N8N';
const DT = "{ __rl: true, mode: 'id', value: 'qRho6PXhcLVZDIrj', cachedResultName: 'Static OS - website hook timing' }";
const code = (name, file, common = true) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${J(name)}, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${R(file, common)} } } })`;
const cond = (name, left) => `ifElse({ version: 2.2, config: { name: ${J(name)}, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [ { id: ${J(name)}, leftValue: expr(${J(left)}), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' }, options: {} } } })`;
const fsPost = (name, path, body, more = '') => `node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: ${J(name)}${more}, credentials: ${FB}, parameters: { method: 'POST', url: expr(${J(FS + path)}), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr(${J(body)}), options: { timeout: 60000 } } } })`;
const QUERY = '{{ JSON.stringify({ structuredQuery: { from: [{ collectionId: "orders" }], where: { compositeFilter: { op: "OR", filters: [ { fieldFilter: { field: { fieldPath: "want" }, op: "IN", value: { arrayValue: { values: ["on-hold", "processing", "completed", "cancelled"].map(s => ({ stringValue: s })) } } } }, { fieldFilter: { field: { fieldPath: "push" }, op: "EQUAL", value: { booleanValue: true } } } ] } }, limit: 50 } }) }}';
console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const hook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Website order changed', parameters: { httpMethod: 'POST', path: ${J(PATH)}, responseMode: 'onReceived', options: { rawBody: true } } } });
const sign = node({ type: 'n8n-nodes-base.crypto', version: 1, config: { name: 'Sign the call', onError: 'continueRegularOutput', parameters: { action: 'hmac', type: 'SHA256', binaryData: true, binaryPropertyName: 'data', dataPropertyName: 'sig', encoding: 'base64', secret: ${J(SECRET)} } } });
const check = ${code('Real order change?', 'hook-check.js', false)};
const remember = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Remember this call', parameters: { resource: 'row', operation: 'upsert', dataTableId: ${DT}, matchType: 'allConditions', filters: { conditions: [ { keyName: 'key', condition: 'eq', keyValue: 'orders' } ] }, columns: { mappingMode: 'defineBelow', value: { key: 'orders', lastHook: expr('{{ $json.t }}') }, matchingColumns: [], schema: [ { id: 'key', displayName: 'key', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'lastHook', displayName: 'lastHook', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true } ] }, options: {} } } });
const wait = node({ type: 'n8n-nodes-base.wait', version: 1.1, config: { name: 'Wait for more calls', parameters: { resume: 'timeInterval', amount: 30, unit: 'seconds' } } });
const timing = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Read timing', alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: ${DT}, matchType: 'allConditions', filters: { conditions: [ { keyName: 'key', condition: 'eq', keyValue: 'orders' } ] }, returnAll: false, limit: 5 } } });
const newest = ${code('Newest call?', 'newest.js', false)};
const started = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Remember start', parameters: { resource: 'row', operation: 'upsert', dataTableId: ${DT}, matchType: 'allConditions', filters: { conditions: [ { keyName: 'key', condition: 'eq', keyValue: 'orders' } ] }, columns: { mappingMode: 'defineBelow', value: { key: 'orders', lastStart: expr('{{ Date.now() }}') }, matchingColumns: [], schema: [ { id: 'key', displayName: 'key', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'lastStart', displayName: 'lastStart', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true } ] }, options: {} } } });
const hourly = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every hour', parameters: { rule: { interval: [ { field: 'hours', hoursInterval: 1, triggerAtMinute: 40 } ] } } } });
const asked = trigger({ type: 'n8n-nodes-base.executeWorkflowTrigger', version: 1.1, config: { name: 'When app asks', parameters: { inputSource: 'passthrough' } } });
const settings = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Settings', executeOnce: true, parameters: { mode: 'manual', assignments: { assignments: [ { id: 's-project', name: 'projectId', value: 'poster-pilot-8d35e', type: 'string' }, { id: 's-dry', name: 'dryRun', value: false, type: 'boolean' }, { id: 's-days', name: 'sinceDays', value: 30, type: 'number' }, { id: 's-backfill', name: 'backfill', value: '', type: 'string' } ] } } } });
const toSend = ${fsPost('Find orders to send', ':runQuery', QUERY, ", alwaysOutputData: true, retryOnFail: true, maxTries: 2, waitBetweenTries: 3000")};
const sendPlan = ${code('What to send', 'send-plan.js')};
const sendIt = ${cond('Send?', '{{ $json.send }}')};
const readWeb = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read orders to change', alwaysOutputData: true, onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, credentials: ${WOO}, parameters: { method: 'GET', url: expr('{{ $json.readUrl }}'), authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', options: { timeout: 60000 } } } });
const buildSend = ${code('Build the website update', 'build-send.js')};
const send = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Send to website', onError: 'continueRegularOutput', credentials: ${WOO}, parameters: { method: 'POST', url: 'https://static-eg.com/wp-json/wc/v3/orders/batch', authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.body) }}'), options: { timeout: 60000 } } } });
const results = ${code('Save what the website answered', 'send-results.js')};
const saveSent = ${fsPost('Save sends to the app', ':batchWrite', '{{ JSON.stringify({ writes: $json.writes }) }}', ", onError: 'continueRegularOutput'")};
const pause = node({ type: 'n8n-nodes-base.wait', version: 1.1, config: { name: 'Pause 2 s', parameters: { resume: 'timeInterval', amount: 2, unit: 'seconds' } } });
const readPlan = ${code('Which orders to read', 'read-plan.js')};
const read = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read website orders', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, credentials: ${WOO}, parameters: { method: 'GET', url: expr('{{ $json.url }}'), authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', options: { timeout: 60000, batching: { batch: { batchSize: 1, batchInterval: 1500 } } } } } });
const toCheck = ${code('Orders to look up', 'to-check.js')};
const appRead = ${fsPost('Read app orders', ':batchGet', '{{ JSON.stringify($json.body) }}', ", retryOnFail: true, maxTries: 2, waitBetweenTries: 3000")};
const decide = ${code('Decide app changes', 'decide.js')};
const saveIt = ${cond('Save?', '{{ $json.save }}')};
const save = ${fsPost('Save to the app', ':batchWrite', '{{ JSON.stringify({ writes: $json.writes }) }}', ", onError: 'continueRegularOutput'")};
const done = ${code('Remember the read', 'remember.js')};
const hookHour = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Check webhooks hourly', parameters: { rule: { interval: [ { field: 'hours', hoursInterval: 1, triggerAtMinute: 25 } ] } } } });
const hookSettings = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Hook settings', parameters: { mode: 'manual', assignments: { assignments: [ { id: 'h-on', name: 'hooks', value: true, type: 'boolean' }, { id: 'h-url', name: 'deliveryUrl', value: ${J('https://zero.tail0ea3a8.ts.net/webhook/' + PATH)}, type: 'string' }, { id: 'h-secret', name: 'secret', value: ${J(SECRET)}, type: 'string' } ] } } } });
const readHooks = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read website webhooks', alwaysOutputData: true, retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, credentials: ${WOO}, parameters: { method: 'GET', url: 'https://static-eg.com/wp-json/wc/v3/webhooks?per_page=100', authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', options: { timeout: 30000 } } } });
const keep = ${code('Webhooks fine?', 'hook-keep.js', false)};
const fix = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Fix website webhook', credentials: ${WOO}, parameters: { method: expr('{{ $json.method }}'), url: expr('{{ $json.url }}'), authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.body) }}'), options: { timeout: 30000, batching: { batch: { batchSize: 1, batchInterval: 1500 } } } } } });
export default workflow('website-orders', 'Static OS - Website orders')
  .add(hook).to(sign).to(check).to(remember).to(wait).to(timing).to(newest).to(started).to(settings)
  .add(hourly).to(settings)
  .add(asked).to(settings)
  .add(settings).to(toSend).to(sendPlan).to(sendIt.onTrue(readWeb.to(buildSend).to(send).to(results).to(saveSent).to(pause).to(readPlan)).onFalse(readPlan))
  .add(readPlan).to(read).to(toCheck).to(appRead).to(decide).to(saveIt.onTrue(save.to(done)))
  .add(hookHour).to(hookSettings).to(readHooks).to(keep).to(fix)
;
`);
