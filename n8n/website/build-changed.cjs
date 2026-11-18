// Prints n8n Workflow SDK code for "Static OS - Website changed": node n8n/website/build-changed.cjs
const fs = require('fs');
const J = JSON.stringify;
const R = f => J(fs.readFileSync(__dirname + '/' + f, 'utf8'));
const WOO = "{ wooCommerceApi: { id: 'coKsvik1ximz06rn', name: 'Static website' } }";
// The webhook's address and its signing secret are secrets: they live only in n8n, never in this (public) repository.
// To print the workflow with the real ones, pass them in: HOOK_PATH=static-website-changed-<hex> HOOK_SECRET=<hex> node ...
const PATH = process.env.HOOK_PATH || 'static-website-changed-SECRET-ADDRESS-KEPT-IN-N8N';
const SECRET = process.env.HOOK_SECRET || 'SIGNING-SECRET-KEPT-IN-N8N';
const code = (name, file) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${J(name)}, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${R(file)} } } })`;
console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const hook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Website product changed', parameters: { httpMethod: 'POST', path: ${J(PATH)}, responseMode: 'onReceived', options: { rawBody: true } } } });
const sign = node({ type: 'n8n-nodes-base.crypto', version: 1, config: { name: 'Sign the call', onError: 'continueRegularOutput', parameters: { action: 'hmac', type: 'SHA256', binaryData: true, binaryPropertyName: 'data', dataPropertyName: 'sig', encoding: 'base64', secret: ${J(SECRET)} } } });
const check = ${code('Real product change?', 'hook-check.js')};
const start = node({ type: 'n8n-nodes-base.executeWorkflow', version: 1.2, config: { name: 'Start website to app', onError: 'continueRegularOutput', parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'fHuULHd2qUV5IMAn', cachedResultName: 'Static OS - Website to app' }, mode: 'once', options: { waitForSubWorkflow: false } } } });
const hourly = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every hour', parameters: { rule: { interval: [ { field: 'hours', hoursInterval: 1, triggerAtMinute: 20 } ] } } } });
const settings = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Settings', parameters: { mode: 'manual', assignments: { assignments: [ { id: 'cfg-url', name: 'deliveryUrl', value: ${J('https://static-server.tail0ea3a8.ts.net/webhook/' + PATH)}, type: 'string' }, { id: 'cfg-secret', name: 'secret', value: ${J(SECRET)}, type: 'string' } ] } } } });
const read = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read website webhooks', alwaysOutputData: true, retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, credentials: ${WOO}, parameters: { method: 'GET', url: 'https://static-eg.com/wp-json/wc/v3/webhooks?per_page=100', authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', options: { timeout: 30000 } } } });
const keep = ${code('Webhook fine?', 'hook-keep.js')};
const needs = ifElse({ version: 2.2, config: { name: 'Fix needed?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [ { id: 'f1', leftValue: expr('{{ $json.action }}'), rightValue: 'none', operator: { type: 'string', operation: 'notEquals' } } ], combinator: 'and' }, options: {} } } });
const fix = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Fix website webhook', credentials: ${WOO}, parameters: { method: expr('{{ $json.method }}'), url: expr('{{ $json.url }}'), authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.body) }}'), options: { timeout: 30000, batching: { batch: { batchSize: 1, batchInterval: 1500 } } } } } });
export default workflow('website-changed', 'Static OS - Website changed')
  .add(hook).to(sign).to(check).to(start)
  .add(hourly).to(settings).to(read).to(keep).to(needs.onTrue(fix));
`);
