// Prints n8n Workflow SDK code for the "PosterPilot - Posts store" sub-workflow: node build.cjs store
const fs = require('fs');
const rd = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
const lib = rd('lib.js').replace(/\nif \(typeof module[^\n]*\n?$/, '\n');
const J = JSON.stringify;
const which = process.argv[2];
const CRED = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
if (which === 'store') {
  console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const called = trigger({ type: 'n8n-nodes-base.executeWorkflowTrigger', version: 1.1, config: { name: 'When called by a workflow', parameters: { inputSource: 'workflowInputs', workflowInputs: { values: [ { name: 'op', type: 'string' }, { name: 'purpose', type: 'string' }, { name: 'raw', type: 'boolean' }, { name: 'id', type: 'string' }, { name: 'cols', type: 'object' } ] } } } });
const plan = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Plan', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J(rd('store-plan.js'))} } } });
const ask = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Ask database', retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, credentials: ${CRED}, parameters: { method: 'POST', url: expr('https://firestore.googleapis.com/v1/{{ $json.url }}'), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ $json.body }}'), options: { timeout: 60000 } } } });
const apply = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Apply', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J(lib + '\n' + rd('store-apply.js'))} } } });
const hasWrites = ifElse({ version: 2.2, config: { name: 'Anything to save?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: expr("{{ $json._op === 'write' && ($json._writes || []).length > 0 }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });
const save = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Save to database', executeOnce: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, credentials: ${CRED}, parameters: { method: 'POST', url: 'https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents:batchWrite', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ { writes: $json._writes } }}'), options: { timeout: 60000 } } } });
const done = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Answer', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J(rd('store-out.js'))} } } });
const done2 = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Answer (nothing saved)', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J(rd('store-out.js'))} } } });
export default workflow('posts-store', 'PosterPilot - Posts store')
  .add(called).to(plan).to(ask).to(apply).to(hasWrites.onTrue(save.to(done)).onFalse(done2));
