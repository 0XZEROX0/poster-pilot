// Prints n8n Workflow SDK code for "Static OS - Health": HEALTH_SERVER_KEY=... node n8n/health/build.cjs
// The key the server's watchdog sends is not kept in this repository: it lives in this workflow's
// "Server report" node and in /etc/static-watchdog/health.key on the server.
const fs = require('fs');
const J = JSON.stringify;
const R = f => J(fs.readFileSync(__dirname + '/' + f, 'utf8'));
const FS = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const ORIGIN = 'https://0xzerox0.github.io';
const KEY = 'AIzaSyAKE9xRlRdLBu3DUr6R2mtE5_duDWX1-3Q';
const SERVER_KEY = process.env.HEALTH_SERVER_KEY || 'SET-HEALTH_SERVER_KEY';
const CHECKS = "{ __rl: true, mode: 'id', value: 'apu1ktXQh3xjejyH', cachedResultName: 'Static OS - health checks' }";
const EVENTS = "{ __rl: true, mode: 'id', value: 'xYrBOSsD41fvqu9O', cachedResultName: 'Static OS - health events' }";
const CHECK_COLS = { at: 'number', src: 'string', internet: 'number', website: 'number', meta: 'number', disk: 'number', up: 'number', n8n: 'number', note: 'string' };
const EVENT_COLS = { at: 'number', kind: 'string', title: 'string', detail: 'string', wf: 'string', wfId: 'string', node: 'string', exec: 'string', who: 'string' };
const insert = (v, name, table, cols, extra) => {
  const value = Object.keys(cols).map(k => `${k}: expr(${J('{{ $json.' + k + ' }}')})`).join(', ');
  const schema = Object.entries(cols).map(([k, t]) => `{ id: '${k}', displayName: '${k}', required: false, defaultMatch: false, display: true, type: '${t}', canBeUsedToMatch: true }`).join(', ');
  return `const ${v} = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: ${J(name)}, onError: 'continueRegularOutput'${extra || ''}, parameters: { resource: 'row', operation: 'insert', dataTableId: ${table}, columns: { mappingMode: 'defineBelow', value: { ${value} }, schema: [ ${schema} ] }, options: { optimizeBulk: true } } } });`;
};
const read = (v, name, table, since) => `const ${v} = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: ${J(name)}, alwaysOutputData: true, executeOnce: true, onError: 'continueRegularOutput', parameters: { resource: 'row', operation: 'get', dataTableId: ${table}, matchType: 'allConditions', filters: { conditions: [ { keyName: 'at', condition: 'gte', keyValue: expr(${J('{{ ' + since + ' }}')}) } ] }, returnAll: true } } });`;
const del = (v, name, table, days) => `const ${v} = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: ${J(name)}, executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { resource: 'row', operation: 'deleteRows', dataTableId: ${table}, matchType: 'allConditions', filters: { conditions: [ { keyName: 'at', condition: 'lt', keyValue: expr(${J('{{ Date.now() - ' + days + ' * 86400000 }}')}) } ] } } } });`;
const iff = (v, name, cond) => `const ${v} = ifElse({ version: 2.2, config: { name: ${J(name)}, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [ { id: '${v}1', leftValue: expr(${J('{{ ' + cond + ' }}')}), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' }, options: {} } } });`;
const code = (v, name, file) => `const ${v} = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${J(name)}, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${R(file)} } } });`;
const answer = (v, name, body, codeNo, once) => `const ${v} = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.4, config: { name: ${J(name)}${once ? ', executeOnce: true' : ''}, parameters: { respondWith: 'json', responseBody: expr(${J('{{ ' + body + ' }}')}), options: { ${codeNo ? 'responseCode: ' + codeNo + ', ' : ''}responseHeaders: { entries: [ { name: 'Access-Control-Allow-Origin', value: '${ORIGIN}' }, { name: 'Cache-Control', value: 'no-store' } ] } } } } });`;
const ask = (v, name, url) => `const ${v} = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: ${J(name)}, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: { method: 'GET', url: ${J(url)}, options: { timeout: 10000, response: { response: { fullResponse: true, neverError: true } } } } } });`;
const SINCE = "Date.now() - ($('Is a member').first().json.range === '7d' ? 7 * 24 + 4 : 24 + 4) * 3600000";
console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
// 1. Every 5 minutes: is there internet at the server? (A row from here also proves n8n was running.)
const every = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every 5 minutes', parameters: { rule: { interval: [ { field: 'minutes', minutesInterval: 5 } ] } } } });
${ask('google', 'Ask Google', 'https://www.google.com/generate_204')}
${ask('cloudflare', 'Ask Cloudflare', 'https://1.1.1.1/cdn-cgi/trace')}
${code('result', 'Internet result', 'check.js')}
${insert('saveCheck', 'Save check', CHECKS, CHECK_COLS)}
// 2. Any Static workflow that fails (each names this workflow as its error workflow).
const failed = trigger({ type: 'n8n-nodes-base.errorTrigger', version: 1, config: { name: 'When a workflow fails', parameters: {} } });
${code('describe', 'Describe the failure', 'failure.js')}
${insert('saveFail', 'Save failure', EVENTS, EVENT_COLS)}
// 3. The server's watchdog reports (from the server itself, with the key).
const server = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Server report', notes: 'POST from server/static-watchdog on the server: { key, lines: [{ at, internet, disk, up, n8n, note }] }.', parameters: { httpMethod: 'POST', path: 'static-os-health-server', responseMode: 'onReceived', options: { onlyRunIf: ${J("={{ $json.body?.key === '" + SERVER_KEY + "' }}")} } } } });
${code('serverLines', 'Server lines', 'server.js')}
${insert('saveServer', 'Save server lines', CHECKS, CHECK_COLS)}
// 4. The app: { token, op: get, range: 24h|7d } -> the health report; { token, op: report, errors } -> app errors.
const app = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'App asks', notes: 'From the System health page and the app-wide health dot. A signed-in member only.', parameters: { httpMethod: 'POST', path: 'static-os-health', responseMode: 'responseNode', options: { allowedOrigins: '${ORIGIN}', onlyRunIf: "={{ typeof $json.body?.token === 'string' && $json.body.token.length > 200 && $json.body.token.length < 5000 }}" } } } });
const who = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Who is asking', onError: 'continueRegularOutput', parameters: { method: 'POST', url: 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${KEY}', sendHeaders: true, headerParameters: { parameters: [ { name: 'Referer', value: '${ORIGIN}/' } ] }, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr("{{ { idToken: $('App asks').first().json.body.token } }}"), options: { timeout: 20000 } } } });
${code('known', 'Known member?', 'member.js')}
${iff('lookUp', 'Look up member?', '!!$json.uid && !$json.known')}
const member = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read member', onError: 'continueRegularOutput', alwaysOutputData: true, credentials: ${FS}, parameters: { method: 'GET', url: expr("https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents/members/{{ $json.uid }}"), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', options: { timeout: 20000 } } } });
const role = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read role', onError: 'continueRegularOutput', alwaysOutputData: true, executeOnce: true, credentials: ${FS}, parameters: { method: 'GET', url: expr("https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents/roles/{{ $json.fields?.role?.stringValue || 'none' }}"), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', options: { timeout: 20000 } } } });
${code('isMember', 'Is a member', 'remember.js')}
${iff('allowed', 'Allowed?', '$json.ok === true')}
${answer('refuse', 'Refuse', '{ ok: false, error: "Not allowed" }', 403)}
${iff('isReport', 'App error report?', "$json.op === 'report'")}
${code('appLines', 'App error lines', 'app-errors.js')}
${iff('hasLines', 'Any lines?', '!$json.skip')}
${insert('saveApp', 'Save app errors', EVENTS, EVENT_COLS, ', alwaysOutputData: true')}
${answer('thanks', 'Answer saved', '{ ok: true }', 0, true)}
${read('readChecks', 'Read checks', CHECKS, SINCE)}
${read('readEvents', 'Read events', EVENTS, SINCE)}
${code('report', 'Build health report', 'report.js')}
${answer('send', 'Answer report', "$('Build health report').first().json", 0, true)}
// 5. Every night: keep 8 days of checks and 31 days of events.
const nightly = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every night', parameters: { rule: { interval: [ { field: 'days', triggerAtHour: 3, triggerAtMinute: 15 } ] } } } });
${del('dropChecks', 'Drop old checks', CHECKS, 8)}
${del('dropEvents', 'Drop old events', EVENTS, 31)}
export default workflow('static-os-health', 'Static OS - Health')
  .add(every).to(google).to(cloudflare).to(result).to(saveCheck)
  .add(failed).to(describe).to(saveFail)
  .add(server).to(serverLines).to(saveServer)
  .add(app).to(who).to(known).to(lookUp.onTrue(member.to(role).to(isMember)).onFalse(isMember))
  .add(isMember).to(allowed
    .onTrue(isReport
      .onTrue(appLines.to(hasLines.onTrue(saveApp.to(thanks)).onFalse(thanks)))
      .onFalse(readChecks.to(readEvents.to(report.to(send)))))
    .onFalse(refuse))
  .add(nightly).to(dropChecks).to(dropEvents);
`);
