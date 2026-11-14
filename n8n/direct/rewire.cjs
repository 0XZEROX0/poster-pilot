// Generates n8n update_workflow operations that move the poster builder, the scheduler and the poster
// mover off the Posts sheet onto the "PosterPilot - Posts store" sub-workflow. Node names stay the same,
// so the Code nodes that read them keep working.
// Usage: node rewire.cjs <workflow.json> <poster|sched> > ops.json
const fs = require('fs');
const STORE = 'e0uQUJm6ImAuoEfV';
const [, , file, kind] = process.argv;
const w = JSON.parse(fs.readFileSync(file, 'utf8')).workflow;
const N = Object.fromEntries(w.nodes.map(n => [n.name, n]));
const C = w.connections;
const ops = [];

const SCHEMA = [['op', 'string'], ['purpose', 'string'], ['raw', 'boolean'], ['id', 'string'], ['cols', 'object']]
  .map(([id, type]) => ({ id, displayName: id, required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type, removed: false }));

const lit = s => JSON.stringify(s);
// One sheet column value (a fixed value or an n8n expression) as a JS expression.
function asJs(v) {
  if (typeof v !== 'string') return JSON.stringify(v);
  if (!v.startsWith('=')) return lit(v);
  const s = v.slice(1);
  const parts = []; let i = 0;
  while (i < s.length) {
    const a = s.indexOf('{{', i);
    if (a < 0) { parts.push(lit(s.slice(i))); break; }
    if (a > i) parts.push(lit(s.slice(i, a)));
    const b = s.indexOf('}}', a + 2);
    if (b < 0) throw new Error('unclosed expression: ' + v);
    parts.push('(' + s.slice(a + 2, b).trim() + ')');
    i = b + 2;
  }
  if (!parts.length) return lit('');
  return parts.length === 1 ? parts[0] : '(' + parts.map(p => p.startsWith('"') ? p : 'String(' + p + ')').join(' + ') + ')';
}
function colsExpr(value) {
  const entries = Object.entries(value).filter(([k]) => k !== 'row_number').map(([k, v]) => lit(k) + ': ' + asJs(v));
  const e = '={{ ({ ' + entries.join(', ') + ' }) }}';
  if (e.slice(3, -2).includes('}}')) throw new Error('"}}" inside expression');
  return e;
}

function incoming(name) {
  const r = [];
  for (const [s, o] of Object.entries(C)) (o.main || []).forEach((outs, idx) => (outs || []).forEach(c => { if (c.node === name) r.push({ source: s, sourceIndex: idx, targetIndex: c.index || 0 }); }));
  return r;
}
function outgoing(name) {
  const r = [];
  ((C[name] || {}).main || []).forEach((outs, idx) => (outs || []).forEach(c => r.push({ target: c.node, sourceIndex: idx, targetIndex: c.index || 0 })));
  return r;
}

function replace(name, inputs, mode, settings = {}) {
  const old = N[name];
  if (!old) throw new Error('no node ' + name);
  const ins = incoming(name), outs = outgoing(name);
  ops.push({ type: 'removeNode', nodeName: name });
  ops.push({ type: 'addNode', node: { name, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: old.position, parameters: {
    source: 'database', workflowId: { __rl: true, mode: 'id', value: STORE, cachedResultName: 'PosterPilot - Posts store' }, mode,
    workflowInputs: { mappingMode: 'defineBelow', value: inputs, matchingColumns: [], schema: SCHEMA, attemptToConvertTypes: false, convertFieldsToString: false },
    options: { waitForSubWorkflow: true } } } });
  const keep = {};
  for (const k of ['executeOnce', 'alwaysOutputData', 'retryOnFail', 'maxTries', 'waitBetweenTries', 'onError']) if (old[k] !== undefined) keep[k] = old[k];
  Object.assign(keep, settings);
  if (Object.keys(keep).length) ops.push({ type: 'setNodeSettings', nodeName: name, settings: keep });
  for (const i of ins) ops.push({ type: 'addConnection', source: i.source, target: name, sourceIndex: i.sourceIndex, targetIndex: i.targetIndex });
  for (const o of outs) ops.push({ type: 'addConnection', source: name, target: o.target, sourceIndex: o.sourceIndex, targetIndex: o.targetIndex });
}
const read = (purpose, raw = false) => ({ op: 'read', purpose, raw, id: '', cols: '={{ ({}) }}' });
const write = (name, idExpr) => {
  const v = N[name].parameters.columns.value;
  return { op: 'write', purpose: '', raw: false, id: idExpr || v.row_number, cols: colsExpr(v) };
};

if (kind === 'poster') {
  replace('Read Posts Rows', read('poster', true), 'once', { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 });
  for (const n of ['Write Image Link To Sheet', 'Mark Missing In Sheet', 'Note Background Status In Sheet', 'Mark Photo Found In Sheet', 'Note No More Images', 'Claim Rows']) replace(n, write(n), 'each');
  replace('Red Missing Item', { op: 'write', purpose: '', raw: false, id: '={{ $json.row_number }}', cols: '={{ ({ _missing: $json.item_name }) }}' }, 'each');
  ops.push({ type: 'setNodeParameter', nodeName: 'Clear Found Marks', path: '/jsCode', value: "// Items whose photo was found: clear the missing-photo mark (if an earlier run had set it).\nreturn $input.all().filter(i => i.json && i.json.row_number && i.json.item_name).map(i => ({ json: { row_number: i.json.row_number, item_name: i.json.item_name } }));" });
  replace('Clear Red On Found', { op: 'write', purpose: '', raw: false, id: '={{ $json.row_number }}', cols: '={{ ({ _found: $json.item_name }) }}' }, 'each');
} else if (kind === 'sched') {
  const reads = { 'Read Posts Sheet (Queue)': 'queue', 'Read Posts Sheet (Instagram)': 'ig', 'Read Posts Sheet (Status)': 'status', 'Read Posts Sheet (Captions)': 'caption', 'Read Posts Sheet (Changes)': 'changes', 'Read Caption Templates': 'templates', 'Read Caption Templates (Changes)': 'templates' };
  for (const [n, p] of Object.entries(reads)) replace(n, read(p), 'once', { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 });
  for (const n of ['Save Slot To Sheet', 'Save Instagram Status', 'Save Facebook Status', 'Save Instagram Check', 'Save Captions', 'Save Cancel Error', 'Clear Row For Reschedule', 'Keep Approved, Clear Post Time']) replace(n, write(n), 'each');
  for (const n of ['Sort Posted Rows Every 10 Min', 'Read Posts Sheet (Sort)', 'Plan Row Moves', 'Move Rows In Sheet']) ops.push({ type: 'setNodeDisabled', nodeName: n, disabled: true });
  for (const i of incoming('Read Posts Sheet (Sort)')) if (i.source !== 'Sort Posted Rows Every 10 Min') ops.push({ type: 'removeConnection', source: i.source, target: 'Read Posts Sheet (Sort)', sourceIndex: i.sourceIndex, targetIndex: i.targetIndex });
}
process.stdout.write(JSON.stringify(ops));
