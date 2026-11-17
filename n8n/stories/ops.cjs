// Prints the update_workflow operations for Stories step 1 (2026-11-17).
//   node ops.cjs sched <scheduler.json>   Stories part of "Static OS - Schedule Posters" (Oa5WOuoSdrNquHHe)
//   node ops.cjs store <store.json>       new columns + story queue in the Posts store (e0uQUJm6ImAuoEfV), node Apply
//   node ops.cjs engine <engine.json>     same lib changes + story reset in the App engine (qRX3fplFZLoSmgir)
// <x.json> is the live workflow as get_workflow_details returns it ({ workflow: { nodes } }): the live code is
// patched in place (other threads change these nodes too), and the store / Meta / Drive node settings are copied
// from nodes that already work, so credentials and sub-workflow inputs match exactly.
const fs = require('fs');
const rd = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
const [, , which, file] = process.argv;
const live = JSON.parse(fs.readFileSync(file, 'utf8'));
const nodes = (live.workflow || live).nodes;
const byName = n => { const x = nodes.find(m => m.name === n); if (!x) throw new Error('live node missing: ' + n); return x; };
const clone = o => JSON.parse(JSON.stringify(o));
const once = (code, a, b) => { if (code.split(a).length !== 2) throw new Error('not found once: ' + a.slice(0, 80)); return code.replace(a, b); };
const ops = [];
const add = node => ops.push({ type: 'addNode', node });
const con = (source, target, sourceIndex = 0) => ops.push({ type: 'addConnection', source, target, sourceIndex });

// ---------- lib.js changes, shared by the store's Apply and the engine's Plan app changes ----------
const STORY_FNS = "\nconst storyPlaces = f => clean(f.story).split('+').filter(w => w === 'fb' || w === 'ig');\nconst storyDone = s => /^(posted|published)/i.test(clean(s));\nconst storyFailed = s => clean(s) !== '' && !storyDone(s) && !/^waiting/i.test(clean(s));\nfunction storyWaiting(f) {\n  const places = storyPlaces(f);\n  if (!places.length || !/\\/d\\//.test(str(f.posterUrl))) return false;\n  if (!['done', 'published'].includes(low(f.feedback))) return false;\n  const open = places.filter(w => { const s = w === 'fb' ? f.storyFbStatus : f.storyIgStatus; return !storyDone(s) && !storyFailed(s); });\n  return open.length > 0;\n}\n";
function patchLib(code, { columns }) {
  if (code.includes('storyWaiting')) throw new Error('already has stories');
  if (columns) {
    code = once(code, "'Offer approval', 'Post now'];", "'Offer approval', 'Post now', 'Story', 'Story delay', 'Story image', 'Story FB status', 'Story IG status', 'Story from', 'Story photo id', 'Story FB id', 'Story IG id'];");
    code = once(code, "'Post now': 'postNow' };", "'Post now': 'postNow', 'Story': 'story', 'Story delay': 'storyDelay', 'Story image': 'storyImage', 'Story FB status': 'storyFbStatus', 'Story IG status': 'storyIgStatus' };");
    code = once(code, "'Poster price': 'posterPrice' };", "'Poster price': 'posterPrice', 'Story from': 'storyFrom', 'Story photo id': 'storyPhotoId', 'Story FB id': 'storyFbId', 'Story IG id': 'storyIgId' };");
  }
  code = once(code, "q.push('move');\n  return q;\n}\n", "q.push('move');\n  if (storyWaiting(f)) q.push('story');\n  return q;\n}\n" + STORY_FNS);
  return code;
}
const HISTORY_OLD = "else if (/error|fail/i.test(igs)) out.push(['ig.error', igs.slice(0, 300)]);\n  }\n";
const HISTORY_NEW = HISTORY_OLD + "  if (g(b, 'storyImage') !== g(a, 'storyImage') && g(b, 'storyImage')) out.push(['story.made', '']);\n  for (const [k, place] of [['storyFbStatus', 'fb'], ['storyIgStatus', 'ig']]) {\n    const v = g(b, k);\n    if (v === g(a, k)) continue;\n    if (storyDone(v)) out.push(['story.' + place, '']);\n    else if (storyFailed(v)) out.push(['story.error', ((place === 'fb' ? 'Facebook: ' : 'Instagram: ') + v).slice(0, 300)]);\n  }\n";

if (which === 'store') {
  let code = byName('Apply').parameters.jsCode;
  code = patchLib(code, { columns: true });
  code = once(code, HISTORY_OLD, HISTORY_NEW);
  ops.push({ type: 'setNodeParameter', nodeName: 'Apply', path: '/jsCode', value: code });
}

