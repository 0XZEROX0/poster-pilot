// Prints n8n Workflow SDK code for "Static OS - Text, photo and video posts": node build.cjs > custom.sdk.js
// Posts the person wrote and uploaded in the app (post.kind 'text' | 'image' | 'video') go out on the Facebook Page and
// Instagram: Facebook holds them on its schedule; Instagram cannot, so they are made when their time comes.
const fs = require('fs');
const rd = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
const J = JSON.stringify;
const lib = rd('../direct/lib.js').replace(/\nif \(typeof module[^\n]*\n?$/, '\n');
const dropFns = (src, names) => { let out = src; for (const n of names) out = out.replace(new RegExp('\\nfunction ' + n + '\\([\\s\\S]*?\\n\\}\\n'), '\n'); return out; };
const trimLines = (src, drop) => src.split('\n').filter(l => !drop.some(d => l.startsWith(d))).join('\n');
// Only what these nodes use: no sheet columns, prices or item helpers.
const LIB = trimLines(dropFns(lib, ['rowOf', 'applyCols', 'variantsOf', 'pricesFrom']), ['function fullName', 'const HEADERS', 'const TYPED', 'const EX ', 'const ITEM_', 'const grouped', 'const nameKey', 'const titleOf', 'const isNum', 'const toNum'])
  .replace(/\nconst slotted = items => \{[\s\S]*?\n\};/, '')
  .replace(/\/\*\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l) && l.trim()).join('\n') + '\n';
// The plan only reads posts: Firestore values, and which kind / places / states a post has.
const PLAN_LIB = trimLines(dropFns(LIB, ['zoneOf', 'queuesOf', 'storyWaiting', 'historyOf', 'customZone', 'customWork']).replace(/\nconst enc = v => \{[\s\S]*?\n\};/, ''), ['const fieldsOf', 'const OK_FB', 'const storyPlaces', 'const storyDone', 'const storyFailed', 'const working', 'const failed', 'const randomId'])
  .replace(/\nconst logWrite = [\s\S]*?\n\};/, '');
const FS = "{ googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } }";
const META = "{ httpHeaderAuth: { id: 'mkgnFIzTWTgamXBY', name: 'Meta Page Token' } }";
const DRIVE = "{ googleDriveOAuth2Api: { id: 'DGga87o4UiwLGddI', name: 'Google Drive account' } }";
const DB = 'https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents';
const PAGE = '242283423247894', IG = '17841412599288361', GRAPH = 'https://graph.facebook.com/v26.0/';
const TURN = 'WhMqnfr8mJS2480G';
const QUERY = { structuredQuery: { from: [{ collectionId: 'posts' }], where: { fieldFilter: { field: { fieldPath: 'q' }, op: 'ARRAY_CONTAINS', value: { stringValue: 'custom' } } }, limit: 30 } };
const field = (id, type) => ({ id, displayName: id, required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type, removed: false });
const turn = value => ({ source: 'database', mode: 'once', options: { waitForSubWorkflow: true },
  workflowId: { __rl: true, mode: 'id', value: TURN, cachedResultName: 'Static OS - Run turn (sub-workflow)' },
  workflowInputs: { mappingMode: 'defineBelow', value, matchingColumns: [], attemptToConvertTypes: false, convertFieldsToString: false,
    schema: [field('op', 'string'), field('key', 'string'), field('seconds', 'number'), field('wait', 'boolean'), field('updateTime', 'string'), field('by', 'string')] } });
const code = (v, name, src, notes, each) => `const ${v} = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${J(name)}${notes ? ', notes: ' + J(notes) : ''}, parameters: { mode: ${J(each ? 'runOnceForEachItem' : 'runOnceForAllItems')}, language: 'javaScript', jsCode: ${J(src)} } } });`;
const iff = (v, name, cond) => `const ${v} = ifElse({ version: 2.2, config: { name: ${J(name)}, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: expr(${J('{{ ' + cond + ' }}')}), operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });`;
// Meta calls never retry (a retry could post twice); an error comes out as $json.error and becomes the post's status.
const meta = (v, name, method, url, body, notes) => `const ${v} = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: ${J(name)}, onError: 'continueRegularOutput', notes: ${J(notes)}, credentials: ${META}, parameters: { method: ${J(method)}, url: ${url}, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth'${body || ''}, options: { timeout: 180000 } } } });`;
const json = b => `, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr(${J('{{ ' + b + ' }}')})`;
const hidden = `, sendBody: true, contentType: 'multipart-form-data', bodyParameters: { parameters: [ { parameterType: 'formBinaryData', name: 'source', inputDataFieldName: 'data' }, { name: 'published', value: 'false' } ] }`;
const driveGet = (v, name) => `const ${v} = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: ${J(name)}, onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, credentials: ${DRIVE}, parameters: { method: 'GET', url: expr('https://www.googleapis.com/drive/v3/files/{{ $json.fileId }}?alt=media'), authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api', options: { timeout: 120000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } } } } });`;
const result = (v, step) => code(v, 'Result (' + step + ')', "// Hands this step's answer to Save results, with its post.\nreturn { json: { step: '" + step + "', p: $('One action each').item.json, a: $json } };\n", null, true);
const A = "$('One action each').item.json";
const driveLink = "'https://drive.usercontent.google.com/download?id=' + " + A + ".video.id + '&export=download&confirm=t'";
const steps = [['fb text', "$json.action === 'fb' && $json.kind === 'text'"], ['fb photos', "$json.action === 'fb' && $json.kind === 'image'"], ['fb video', "$json.action === 'fb' && $json.kind === 'video'"],
  ['fb check', "$json.action === 'fbCheck'"], ['take off', "$json.action === 'cancel' || $json.action === 'reset'"], ['note', "$json.action === 'note'"],
  ['ig photos', "$json.action === 'igPhotos'"], ['ig video', "$json.action === 'igVideo'"], ['ig ready', "$json.action === 'igCheck'"]];
