// Prints the update_workflow operations for "Post now" (2026-11-15): node ops.cjs sched | node ops.cjs store <store.json>
const fs = require('fs');
const rd = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
const which = process.argv[2];
if (which === 'sched') {
  const PQ = "$('Plan Queue').item.json";
  const saveCols = "={{ Object.assign({ \"Caption\": ($json.id ? " + PQ + ".caption : ''), \"FB photo id\": ($json.id ? String($('Upload Photo (Unpublished)').item.json.id) : ''), \"FB post id\": ($json.id ? String($json.id) : ''), \"FB status\": ($json.id ? (" + PQ + ".postNow ? 'Published' : 'Scheduled') : ''), \"IG status\": ($json.id ? '' : 'FB error: ' + String([$('Upload Photo (Unpublished)').item.json.error, $json.error].filter(Boolean).map(x => x.message || x)[0] || 'unknown').slice(0, 200)), \"Scheduled for\": ($json.id ? " + PQ + ".slotLocal : ''), \"Reschedule slot\": \"\", \"Scheduled image\": ($json.id ? " + PQ + ".fileId : ''), \"Scheduled price\": ($json.id ? " + PQ + ".priceKey : '') }, " + PQ + ".postNow ? Object.assign({ \"Post now\": \"\" }, $json.id ? { \"Post date\": " + PQ + ".postDate, \"Post time\": " + PQ + ".postTime } : {}) : {}) }}";
  const fbBody = "={{ " + PQ + ".postNow ? { message: " + PQ + ".caption, published: true, attached_media: [{ media_fbid: $json.id }] } : { message: " + PQ + ".caption, published: false, scheduled_publish_time: " + PQ + ".slotUnix, attached_media: [{ media_fbid: $json.id }] } }}";
  const U = "$('Find Changed Posts').item.json.upd";
  const clearCols = "={{ Object.assign({ \"Auto reschedule\": (" + U + "['Auto reschedule']), \"Caption\": (" + U + "['Caption']), \"FB photo id\": (" + U + "['FB photo id']), \"FB post id\": (" + U + "['FB post id']), \"FB status\": (" + U + "['FB status']), \"Feedback\": (" + U + "['Feedback']), \"IG status\": (" + U + "['IG status']), \"Reschedule slot\": (''), \"Scheduled for\": (" + U + "['Scheduled for']), \"Scheduled image\": (" + U + "['Scheduled image']), \"Scheduled price\": (" + U + "['Scheduled price']) }, ('Post now' in " + U + ") ? { \"Post now\": " + U + "['Post now'] } : {}) }}";
  const igNow = "// \"Instagram now?\" (Post now, 2026-11-15): runs once after the whole queue part (it hangs off Give back turn).\n// When a post was just published on Facebook with Post now, Instagram follows at once instead of at its next 5-minute check.\nconst asked = $('Plan Queue').isExecuted && $('Plan Queue').all().some(i => i.json.postNow === true);\nreturn asked ? [{ json: { parts: ['instagram'] } }] : [];\n";
  const ops = [
    { type: 'setNodeParameter', nodeName: 'Plan Queue', path: '/jsCode', value: rd('plan-queue.js') },
    { type: 'setNodeParameter', nodeName: 'Find Changed Posts', path: '/jsCode', value: rd('find-changed-posts.js') },
    { type: 'setNodeParameter', nodeName: 'Schedule Facebook Post', path: '/jsonBody', value: fbBody },
    { type: 'setNodeParameter', nodeName: 'Save Slot To Sheet', path: '/workflowInputs/value/cols', value: saveCols },
    { type: 'setNodeParameter', nodeName: 'Clear Row For Reschedule', path: '/workflowInputs/value/cols', value: clearCols },
    { type: 'addNode', node: { name: 'Instagram now?', type: 'n8n-nodes-base.code', typeVersion: 2, position: [512, 420], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: igNow } } },
    { type: 'addNode', node: { name: 'Start Instagram now', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: [736, 420], parameters: { mode: 'once', options: { waitForSubWorkflow: false }, source: 'database', workflowId: { __rl: true, cachedResultName: 'Static OS - Schedule Posters To Facebook and Instagram', mode: 'id', value: 'Oa5WOuoSdrNquHHe' } } } },
    { type: 'setNodeSettings', nodeName: 'Start Instagram now', settings: { onError: 'continueRegularOutput' } },
    { type: 'addConnection', source: 'Give back turn (Queue)', target: 'Instagram now?' },
    { type: 'addConnection', source: 'Instagram now?', target: 'Start Instagram now' },
  ];
  console.log(JSON.stringify(ops));
}
if (which === 'store') {
  const live = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  let code = live.workflow.nodes.find(n => n.name === 'Apply').parameters.jsCode;
  const a = ["'Poster price', 'Offer approval'];", "'Poster price', 'Offer approval', 'Post now'];"];
  const b = ["'FB post id': 'fbPostId', 'Offer approval': 'offer' };", "'FB post id': 'fbPostId', 'Offer approval': 'offer', 'Post now': 'postNow' };"];
  for (const [x, y] of [a, b]) { if (code.split(x).length !== 2) throw new Error('not found once: ' + x); code = code.replace(x, y); }
  console.log(JSON.stringify([{ type: 'setNodeParameter', nodeName: 'Apply', path: '/jsCode', value: code }]));
}
