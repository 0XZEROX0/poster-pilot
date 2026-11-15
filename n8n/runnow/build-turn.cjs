// Prints the n8n Workflow SDK code of "Static OS - Run turn" (sub-workflow) from the Code node files here.
const fs = require('fs');
const rd = f => JSON.stringify(fs.readFileSync(__dirname + '/' + f, 'utf8'));
const FS = 'https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents';
const DOCX = "'projects/poster-pilot-8d35e/databases/(default)/documents/status/run_' + String($('When asked').first().json.key || '').replace(/[^A-Za-z0-9_-]/g, '')";
const cred = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const ifc = (name, e) => `ifElse({ version: 2.2, config: { name: ${JSON.stringify(name)}, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr(${JSON.stringify(e)}), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } })`;
process.stdout.write(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const asked = trigger({ type: 'n8n-nodes-base.executeWorkflowTrigger', version: 1.1, config: { name: 'When asked', parameters: { inputSource: 'workflowInputs', workflowInputs: { values: [ { name: 'op', type: 'string' }, { name: 'key', type: 'string' }, { name: 'seconds', type: 'number' }, { name: 'wait', type: 'boolean' }, { name: 'updateTime', type: 'string' }, { name: 'by', type: 'string' } ] } } } });
const isGive = ${ifc('Give back?', "{{ $json.op === 'give' }}")};
const give = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Give back turn', onError: 'continueRegularOutput', alwaysOutputData: true, credentials: ${cred}, parameters: { method: 'POST', url: '${FS}:commit', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr("{{ { writes: $('When asked').first().json.updateTime ? [{ update: { name: ${DOCX.replace(/"/g, '\\"')}, fields: { until: { integerValue: '0' }, by: { stringValue: 'free' } } }, currentDocument: { updateTime: $('When asked').first().json.updateTime } }] : [] } }}"), options: { timeout: 30000 } } } });
const read = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read turn', onError: 'continueRegularOutput', alwaysOutputData: true, credentials: ${cred}, parameters: { method: 'GET', url: expr("${FS}/status/run_{{ String($('When asked').first().json.key || '').replace(/[^A-Za-z0-9_-]/g, '') }}"), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', options: { timeout: 30000 } } } });
const plan = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Plan turn', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${rd('turn-plan.js')} } } });
const free = ${ifc('Free?', '{{ $json.go === true }}')};
const take = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Take turn', onError: 'continueRegularOutput', alwaysOutputData: true, credentials: ${cred}, parameters: { method: 'POST', url: '${FS}:commit', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ $json.body }}'), options: { timeout: 30000 } } } });
const result = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Turn result', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${rd('turn-result.js')} } } });
const lost = ${ifc('Lost it?', "{{ $json.turn === 'lost' }}")};
const again = ${ifc('Try again?', '{{ $json.retry === true && $runIndex < 9 }}')};
const pause = node({ type: 'n8n-nodes-base.wait', version: 1.1, config: { name: 'Wait 10 seconds', parameters: { resume: 'timeInterval', amount: 10, unit: 'seconds' } } });
const answer = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Answer', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${rd('turn-answer.js')} } } });

export default workflow('static-os-run-turn', 'Static OS - Run turn')
  .add(asked)
  .to(isGive
    .onTrue(give.to(answer))
    .onFalse(read.to(plan).to(free
      .onTrue(take.to(result).to(lost.onTrue(again.onTrue(pause).onFalse(answer)).onFalse(answer)))
      .onFalse(again))));
`);
