// Prints n8n Workflow SDK code for "Static OS - Merge Box/Tray pages": node n8n/website/build-merge.cjs
const fs = require('fs');
const J = JSON.stringify;
const R = f => J(fs.readFileSync(__dirname + '/' + f, 'utf8'));
const WOO = "{ wooCommerceApi: { id: 'coKsvik1ximz06rn', name: 'Static website' } }";
const API = 'https://static-eg.com/wp-json/wc/v3/products/';
const code = (name, file) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${J(name)}, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${R(file)} } } })`;
const http = (name, method, url, body, extra = '') => `node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: ${J(name)}, ${extra} credentials: ${WOO}, parameters: { method: ${J(method)}, url: expr(${J(url)}), authentication: 'predefinedCredentialType', nodeCredentialType: 'wooCommerceApi'${body ? `, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr(${J(body)})` : ''}, options: { timeout: 60000, batching: { batch: { batchSize: 1, batchInterval: 500 } } } } } })`;
console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const start = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Run by hand' } });
const settings = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Settings', parameters: { mode: 'manual', assignments: { assignments: [ { id: 'm-dry', name: 'dryRun', value: true, type: 'boolean' }, { id: 'm-groups', name: 'groups', value: '', type: 'string' }, { id: 'm-ren', name: 'renames', value: '2898=AMD Ryzen 5 7600X', type: 'string' } ] } } } });
const ids = ${code('Pages to read', 'read-ids.js')};
const read = ${http('Read pages', 'GET', API + '{{ $json.id }}', null, "retryOnFail: true, maxTries: 2, waitBetweenTries: 2000,")};
const plan = ${code('Plan the merge', 'merge-plan.js')};
const go = ifElse({ version: 2.2, config: { name: 'Change the website?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [ { id: 'g1', leftValue: expr("{{ $('Settings').first().json.dryRun }}"), rightValue: false, operator: { type: 'boolean', operation: 'false', singleValue: true } } ], combinator: 'and' }, options: {} } } });
const put = ${http('Rename and add options', 'PUT', API + "{{ $json.keep }}", '{{ JSON.stringify($json.put) }}')};
const vars = ${http('Create Box and Tray', 'POST', API + "{{ $('Plan the merge').item.json.keep }}/variations/batch", "{{ JSON.stringify($('Plan the merge').item.json.variations) }}")};
const each = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Pages to hide', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// One item per old page to turn into a draft.\\nreturn $('Plan the merge').all().flatMap(i => i.json.others.map(id => ({ json: { id } })));" } } });
const hide = ${http('Make old page a draft', 'PUT', API + '{{ $json.id }}', '{{ JSON.stringify({ status: "draft" }) }}')};
export default workflow('website-merge', 'Static OS - Merge Box/Tray pages')
  .add(start).to(settings).to(ids).to(read).to(plan).to(go.onTrue(put.to(vars).to(each).to(hide)));
`);
