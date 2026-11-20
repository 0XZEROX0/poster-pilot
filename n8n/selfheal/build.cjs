// Prints n8n Workflow SDK code for "Static OS - Self-heal": node n8n/selfheal/build.cjs
const fs = require('fs');
const J = JSON.stringify;
const R = f => J(fs.readFileSync(__dirname + '/' + f, 'utf8'));
const WOO = "{ wooCommerceApi: { id: 'coKsvik1ximz06rn', name: 'Static website' } }";
const FB = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const META = "{ httpHeaderAuth: { id: 'mkgnFIzTWTgamXBY', name: 'Meta Page Token' } }";
const HC = "{ __rl: true, mode: 'id', value: 'apu1ktXQh3xjejyH', cachedResultName: 'Static OS - health checks' }";
const COLS = ['at', 'src', 'internet', 'website', 'meta', 'disk', 'up', 'n8n', 'note'];
const SCHEMA = J(COLS.map(c => ({ id: c, displayName: c, required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: c === 'src' || c === 'note' ? 'string' : 'number' })));
const VALUE = J(Object.fromEntries(COLS.map(c => [c, `={{ $json.${c} }}`])));
const DT = "{ __rl: true, mode: 'id', value: 'qRho6PXhcLVZDIrj', cachedResultName: 'Static OS - website hook timing' }";
console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const every = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every 15 minutes', parameters: { rule: { interval: [ { field: 'minutes', minutesInterval: 15 } ] } } } });
const settings = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Settings', parameters: { mode: 'manual', assignments: { assignments: [ { id: 's-p', name: 'projectId', value: 'poster-pilot-8d35e', type: 'string' } ] } } } });
const order = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read newest website order', onError: 'continueRegularOutput', alwaysOutputData: true, executeOnce: true, credentials: ${WOO}, parameters: { method: 'GET', url: 'https://static-eg.com/wp-json/wc/v3/orders?per_page=1&orderby=modified&order=desc&_fields=id,date_modified_gmt', authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', options: { timeout: 30000 } } } });
const timing = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Read hook timing', alwaysOutputData: true, executeOnce: true, onError: 'continueRegularOutput', parameters: { resource: 'row', operation: 'get', dataTableId: ${DT}, matchType: 'allConditions', filters: { conditions: [ { keyName: 'key', condition: 'eq', keyValue: 'orders' } ] }, returnAll: false, limit: 1 } } });
const meta = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Check Facebook token', onError: 'continueRegularOutput', alwaysOutputData: true, executeOnce: true, credentials: ${META}, parameters: { method: 'GET', url: 'https://graph.facebook.com/v26.0/me?fields=id', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 30000 } } } });
const decide = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'What needs fixing', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${R('decide.js')} } } });
const kick = ifElse({ version: 2.2, config: { name: 'Kick the website queue?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [ { id: 'k1', leftValue: expr('{{ $json.kickCron }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' }, options: {} } } });
const cron = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Kick website queue', onError: 'continueRegularOutput', parameters: { method: 'GET', url: expr('https://static-eg.com/wp-cron.php?doing_wp_cron={{ Date.now() / 1000 }}'), options: { timeout: 30000, response: { response: { neverError: true } } } } } });
const tell = ifElse({ version: 2.2, config: { name: 'Tell the app?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [ { id: 't1', leftValue: expr('{{ $json.count }}'), rightValue: 0, operator: { type: 'number', operation: 'gt' } } ], combinator: 'and' }, options: {} } } });
const save = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Write to Activity', onError: 'continueRegularOutput', credentials: ${FB}, parameters: { method: 'POST', url: expr("https://firestore.googleapis.com/v1/projects/{{ $('Settings').first().json.projectId }}/databases/(default)/documents:batchWrite"), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ writes: $(\\'What needs fixing\\').first().json.writes }) }}'), options: { timeout: 60000 } } } });
const row = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Health row', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${R('health-row.js')} } } });
const saveRow = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Save health row', onError: 'continueRegularOutput', parameters: { resource: 'row', operation: 'insert', dataTableId: ${HC}, columns: { mappingMode: 'defineBelow', value: ${VALUE}, schema: ${SCHEMA} }, options: { optimizeBulk: true } } } });
export default workflow('self-heal', 'Static OS - Self-heal')
  .add(every).to(settings).to(order).to(timing).to(meta).to(decide).to(kick.onTrue(cron))
  .add(decide).to(tell.onTrue(save))
  .add(decide).to(row).to(saveRow);
`);
