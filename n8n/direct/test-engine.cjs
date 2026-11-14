const fs = require('fs');
const S = '/tmp/claude-0/-home-user/18f22686-207a-53d2-af31-cf8a6e261ebb/scratchpad/engine.sdk.js';
const src = fs.readFileSync(S, 'utf8');
const nodes = {}; for (const m of src.matchAll(/name: "([^"]+)", parameters: \{ mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ("(?:[^"\\]|\\.)*")/g)) nodes[m[1]] = JSON.parse(m[2]);
const L = require('./lib-test.cjs');
const run = (name, data) => { const $ = n => ({ first: () => ({ json: (data[n] || [{}])[0] }), all: () => (data[n] || []).map(json => ({ json })) }); return new Function('$', '$input', nodes[name])($, { all: () => [] }); };
const doc = (id, f, ut = '2026-01-01T00:00:00Z') => ({ name: 'projects/p/databases/(default)/documents/posts/' + id, updateTime: ut, fields: L.fieldsOf(f) });
const products = [{ category: 'Case', name: 'AEROCOOL P500C', price: '3700', company: 'AeroCool' }, { category: 'PSU', name: 'Lux 750', price: '1,999', company: 'AeroCool' }];
const r = run('Plan app changes', {
  'Find app changes': [
    { document: doc('new1', { appNew: true, appDirty: true, items: [{ category: 'Case', name: 'AEROCOOL P500C' }, { category: 'PSU', name: 'Lux 750' }], priceAfter: '5000', offer: '', feedback: '', appEdits: { x: 1 } }) },
    { document: doc('del1', { appDeleted: true, appDirty: true, fbStatus: 'Scheduled', fbPostId: '1' }) },
    { document: doc('del2', { appDeleted: true, appDirty: true, fbStatus: 'Published', posterUrl: 'https://drive.google.com/file/d/ABCDEFGHIJKLMNOPQRSTUV12/view' }) },
    { document: doc('ed1', { appDirty: true, offer: 'Approved', feedback: 'Done', posterUrl: 'https://drive.google.com/file/d/x/view', items: [{ name: 'Lux 750', category: 'PSU' }], appEdits: { feedback: 'Done' } }) },
  ],
  'Read product list': [{ found: { name: 'x/catalog/products', fields: L.fieldsOf({ items: products }) } }],
  'Last post': [{ document: doc('z', { order: 90 }) }],
});
console.log(JSON.stringify(r[0].json.bin), r[0].json.writes.length);
for (const w of r[0].json.writes) console.log(w.delete ? 'DELETE ' + w.delete.split('/').pop() : (w.update.name.split('/').pop() + ' ' + JSON.stringify(L.dec({ mapValue: { fields: w.update.fields } })) + ' mask=' + (w.updateMask ? w.updateMask.fieldPaths : '')));
const pl = run('Plan lists', {
  'Settings': [{ categories: 'MB,Case,PSU' }],
  'Read price list': [{ valueRanges: [{ values: [['B550', '', '4,900', '', 'Asus']] }, { values: [['AEROCOOL P500C', '', '3800', '', 'AeroCool'], ['#N/A']] }, {}] }],
  'List backgrounds': [{ files: [{ name: 'Static.png' }, { name: 'Static BlackFriday.jpg' }, { name: 'notes.txt' }] }],
  'Read lists': [{ found: { name: 'x/catalog/products', fields: L.fieldsOf({ items: products }) } }],
});
console.log(JSON.stringify(pl[0].json).slice(0, 600));
const rp = run('Reprice posts', { 'Plan lists': [pl[0].json], 'Read open posts': [{ document: doc('a', { items: [{ category: 'Case', name: 'AEROCOOL P500C' }], priceBefore: '3,700', company: 'AeroCool' }) }] });
console.log(JSON.stringify(rp[0].json.writes.slice(-1)));
