// Prints n8n Workflow SDK code for "Static OS - Upload post media": node media.cjs > media.sdk.js
// The app's photos and videos for text, photo and video posts go to Google Drive (AI Designs / Uploads), the way the
// posters do. Firebase Storage would need the paid plan. See media-check.js for the two steps.
const fs = require('fs');
const rd = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
const J = JSON.stringify;
const FS = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const DRIVE = "{ googleDriveOAuth2Api: { id: 'DGga87o4UiwLGddI', name: 'Google Drive account' } }";
const ORIGIN = 'https://0xzerox0.github.io';
const AI_DESIGNS = '1TnAcaZSix1Nzro-X3y-jaHpK2WmSe8pf';
const KEY = 'AIzaSyAKE9xRlRdLBu3DUr6R2mtE5_duDWX1-3Q';
const iff = (v, name, cond) => `const ${v} = ifElse({ version: 2.2, config: { name: ${J(name)}, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: expr(${J('{{ ' + cond + ' }}')}), operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });`;
const code = (v, name, src) => `const ${v} = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${J(name)}, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J(src)} } } });`;
const answer = (v, name, body, codeNo) => `const ${v} = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.4, config: { name: ${J(name)}, parameters: { respondWith: 'json', responseBody: expr(${J('{{ ' + body + ' }}')}), options: { ${codeNo ? 'responseCode: ' + codeNo + ', ' : ''}responseHeaders: { entries: [ { name: 'Access-Control-Allow-Origin', value: '${ORIGIN}' } ] } } } } });`;
const drive = (v, name, method, url, extra) => `const ${v} = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: ${J(name)}, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000${extra && extra.cfg ? ', ' + extra.cfg : ''}, credentials: ${DRIVE}, parameters: { method: ${J(method)}, url: ${url}, authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api'${extra && extra.p ? ', ' + extra.p : ''}, options: { timeout: 60000${extra && extra.o ? ', ' + extra.o : ''} } } } });`;
console.log(`import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const hook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Upload from the app', notes: 'The app asks { token, op: start, name, type, size } for a Drive upload link, then { token, op: finish, id } after the browser sent the file. A signed-in member only.', parameters: { httpMethod: 'POST', path: 'static-os-media', responseMode: 'responseNode', options: { allowedOrigins: '${ORIGIN}', onlyRunIf: "={{ typeof $json.body?.token === 'string' && $json.body.token.length > 200 && $json.body.token.length < 5000 }}" } } } });
const who = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Who is asking', onError: 'continueRegularOutput', parameters: { method: 'POST', url: 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${KEY}', sendHeaders: true, headerParameters: { parameters: [ { name: 'Referer', value: '${ORIGIN}/' } ] }, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr("{{ { idToken: $('Upload from the app').first().json.body.token } }}"), options: { timeout: 20000 } } } });
const member = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Member', onError: 'continueRegularOutput', credentials: ${FS}, parameters: { method: 'GET', url: expr("https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents/members/{{ (($json.users || [])[0] || {}).localId || 'nobody' }}"), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', options: { timeout: 20000 } } } });
// A token Google does not know is refused at once, before the Firestore member read: junk calls cost no database reads.
${iff('signedIn', 'Signed in?', '!!((($json.users || [])[0] || {}).localId)')}
${code('check', 'Check request', rd('media-check.js'))}
${iff('ok', 'Request OK?', '$json.ok === true')}
${answer('refuse', 'Refuse', '{ ok: false, error: $json.error || "Not allowed" }', 403)}
${drive('findFolder', 'Find Uploads Folder', 'GET', J(`https://www.googleapis.com/drive/v3/files?q='${AI_DESIGNS}'+in+parents+and+name+%3D+'Uploads'+and+mimeType+%3D+'application/vnd.google-apps.folder'+and+trashed+%3D+false&fields=files(id)`))}
${iff('missing', 'Uploads folder missing?', '!(($json.files || [])[0] || {}).id')}
${drive('makeFolder', 'Make Uploads Folder', 'POST', "'https://www.googleapis.com/drive/v3/files?fields=id'", { p: `sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${J(J({ name: 'Uploads', mimeType: 'application/vnd.google-apps.folder', parents: [AI_DESIGNS] }))}` })}
${code('plan', 'Upload plan', "// The request, with the Uploads folder (found, or made just now).\nconst made = $('Make Uploads Folder').isExecuted ? $('Make Uploads Folder').first().json.id : '';\nconst found = ((($('Find Uploads Folder').first().json || {}).files || [])[0] || {}).id || '';\nreturn [{ json: Object.assign({}, $('Check request').first().json, { folder: made || found }) }];\n")}
${iff('isStart', 'Start?', "$json.op === 'start'")}
${drive('start', 'Start Drive upload', 'POST', "'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id'", {
  p: `sendHeaders: true, headerParameters: { parameters: [ { name: 'Origin', value: '${ORIGIN}' }, { name: 'X-Upload-Content-Type', value: expr('{{ $json.type }}') }, { name: 'X-Upload-Content-Length', value: expr('{{ $json.size }}') } ] }, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ { name: $json.name, parents: [$json.folder] } }}')`,
  o: "response: { response: { fullResponse: true } }" })}
${answer('link', 'Answer upload link', '{ ok: !!($json.headers || {}).location, url: ($json.headers || {}).location || "", error: ($json.headers || {}).location ? "" : "Drive gave no upload link" }')}
${drive('look', 'Look up file', 'GET', "expr('https://www.googleapis.com/drive/v3/files/{{ $json.id }}?fields=id,mimeType,parents,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis)')", { cfg: "onError: 'continueRegularOutput'" })}
${code('checkFile', 'Check file', rd('media-file.js'))}
${iff('fileOk', 'File OK?', '$json.ok === true')}
${drive('share', 'Share file', 'POST', "expr('https://www.googleapis.com/drive/v3/files/{{ $json.id }}/permissions')", { p: `sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '{ "role": "reader", "type": "anyone" }'` })}
${answer('done', 'Answer file', "Object.assign({}, $('Check file').first().json)")}
${answer('refuseFile', 'Refuse file', '{ ok: false, error: $json.error || "Not allowed" }', 403)}
export default workflow('static-os-media', 'Static OS - Upload post media')
  .add(hook).to(who).to(signedIn.onTrue(member).onFalse(refuse))
  .add(member).to(check).to(ok
    .onTrue(findFolder.to(missing.onTrue(makeFolder.to(plan)).onFalse(plan)))
    .onFalse(refuse))
  .add(plan).to(isStart.onTrue(start.to(link)).onFalse(look.to(checkFile.to(fileOk.onTrue(share.to(done)).onFalse(refuseFile)))));
`);