if (which === 'engine') {
  let code = byName('Plan app changes').parameters.jsCode;
  code = patchLib(code, { columns: false });
  const ENGINE_OLD = "  g.zone = zoneOf(g); g.q = queuesOf(g); mask.add('zone'); mask.add('q');\n";
  const ENGINE_NEW = "  // Stories: a place the person chose (again) waits for the Stories part, unless its story is out already; a failure\n  // is cleared, so \"Try the story again\" works; a place taken off is emptied.\n  if ('story' in edits || 'storyDelay' in edits) {\n    const places = storyPlaces(g);\n    for (const [k, place] of [['storyFbStatus', 'fb'], ['storyIgStatus', 'ig']]) {\n      const want = places.includes(place) ? (storyDone(g[k]) ? clean(g[k]) : 'Waiting') : (storyDone(g[k]) ? clean(g[k]) : '');\n      if (clean(g[k]) !== want) { g[k] = want; mask.add(k); }\n    }\n    // The Stories part runs with Instagram's: start it now, so a story asked for after the post went out is not held back.\n    if (places.length) sched.add('instagram');\n  }\n" + ENGINE_OLD;
  code = once(code, ENGINE_OLD, ENGINE_NEW);
  ops.push({ type: 'setNodeParameter', nodeName: 'Plan app changes', path: '/jsCode', value: code });
}

