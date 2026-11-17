// Prints n8n Workflow SDK code for the one-time "TEMP - Import old online sales sheet": node n8n/orders/sheet-build.cjs
const fs = require('fs');
const J = JSON.stringify;
const FB = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const GS = "{ googleSheetsOAuth2Api: { id: 'a9IhhSL1IAi2nC78', name: 'Google Sheets account' } }";
const SHEET = '1Pn32YEkyHh7uhHZpCmDsUOJy8ZANpmhQnmX95vzaCRw';
const TABS = ['ردود النموذج 2', 'شهر 3', 'شهر 4', 'شهر 5', ' شهر 6', 'شهر 7', ' شهر 8', 'شهر 9', 'شهر 10', 'شهر 11'];
const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values:batchGet?valueRenderOption=FORMATTED_VALUE&` + TABS.map(t => 'ranges=' + encodeURIComponent(`'${t}'!A1:Q3000`)).join('&');
const FS = "https://firestore.googleapis.com/v1/projects/{{ $('Settings').first().json.projectId }}/databases/(default)/documents";
const QUERY = '{{ JSON.stringify({ structuredQuery: { from: [{ collectionId: "orders" }], limit: 3000 } }) }}';
console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const start = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Start' } });
const settings = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Settings', parameters: { mode: 'manual', assignments: { assignments: [ { id: 's-project', name: 'projectId', value: 'poster-pilot-8d35e', type: 'string' }, { id: 's-dry', name: 'dryRun', value: true, type: 'boolean' } ] } } } });
const sheet = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read the sheet', credentials: ${GS}, parameters: { method: 'GET', url: ${J(url)}, authentication: 'predefinedCredentialType', nodeCredentialType: 'googleSheetsOAuth2Api', options: { timeout: 60000 } } } });
const app = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read app orders', executeOnce: true, credentials: ${FB}, parameters: { method: 'POST', url: expr(${J(FS + ':runQuery')}), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr(${J(QUERY)}), options: { timeout: 60000 } } } });
const plan = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Plan the import', executeOnce: true, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J(fs.readFileSync(__dirname + '/sheet-import.js', 'utf8'))} } } });
const saveIt = ifElse({ version: 2.2, config: { name: 'Save?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [ { id: 'save', leftValue: expr('{{ $json.save }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' }, options: {} } } });
const save = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Save to the app', onError: 'continueRegularOutput', credentials: ${FB}, parameters: { method: 'POST', url: expr(${J(FS + ':batchWrite')}), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ writes: $json.writes }) }}'), options: { timeout: 60000, batching: { batch: { batchSize: 1, batchInterval: 1000 } } } } } });
export default workflow('sheet-import', 'TEMP - Import old online sales sheet')
  .add(start).to(settings).to(sheet).to(app).to(plan).to(saveIt.onTrue(save))
;
`);