`);
}
const code = (v, name, src, extra = '') => `const ${v} = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${J(name)}${extra}, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J(src)} } } });`;
const http = (v, name, method, url, body, extra = '') => `const ${v} = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: ${J(name)}, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000${extra}, credentials: ${CRED}, parameters: { method: ${J(method)}, url: ${url}, authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi'${body ? `, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${body}` : ''}, options: { timeout: 60000 } } } });`;
const SHEETS = "{ googleSheetsOAuth2Api: { id: 'a9IhhSL1IAi2nC78', name: 'Google Sheets account' } }";
const DRIVE = "{ googleDriveOAuth2Api: { id: 'DGga87o4UiwLGddI', name: 'Google Drive account' } }";
const gget = (v, name, cred, credType, url, extra = '') => `const ${v} = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: ${J(name)}, executeOnce: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000${extra}, credentials: ${cred}, parameters: { method: 'GET', url: ${url}, authentication: 'predefinedCredentialType', nodeCredentialType: ${J(credType)}, options: { timeout: 60000 } } } });`;
const FS = "'https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents";
const iff = (v, name, cond) => `const ${v} = ifElse({ version: 2.2, config: { name: ${J(name)}, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: expr(${J('{{ ' + cond + ' }}')}), operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });`;
const dropFns = (src, names) => { let out = src; for (const n of names) out = out.replace(new RegExp('\\nfunction ' + n + '\\([\\s\\S]*?\\n\\}\\n'), '\n'); return out; };
const L = dropFns(lib, ['rowOf', 'applyCols', 'historyOf']).replace(/\/\*\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l) && l.trim()).join('\n') + '\n';
const strip = src => src.replace(/\/\*\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l) && l.trim()).join('\n') + '\n';
const LM = strip(dropFns(lib, ['rowOf', 'historyOf']));
const trim = (src, drop) => src.split('\n').filter(l => !drop.some(d => l.startsWith(d))).join('\n');
const SLOT = /\nconst slotted = items => \{[\s\S]*?\n\};/;
const LE = trim(L.replace(SLOT, ''), ['const HEADERS', 'const TYPED', 'const EX ', 'const ITEM_', 'const grouped', 'const nameKey', 'const working', 'const failed', 'const titleOf']);
const LP = trim(dropFns(LE, ['zoneOf', 'queuesOf']), ['const OK_FB', 'const low', 'const randomId']).replace(/\nconst logWrite = [\s\S]*?\n\};/, '');
if (which === 'migrate') {
  console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const start = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Start' } });
const settings = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Settings', parameters: { mode: 'manual', assignments: { assignments: [ { id: 'dry', name: 'dryRun', value: true, type: 'boolean' } ] } } } });
${gget('sheet', 'Read sheet', SHEETS, 'googleSheetsOAuth2Api', "'https://sheets.googleapis.com/v4/spreadsheets/1FY0-rkw5SnzUmrIrqXI7X7SUpAJhWX6J7au9A9kGPS4/values:batchGet?ranges=Posts&valueRenderOption=FORMATTED_VALUE'")}
const ids = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Read row ids', executeOnce: true, credentials: ${SHEETS}, parameters: { method: 'POST', url: 'https://sheets.googleapis.com/v4/spreadsheets/1FY0-rkw5SnzUmrIrqXI7X7SUpAJhWX6J7au9A9kGPS4/developerMetadata:search', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleSheetsOAuth2Api', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '{ "dataFilters": [ { "developerMetadataLookup": { "metadataKey": "p" } } ] }', options: {} } } });
${gget('marks', 'Read item marks', SHEETS, 'googleSheetsOAuth2Api', "'https://sheets.googleapis.com/v4/spreadsheets/1FY0-rkw5SnzUmrIrqXI7X7SUpAJhWX6J7au9A9kGPS4?ranges=Posts!A2:L&fields=sheets.data.rowData.values.userEnteredFormat.backgroundColor'")}
${http('posts', 'Read posts', 'POST', FS + ":runQuery'", "'{\"structuredQuery\":{\"from\":[{\"collectionId\":\"posts\"}]}}'", ', executeOnce: true')}
${code('mig', 'Migrate', LM + rd('migrate.js'))}
${iff('go', 'Write?', '$json.writes.length > 0')}
${http('save', 'Save to database', 'POST', FS + ":batchWrite'", "expr('{{ { writes: $json.writes } }}')")}
export default workflow('migrate', 'PosterPilot - Final copy from the sheet (one time)')
  .add(start).to(settings).to(sheet).to(ids).to(marks).to(posts).to(mig).to(go.onTrue(save));
`);
}
if (which === 'engine') {
  console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const everyMin = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every minute', parameters: { rule: { interval: [ { field: 'minutes', minutesInterval: 1 } ] } } } });
${http('find', 'Find app changes', 'POST', FS + ":runQuery'", "'{\"structuredQuery\":{\"from\":[{\"collectionId\":\"posts\"}],\"where\":{\"fieldFilter\":{\"field\":{\"fieldPath\":\"appDirty\"},\"op\":\"EQUAL\",\"value\":{\"booleanValue\":true}}},\"limit\":50}}'")}
${iff('any', 'Anything waiting?', '!!$json.document')}
${http('prod', 'Read product list', 'POST', FS + ":batchGet'", "'{\"documents\":[\"projects/poster-pilot-8d35e/databases/(default)/documents/catalog/products\"]}'", ', executeOnce: true')}
${http('last', 'Last post', 'POST', FS + ":runQuery'", "'{\"structuredQuery\":{\"from\":[{\"collectionId\":\"posts\"}],\"orderBy\":[{\"field\":{\"fieldPath\":\"order\"},\"direction\":\"DESCENDING\"}],\"limit\":1}}'", ', executeOnce: true')}
${code('planApp', 'Plan app changes', LE + rd('engine-app.js'))}
${iff('hasApp', 'Save app changes?', '$json.writes.length > 0')}
${http('saveApp', 'Save app changes', 'POST', FS + ":batchWrite'", "expr('{{ { writes: $json.writes } }}')")}
${code('toBin', 'Posters to bin', "// Posters of posts deleted in the app go to the Google Drive bin (only files in AI Designs, checked below).\nconst ids = $('Plan app changes').first().json.bin || [];\nreturn ids.map(id => ({ json: { id } }));")}
${gget('folders', 'List poster folders', DRIVE, 'googleDriveOAuth2Api', "\"https://www.googleapis.com/drive/v3/files?q='1TnAcaZSix1Nzro-X3y-jaHpK2WmSe8pf'+in+parents+and+mimeType+%3D+'application/vnd.google-apps.folder'+and+trashed+%3D+false&fields=files(id)&pageSize=200\"", ", onError: 'continueRegularOutput'")}
${code('each', 'One poster each', "return $('Posters to bin').all().map(i => ({ json: i.json }));")}
const look = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Look up poster file', onError: 'continueRegularOutput', credentials: ${DRIVE}, parameters: { method: 'GET', url: expr('https://www.googleapis.com/drive/v3/files/{{ $json.id }}?fields=id,name,parents,trashed'), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api', options: { timeout: 60000 } } } });
${code('onlyAi', 'Only posters in AI Designs', "// Safety: only a file in the AI Designs folder or one of its style folders may be binned.\nconst ROOT = '1TnAcaZSix1Nzro-X3y-jaHpK2WmSe8pf';\nconst ok = new Set([ROOT].concat((($('List poster folders').first().json || {}).files || []).map(f => f.id)));\nreturn $input.all().filter(i => i.json && i.json.id && i.json.trashed !== true && (i.json.parents || []).some(p => ok.has(p))).map(i => ({ json: { id: i.json.id, name: i.json.name } }));")}
const binIt = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Move poster to bin', onError: 'continueRegularOutput', credentials: ${DRIVE}, parameters: { method: 'PATCH', url: expr('https://www.googleapis.com/drive/v3/files/{{ $json.id }}'), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '{ "trashed": true }', options: { timeout: 60000 } } } });
const every10 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every 10 minutes', parameters: { rule: { interval: [ { field: 'minutes', minutesInterval: 10 } ] } } } });
const settings = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Settings', parameters: { mode: 'manual', assignments: { assignments: [ { id: 'pl', name: 'priceList', value: '14scq7SUzHD86g7bhi5eadrcZbCHLVqg8Etj5a90sZ98', type: 'string' }, { id: 'cols', name: 'columns', value: 'MB=BDF,CPU=BDF,VGA=BDA,SSD=CEA,RAM=ACF,Cooler=ACE,Case Fans=ACE,PSU=BDA,Monitor=BDA,Case=BDA,Acc=BCA,Laptop=BCA', type: 'string' }, { id: 'bg', name: 'backgroundsFolder', value: '1p5hlV-KGPxt89R_XtAnMMFESvqiS1dAS', type: 'string' } ] } } } });
${gget('price', 'Read price list', SHEETS, 'googleSheetsOAuth2Api', "expr(\"https://sheets.googleapis.com/v4/spreadsheets/{{ $json.priceList }}/values:batchGet?valueRenderOption=FORMATTED_VALUE&{{ $json.columns.split(',').map(c => 'ranges=' + encodeURIComponent(\\\"'\\\" + c.split('=')[0].trim() + \\\"'!A2:F300\\\")).join('&') }}\")")}
${gget('bgs', 'List backgrounds', DRIVE, 'googleDriveOAuth2Api', "expr(\"https://www.googleapis.com/drive/v3/files?q='{{ $('Settings').first().json.backgroundsFolder }}'+in+parents+and+trashed+%3D+false&fields=files(id,name)&pageSize=300\")")}
${http('lists', 'Read lists', 'POST', FS + ":batchGet'", "'{\"documents\":[\"projects/poster-pilot-8d35e/databases/(default)/documents/catalog/products\",\"projects/poster-pilot-8d35e/databases/(default)/documents/catalog/styles\"]}'", ', executeOnce: true')}
${code('planLists', 'Plan lists', LP + rd('engine-lists.js'))}
${iff('changed', 'Prices changed?', '$json.pricesChanged === true')}
${http('open', 'Read open posts', 'POST', FS + ":runQuery'", "'{\"structuredQuery\":{\"from\":[{\"collectionId\":\"posts\"}],\"where\":{\"fieldFilter\":{\"field\":{\"fieldPath\":\"zone\"},\"op\":\"IN\",\"value\":{\"arrayValue\":{\"values\":[{\"stringValue\":\"offer\"},{\"stringValue\":\"design\"},{\"stringValue\":\"fix\"},{\"stringValue\":\"approved\"}]}}}}}}'", ', executeOnce: true')}
${code('reprice', 'Reprice posts', LP + rd('engine-reprice.js'))}
${http('saveLists', 'Save lists and prices', 'POST', FS + ":batchWrite'", "expr('{{ { writes: $json.writes } }}')", ', executeOnce: true')}
${http('saveLists2', 'Save lists', 'POST', FS + ":batchWrite'", "expr('{{ { writes: $json.writes } }}')", ', executeOnce: true')}
export default workflow('engine', 'PosterPilot - App engine')
  .add(everyMin).to(find).to(any.onTrue(prod.to(last).to(planApp).to(hasApp.onTrue(saveApp.to(toBin).to(folders).to(each).to(look).to(onlyAi).to(binIt)))))
  .add(every10).to(settings).to(price).to(bgs).to(lists).to(planLists).to(changed.onTrue(open.to(reprice).to(saveLists)).onFalse(saveLists2));
`);
}