if (which === 'sched') {
  const PAGE = '242283423247894', IG = '17841412599288361', GRAPH = 'https://graph.facebook.com/v26.0/';
  const AI_DESIGNS = '1TnAcaZSix1Nzro-X3y-jaHpK2WmSe8pf';
  // Settings copied from live nodes that already work.
  const saveSlot = byName('Save Slot To Sheet');
  const readIg = byName('Read Posts Sheet (Instagram)');
  const meta = byName('Schedule Facebook Post');
  const takeIg = byName('Take turn (Instagram)'), giveIg = byName('Give back turn (Instagram)');
  const META_AUTH = { authentication: meta.parameters.authentication, genericAuthType: meta.parameters.genericAuthType, nodeCredentialType: meta.parameters.nodeCredentialType };
  for (const k of Object.keys(META_AUTH)) if (META_AUTH[k] === undefined) delete META_AUTH[k];
  const DRIVE_CRED = { googleDriveOAuth2Api: { id: 'DGga87o4UiwLGddI', name: 'Google Drive account' } };
  const x0 = 0, y0 = Math.max(...nodes.map(n => (n.position || [0, 0])[1])) + 400;
  const at = (col, row) => [x0 + col * 224, y0 + row * 200];
  const store = (name, pos, cols, extra = {}) => {
    const p = clone(saveSlot.parameters);
    p.workflowInputs.value = Object.assign({}, p.workflowInputs.value, { op: 'write', id: extra.id, cols });
    add({ name, type: saveSlot.type, typeVersion: saveSlot.typeVersion, position: pos, parameters: p, credentials: saveSlot.credentials });
  };
  const code = (name, pos, jsCode, notes) => add({ name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode }, notes });
  const graph = (name, pos, method, url, body, notes, extra = {}) => add(Object.assign({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, credentials: meta.credentials, notes,
    parameters: Object.assign({ method, url }, META_AUTH, body ? body : {}, { options: { timeout: 60000 } }) }, extra));
  const driveGet = (name, pos, idExpr) => add({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, credentials: DRIVE_CRED, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000,
    parameters: { method: 'GET', url: `=https://www.googleapis.com/drive/v3/files/{{ ${idExpr} }}?alt=media`, authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api', options: { timeout: 60000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } } } });
  const errText = (label) => `(${label} + ': ' + String((($json.error || {}).message) || $json.error || 'unknown').slice(0, 180))`;
  // Meta calls never retry and stop on their own error output: a retry could post a story twice.
  const noRetry = { retryOnFail: false, onError: 'continueErrorOutput' };

  // Turn: one Stories run at a time, right after the Instagram part (it hangs off Give back turn (Instagram)).
  const take = clone(takeIg); take.name = 'Take turn (Stories)'; take.position = at(0, 0); delete take.id;
  take.parameters.workflowInputs.value = Object.assign({}, take.parameters.workflowInputs.value, { key: 'sched-stories', seconds: 600 });
  add(take);
  add({ name: 'Got turn (Stories)?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: at(1, 0), parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.ok === true || $json.turn === undefined }}', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } });
  const give = clone(giveIg); give.name = 'Give back turn (Stories)'; give.position = at(2, 12); delete give.id;
  give.parameters.workflowInputs.value = Object.assign({}, give.parameters.workflowInputs.value, { key: 'sched-stories', updateTime: "={{ $('Take turn (Stories)').first().json.updateTime }}" });
  add(give);
  const readQ = clone(readIg); readQ.name = 'Read Story Queue'; readQ.position = at(2, 0); delete readQ.id;
  readQ.parameters.workflowInputs.value = Object.assign({}, readQ.parameters.workflowInputs.value, { op: 'read', purpose: 'story', raw: true });
  add(readQ);
  code('Plan Stories', at(3, 0), rd('plan-stories.js'), 'Stories (2026-11-17): which posts need a story picture made, and whose story is due on Facebook / Instagram. At most 4 posts per run.');
  const pick = (cond) => `// Passes on the planned posts that ${cond.note}.\nreturn $input.all().map((i, n) => ({ json: i.json, pairedItem: { item: n } })).filter(i => ${cond.test});\n`;
  code('Stories to make', at(4, 0), pick({ note: 'need their 1080x1920 story picture made (or made again for a new poster)', test: 'i.json.make' }));
  code('Facebook stories now', at(4, 4), pick({ note: 'have a story picture and whose Facebook story is due', test: 'i.json.fb && !i.json.make' }));
  code('Instagram stories now', at(4, 8), pick({ note: 'have a story picture and whose Instagram story is due', test: 'i.json.ig && !i.json.make' }));

  // 1. Make the story picture: the poster centred on a blurred, darkened copy of itself, 1080x1920.
  add({ name: 'Find Stories Folder', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: at(5, 0), executeOnce: true, credentials: DRIVE_CRED, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000,
    parameters: { method: 'GET', url: `=https://www.googleapis.com/drive/v3/files?q='${AI_DESIGNS}'+in+parents+and+name+%3D+'Stories'+and+mimeType+%3D+'application/vnd.google-apps.folder'+and+trashed+%3D+false&fields=files(id)`, authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api', options: { timeout: 60000 } } });
  add({ name: 'Stories folder missing?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: at(6, 0), parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ !(($json.files || [])[0] || {}).id }}', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } });
  add({ name: 'Make Stories Folder', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: at(7, 1), executeOnce: true, credentials: DRIVE_CRED,
    parameters: { method: 'POST', url: 'https://www.googleapis.com/drive/v3/files?fields=id', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: JSON.stringify({ name: 'Stories', mimeType: 'application/vnd.google-apps.folder', parents: [AI_DESIGNS] }), options: { timeout: 60000 } } });
  code('One story picture each', at(8, 0), "// One item per story picture to make, with the Stories folder (found, or made just now).\nconst made = $('Make Stories Folder').isExecuted ? $('Make Stories Folder').first().json.id : '';\nconst found = ((($('Find Stories Folder').first().json || {}).files || [])[0] || {}).id || '';\nconst folder = made || found;\nreturn $('Stories to make').all().map(i => ({ json: Object.assign({}, i.json, { folder }) }));\n");
  driveGet('Download Poster', at(9, 0), '$json.posterId');
  add({ name: 'Poster Size', type: 'n8n-nodes-base.editImage', typeVersion: 1, position: at(10, 0), parameters: { operation: 'information', dataPropertyName: 'data' } });
  code('Fit Poster', at(11, 0), rd('fit-poster.js'), 'Works out where the poster sits on the 1080x1920 story (kept clear of the top 250 px and bottom 340 px that Instagram covers).');
  add({ name: 'Resize Poster', type: 'n8n-nodes-base.editImage', typeVersion: 1, position: at(12, 0), parameters: { operation: 'resize', dataPropertyName: 'poster', width: '={{ $json.w }}', height: '={{ $json.h }}', resizeOption: 'ignoreAspectRatio', options: {} } });
  add({ name: 'Make Story Picture', type: 'n8n-nodes-base.editImage', typeVersion: 1, position: at(13, 0), parameters: { operation: 'multiStep', dataPropertyName: 'data', operations: { operations: [
    { operation: 'resize', width: '={{ $json.bgW }}', height: 1920, resizeOption: 'ignoreAspectRatio' },
    { operation: 'crop', width: 1080, height: 1920, positionX: '={{ $json.bgX }}', positionY: 0 },
    { operation: 'blur', blur: 40, sigma: 20 },
    { operation: 'draw', primitive: 'rectangle', color: '#000000a0', startPositionX: 0, startPositionY: 0, endPositionX: 1080, endPositionY: 1920 },
    { operation: 'composite', dataPropertyNameComposite: 'poster', positionX: '={{ $json.x }}', positionY: '={{ $json.y }}' },
    { operation: 'text', text: 'static-eg.com', fontSize: 56, fontColor: '#ffffff', positionX: 370, positionY: '={{ $json.textY }}', lineLength: 40 },
    { operation: 'text', text: 'Al Bustan Mall - 10th floor', fontSize: 40, fontColor: '#ffffff', positionX: 300, positionY: '={{ $json.textY + 70 }}', lineLength: 60 },
  ] }, options: { format: 'jpeg', quality: 90, fileName: "={{ 'story-' + $json.id + '.jpg' }}" } } });
  add({ name: 'Upload Story Picture', type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: at(14, 0), credentials: DRIVE_CRED, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000,
    parameters: { name: "={{ 'story-' + $('One story picture each').item.json.id + '.jpg' }}", driveId: { __rl: true, mode: 'list', value: 'My Drive' }, folderId: { __rl: true, mode: 'id', value: "={{ $('One story picture each').item.json.folder }}" }, inputDataFieldName: 'data', options: {} } });
  add({ name: 'Share Story Picture', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: at(15, 0), credentials: DRIVE_CRED, onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: "=https://www.googleapis.com/drive/v3/files/{{ $json.id }}/permissions", authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '{ "role": "reader", "type": "anyone" }', options: { timeout: 60000 } } });
  store('Save Story Picture', at(16, 0), "={{ { 'Story image': 'https://drive.google.com/file/d/' + $('Upload Story Picture').item.json.id + '/view', 'Story from': $('One story picture each').item.json.poster } }}", { id: "={{ $('One story picture each').item.json.id }}" });

  // 2. Facebook story: hidden photo, then photo_stories.
  driveGet('Download Story Picture (Facebook)', at(5, 4), '$json.imageId');
  graph('Upload Hidden Story Photo', at(6, 4), 'POST', `${GRAPH}${PAGE}/photos`, { sendBody: true, contentType: 'multipart-form-data', bodyParameters: { parameters: [{ name: 'published', value: 'false' }, { parameterType: 'formBinaryData', name: 'source', inputDataFieldName: 'data' }] } }, 'Uploads the story picture as a hidden photo (a photo already used in a post cannot be a story). No retry.', noRetry);
  graph('Post Facebook Story', at(7, 4), 'POST', `${GRAPH}${PAGE}/photo_stories`, { sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ { photo_id: $json.id } }}' }, 'Publishes the Facebook Page story. No retry: a retry could post it twice.', noRetry);
  store('Save Facebook Story', at(8, 4), "={{ { 'Story FB status': 'Posted', 'Story photo id': String($('Upload Hidden Story Photo').item.json.id), 'Story FB id': String($json.post_id || $json.id || '') } }}", { id: "={{ $('Facebook stories now').item.json.id }}" });
  store('Save Facebook Story Error', at(8, 6), `={{ { 'Story FB status': ${errText("'Facebook error'")} } }}`, { id: "={{ $('Facebook stories now').item.json.id }}" });

  // 3. Instagram story: daily limit check, hidden photo for a public link, create STORIES media, wait, publish.
  graph('Check Instagram Limit', at(5, 8), 'GET', `${GRAPH}${IG}/content_publishing_limit?fields=quota_usage`, null, 'Instagram allows 50 API posts a day; stories stop at 45 to leave room for the posts.', { executeOnce: true, onError: 'continueRegularOutput', alwaysOutputData: true });
  code('Under Instagram limit', at(6, 8), "// Stories go out while today's Instagram API posts are under 45 (of 50). Over it, a story keeps waiting with a note.\nconst q = (((($('Check Instagram Limit').first().json || {}).data) || [])[0] || {}).quota_usage;\nconst over = typeof q === 'number' && q >= 45;\nreturn $('Instagram stories now').all().map((i, n) => ({ json: Object.assign({}, i.json, { over }), pairedItem: { item: 0 } }));\n");
  add({ name: 'Instagram limit reached?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: at(7, 8), parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.over === true }}', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } });
  store('Save Instagram Limit Note', at(8, 10), "={{ { 'Story IG status': 'Waiting - Instagram daily limit reached, trying again later' } }}", { id: '={{ $json.id }}' });
  driveGet('Download Story Picture (Instagram)', at(8, 8), '$json.imageId');
  graph('Upload Hidden Photo (Instagram)', at(9, 8), 'POST', `${GRAPH}${PAGE}/photos`, { sendBody: true, contentType: 'multipart-form-data', bodyParameters: { parameters: [{ name: 'published', value: 'false' }, { parameterType: 'formBinaryData', name: 'source', inputDataFieldName: 'data' }] } }, 'Hidden Facebook photo, only to get a public link Instagram can fetch. No retry.', noRetry);
  graph('Story Photo Link', at(10, 8), 'GET', `=${GRAPH}{{ $json.id }}?fields=images`, null, 'Largest size of the hidden photo.', { retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, onError: 'continueErrorOutput' });
  graph('Create Instagram Story', at(11, 8), 'POST', `${GRAPH}${IG}/media`, { sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ { media_type: "STORIES", image_url: (($json.images || [])[0] || {}).source } }}' }, 'Creates the Instagram story container. No retry.', noRetry);
  add({ name: 'Wait For Instagram Story', type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: at(12, 8), parameters: { amount: 15 } });
  graph('Publish Instagram Story', at(13, 8), 'POST', `${GRAPH}${IG}/media_publish`, { sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: "={{ { creation_id: $('Create Instagram Story').item.json.id } }}" }, 'Publishes the Instagram story. No retry: a retry could post it twice.', noRetry);
  store('Save Instagram Story', at(14, 8), "={{ { 'Story IG status': 'Posted', 'Story IG id': String($json.id || '') } }}", { id: "={{ $('Instagram stories now').item.json.id }}" });
  store('Save Instagram Story Error', at(14, 10), `={{ { 'Story IG status': ${errText("'Instagram error'")} } }}`, { id: "={{ $('Instagram stories now').item.json.id }}" });

  for (const n of ['Take turn (Stories)', 'Give back turn (Stories)']) ops.push({ type: 'setNodeSettings', nodeName: n, settings: { onError: 'continueRegularOutput', alwaysOutputData: true } });
  // Wiring.
  con('Give back turn (Instagram)', 'Take turn (Stories)');
  con('Take turn (Stories)', 'Got turn (Stories)?');
  con('Got turn (Stories)?', 'Read Story Queue');
  con('Got turn (Stories)?', 'Give back turn (Stories)');
  con('Read Story Queue', 'Plan Stories');
  for (const t of ['Stories to make', 'Facebook stories now', 'Instagram stories now']) con('Plan Stories', t);
  con('Stories to make', 'Find Stories Folder'); con('Find Stories Folder', 'Stories folder missing?');
  con('Stories folder missing?', 'Make Stories Folder', 0); con('Stories folder missing?', 'One story picture each', 1);
  con('Make Stories Folder', 'One story picture each');
  for (const [a, b] of [['One story picture each', 'Download Poster'], ['Download Poster', 'Poster Size'], ['Poster Size', 'Fit Poster'], ['Fit Poster', 'Resize Poster'], ['Resize Poster', 'Make Story Picture'], ['Make Story Picture', 'Upload Story Picture'], ['Upload Story Picture', 'Share Story Picture'], ['Share Story Picture', 'Save Story Picture']]) con(a, b);
  con('Facebook stories now', 'Download Story Picture (Facebook)'); con('Download Story Picture (Facebook)', 'Upload Hidden Story Photo');
  con('Upload Hidden Story Photo', 'Post Facebook Story', 0); con('Upload Hidden Story Photo', 'Save Facebook Story Error', 1);
  con('Post Facebook Story', 'Save Facebook Story', 0); con('Post Facebook Story', 'Save Facebook Story Error', 1);
  con('Instagram stories now', 'Check Instagram Limit'); con('Check Instagram Limit', 'Under Instagram limit'); con('Under Instagram limit', 'Instagram limit reached?');
  con('Instagram limit reached?', 'Save Instagram Limit Note', 0); con('Instagram limit reached?', 'Download Story Picture (Instagram)', 1);
  con('Download Story Picture (Instagram)', 'Upload Hidden Photo (Instagram)');
  for (const [a, b] of [['Upload Hidden Photo (Instagram)', 'Story Photo Link'], ['Story Photo Link', 'Create Instagram Story'], ['Create Instagram Story', 'Wait For Instagram Story']]) { con(a, b, 0); con(a, 'Save Instagram Story Error', 1); }
  con('Wait For Instagram Story', 'Publish Instagram Story');
  con('Publish Instagram Story', 'Save Instagram Story', 0); con('Publish Instagram Story', 'Save Instagram Story Error', 1);
}
console.log(JSON.stringify(ops));