const rules = steps.map(([k, c]) => ({ outputKey: k, renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ ' + c + ' }}', operator: { type: 'boolean', operation: 'true', singleValue: true } }] } }));

console.log(`import { workflow, node, trigger, ifElse, switchCase, expr } from '@n8n/workflow-sdk';
const asked = trigger({ type: 'n8n-nodes-base.executeWorkflowTrigger', version: 1.1, config: { name: 'When engine asks', notes: 'The App engine starts this at once when a text, photo or video post is approved, gets its time, Post now, a change or a cancel. It also starts itself again 30 s after a run that did something.', parameters: { inputSource: 'passthrough' } } });
const timer = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every 5 minutes', notes: 'Instagram posts go out when their time comes (Instagram cannot hold them on a schedule). One database query per run.', parameters: { rule: { interval: [ { field: 'minutes', minutesInterval: 5 } ] } } } });
const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Run Now (manual)' } });
const take = node({ type: 'n8n-nodes-base.executeWorkflow', version: 1.2, config: { name: 'Take turn', alwaysOutputData: true, onError: 'continueRegularOutput', notes: 'One run at a time (status/run_custom-posts). A run the engine started waits for its turn; a timer run that finds it busy stops.', parameters: ${J(turn({ op: 'take', key: 'custom-posts', seconds: 600, wait: "={{ $('When engine asks').isExecuted }}", by: '={{ $execution.id }}' }))} } });
${iff('got', 'Got turn?', '$json.ok === true || $json.turn === undefined')}
const give = node({ type: 'n8n-nodes-base.executeWorkflow', version: 1.2, config: { name: 'Give back turn', alwaysOutputData: true, onError: 'continueRegularOutput', notes: 'Runs after the whole run (it sits below).', parameters: ${J(turn({ op: 'give', key: 'custom-posts', updateTime: "={{ $('Take turn').first().json.updateTime }}" }))} } });
const find = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Find posts to send', executeOnce: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, credentials: ${FS}, parameters: { method: 'POST', url: '${DB}:runQuery', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${J(J(QUERY))}, options: { timeout: 60000 } } } });
${code('plan', 'One action each', PLAN_LIB + rd('plan.js'), 'The one next step for each text, photo or video post (see plan.js in the repo, n8n/custom).')}
const which = switchCase({ version: 3.2, config: { name: 'Which step', parameters: { mode: 'rules', rules: { values: ${J(rules)} }, options: {} } } });
${meta('fbText', 'Post text on Facebook', 'POST', `'${GRAPH}${PAGE}/feed'`, json(`${A}.now ? { message: ${A}.caption, published: true } : { message: ${A}.caption, published: false, scheduled_publish_time: ${A}.unix }`), 'Text post on the Page: on its schedule, or at once for Post now. No retry.')}
${code('fbPhotos', 'Photos to send (Facebook)', rd('photos.js'))}
${driveGet('dlFb', 'Download photo (Facebook)')}
${meta('upFb', 'Upload hidden photo (Facebook)', 'POST', `'${GRAPH}${PAGE}/photos'`, hidden, 'Each photo is uploaded hidden first; the post then shows them (one photo or an album). No retry.')}
${code('fbPhotoPost', 'Facebook photo post', rd('fb-photo-post.js'))}
${iff('photosOk', 'Photos uploaded?', '$json.ok === true')}
${meta('fbPhotoSend', 'Post photos on Facebook', 'POST', `'${GRAPH}${PAGE}/feed'`, json('$json.body'), 'The Page post with the hidden photos attached. No retry.')}
${meta('fbVideo', 'Post video on Facebook', 'POST', `'${GRAPH}${PAGE}/videos'`, json(`Object.assign({ file_url: ${driveLink}, description: ${A}.caption }, ${A}.now ? { published: true } : { published: false, scheduled_publish_time: ${A}.unix })`), 'Facebook fetches the video from its Drive link (shared when it was uploaded) and holds it on the schedule. No retry.')}
${meta('fbState', 'Facebook post state', 'GET', `expr('${GRAPH}{{ $json.fbId }}?fields={{ $json.kind === "video" ? "published" : "is_published" }}')`, '', 'Is the scheduled post out yet.')}
${iff('needDel', 'On the schedule?', '!!$json.del')}
${meta('del', 'Take off Facebook schedule', 'DELETE', `expr('${GRAPH}{{ $json.del }}')`, '', 'Deletes the scheduled (not yet published) Page post or video. An already deleted one counts as done.')}
${code('igPhotos', 'Photos to send (Instagram)', rd('photos.js'))}
${driveGet('dlIg', 'Download photo (Instagram)')}
${meta('upIg', 'Upload hidden photo (Instagram)', 'POST', `'${GRAPH}${PAGE}/photos'`, hidden, 'A hidden Facebook photo, only to get a public JPEG link Instagram can fetch. No retry.')}
${meta('linkIg', 'Photo link (Instagram)', 'GET', `expr('${GRAPH}{{ $json.id || "0" }}?fields=images')`, '', 'Largest size of the hidden photo.')}
${meta('makeIg', 'Make Instagram photo', 'POST', `'${GRAPH}${IG}/media'`, json(`$('Photos to send (Instagram)').item.json.count > 1 ? { image_url: (($json.images || [])[0] || {}).source, is_carousel_item: true } : { image_url: (($json.images || [])[0] || {}).source, caption: ${A}.caption }`), 'One Instagram container per photo (an album item when there are 2 or more). No retry.')}
${code('igPost', 'Instagram post', rd('ig-container.js'))}
${iff('album', 'Album?', '$json.album === true')}
${meta('makeAlbum', 'Make Instagram album', 'POST', `'${GRAPH}${IG}/media'`, json('$json.body'), 'The carousel (album) of the photo containers. No retry.')}
${meta('makeReel', 'Make Instagram reel', 'POST', `'${GRAPH}${IG}/media'`, json(`{ media_type: 'REELS', video_url: ${driveLink}, caption: ${A}.caption, share_to_feed: true }`), 'Instagram fetches the video from its Drive link and gets it ready; a later run publishes it. No retry.')}
${meta('igState', 'Instagram ready?', 'GET', `expr('${GRAPH}{{ $json.container }}?fields=status_code,status')`, '', 'FINISHED = ready to publish.')}
${iff('ready', 'Ready?', "$json.status_code === 'FINISHED'")}
${meta('igPublish', 'Publish on Instagram', 'POST', `'${GRAPH}${IG}/media_publish'`, json(`{ creation_id: ${A}.container }`), 'Publishes the ready Instagram post. No retry: a retry could post it twice.')}
${result('rFb', 'fb')}
${result('rFbCheck', 'fbCheck')}
${result('rDrop', 'drop')}
${result('rNote', 'note')}
${result('rIgMade', 'igMade')}
${result('rIgWait', 'igWait')}
${result('rIgDone', 'igDone')}
${code('save', 'Save results', LIB + rd('result.js') + rd('save.js'))}
const write = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Save to database', retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, credentials: ${FS}, parameters: { method: 'POST', url: '${DB}:batchWrite', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ { writes: $json.writes } }}'), options: { timeout: 60000 } } } });
${code('again', 'Again soon?', rd('again.js'))}
const wait = node({ type: 'n8n-nodes-base.wait', version: 1.1, config: { name: 'Wait 30 s', parameters: { resume: 'timeInterval', amount: 30, unit: 'seconds' } } });
const self = node({ type: 'n8n-nodes-base.executeWorkflow', version: 1.2, config: { name: 'Run again', onError: 'continueRegularOutput', parameters: { source: 'database', mode: 'once', options: { waitForSubWorkflow: false }, workflowId: { __rl: true, mode: 'id', value: expr('{{ $workflow.id }}') } } } });
export default workflow('static-os-custom-posts', 'Static OS - Text, photo and video posts')
  .add(asked).to(take)
  .add(timer).to(take)
  .add(manual).to(take)
  .add(take).to(got.onTrue(find.to(plan.to(which
    .onCase(0, fbText.to(rFb))
    .onCase(1, fbPhotos.to(dlFb.to(upFb.to(fbPhotoPost.to(photosOk.onTrue(fbPhotoSend.to(rFb)).onFalse(rFb))))))
    .onCase(2, fbVideo.to(rFb))
    .onCase(3, fbState.to(rFbCheck))
    .onCase(4, needDel.onTrue(del.to(rDrop)).onFalse(rDrop))
    .onCase(5, rNote)
    .onCase(6, igPhotos.to(dlIg.to(upIg.to(linkIg.to(makeIg.to(igPost.to(album.onTrue(makeAlbum.to(rIgMade)).onFalse(rIgMade))))))))
    .onCase(7, makeReel.to(rIgMade))
    .onCase(8, igState.to(ready.onTrue(igPublish.to(rIgDone)).onFalse(rIgWait)))))))
  .add(take).to(give.to(again.to(wait.to(self))))
  .add(rFb).to(save)
  .add(rFbCheck).to(save)
  .add(rDrop).to(save)
  .add(rNote).to(save)
  .add(rIgMade).to(save)
  .add(rIgWait).to(save)
  .add(rIgDone).to(save)
  .add(save).to(write);
`);
