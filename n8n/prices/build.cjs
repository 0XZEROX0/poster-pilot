// Prints n8n Workflow SDK code for "PosterPilot - Import price list (one time)": node n8n/prices/build.cjs
const fs = require('fs');
const J = JSON.stringify;
const src = fs.readFileSync(__dirname + '/import.js', 'utf8');
const tabs = ['CPU', 'MB', 'RAM', 'VGA', 'SSD', 'Case', 'PSU', 'Cooler', 'Case Fans', 'Monitor', 'Acc', 'ACC FAN', 'Thermalpaste', 'Laptop'];
const ranges = tabs.map(t => 'ranges=' + encodeURIComponent("'" + t + "'!A1:G1500")).join('&');
const FB = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const SHEETS = "{ googleSheetsOAuth2Api: { id: 'a9IhhSL1IAi2nC78', name: 'Google Sheets account' } }";
const FS = 'https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents';
console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const start = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Start' } });
const settings = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Settings', parameters: { mode: 'manual', assignments: { assignments: [ { id: 'pl', name: 'priceList', value: '14scq7SUzHD86g7bhi5eadrcZbCHLVqg8Etj5a90sZ98', type: 'string' }, { id: 'dry', name: 'dryRun', value: true, type: 'boolean' } ] } } } });
const sheet = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read price list', executeOnce: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, credentials: ${SHEETS}, parameters: { method: 'GET', url: expr(${J('https://sheets.googleapis.com/v4/spreadsheets/{{ $json.priceList }}/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&' + ranges)}), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleSheetsOAuth2Api', options: { timeout: 60000 } } } });
const meta = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read meta', executeOnce: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, credentials: ${FB}, parameters: { method: 'POST', url: ${J(FS + ':batchGet')}, authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${J(J({ documents: ['projects/poster-pilot-8d35e/databases/(default)/documents/prices/_meta'] }))}, options: { timeout: 60000 } } } });
const plan = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Plan import', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J(src)} } } });
const go = ifElse({ version: 2.2, config: { name: 'Write?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: expr('{{ $json.writes.length > 0 }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });
const save = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Save to database', credentials: ${FB}, parameters: { method: 'POST', url: ${J(FS + ':batchWrite')}, authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ { writes: $json.writes } }}'), options: { timeout: 60000 } } } });
export default workflow('price-import', 'PosterPilot - Import price list (one time)')
  .add(start).to(settings).to(sheet).to(meta).to(plan).to(go.onTrue(save));
`);
