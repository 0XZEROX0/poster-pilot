// Prints n8n Workflow SDK code for "Static OS - Website changed": node n8n/website/build-changed.cjs
const fs = require('fs');
const J = JSON.stringify;
const R = f => J(fs.readFileSync(__dirname + '/' + f, 'utf8'));
const WOO = "{ wooCommerceApi: { id: 'coKsvik1ximz06rn', name: 'Static website' } }";
const PATH = 'static-website-changed-e20537324b02e574c766d104';
const code = (name, file) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${J(name)}, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${R(file)} } } })`;
console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const hook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Website product changed', parameters: { httpMethod: 'POST', path: ${J(PATH)}, responseMode: 'onReceived', options: { noResponseBody: true } } } });
const check = ${code('Real product change?', 'hook-check.js')};
const start = node({ type: 'n8n-nodes-base.executeWorkflow', version: 1.2, config: { name: 'Start website to app', onError: 'continueRegularOutput', parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'fHuULHd2qUV5IMAn', cachedResultName: 'Static OS - Website to app' }, mode: 'once', options: { waitForSubWorkflow: false } } } });
const hourly = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every hour', parameters: { rule: { interval: [ { field: 'hours', hoursInterval: 1, triggerAtMinute: 20 } ] } } } });
const settings = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Settings', parameters: { mode: 'manual', assignments: { assignments: [ { id: 'cfg-url', name: 'deliveryUrl', value: ${J('https://zero.tail0ea3a8.ts.net/webhook/' + PATH)}, type: 'string' } ] } } } });
const read = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read website webhooks', alwaysOutputData: true, retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, credentials: ${WOO}, parameters: { method: 'GET', url: 'https://static-eg.com/wp-json/wc/v3/webhooks?per_page=100', authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', options: { timeout: 30000 } } } });
const keep = ${code('Webhook fine?', 'hook-keep.js')};
const needs = ifElse({ version: 2.2, config: { name: 'Fix needed?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [ { id: 'f1', leftValue: expr('{{ $json.action }}'), rightValue: 'none', operator: { type: 'string', operation: 'notEquals' } } ], combinator: 'and' }, options: {} } } });
const fix = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Fix website webhook', credentials: ${WOO}, parameters: { method: expr('{{ $json.method }}'), url: expr('{{ $json.url }}'), authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.body) }}'), options: { timeout: 30000 } } } });
export default workflow('website-changed', 'Static OS - Website changed')
  .add(hook).to(check).to(start)
  .add(hourly).to(settings).to(read).to(keep).to(needs.onTrue(fix));
`);
