const L = (() => { const m = { exports: {} }; new Function('module', require('fs').readFileSync(__dirname + '/lib.js', 'utf8'))(m); return m.exports; })();
const F = process.argv[2];
const vals = JSON.parse(require('fs').readFileSync(F)).values;
const head = vals[0];
let bad = 0, n = 0;
for (let i = 1; i < vals.length; i++) {
  const r = vals[i]; const g = h => (r[head.indexOf(h)] ?? '');
  if (![1,2,3].some(k => g('Item ' + k)) && !g('Image link')) continue;
  n++;
  // like the sync: items with slots
  const items = [];
  for (const k of [1,2,3]) if (g('Item ' + k)) items.push({ slot: k, category: g('Category ' + k), name: g('Item ' + k), manualPhoto: g('Manual photo ' + k), nextPhoto: g('Next photo ' + k).toUpperCase() === 'TRUE' });
  const cols = {}; head.forEach((h, c) => cols[h] = r[c] ?? '');
  const { f } = L.applyCols({ items }, cols);
  const row = L.rowOf({ id: 'x' + i, f }, false);
  for (const h of head) {
    if (h === 'Preview') continue;
    const want = String(cols[h] ?? ''); const have = String(row[h]);
    const w2 = /^Next photo/.test(h) && want === '' ? 'FALSE' : want;
    if (w2 !== have) { bad++; if (bad < 15) console.log(i + 1, h, JSON.stringify(want).slice(0, 60), '!=', JSON.stringify(have).slice(0, 60)); }
  }
  if (i === 83) console.log(L.zoneOf(f), L.queuesOf(f), JSON.stringify(L.rowOf({id:'a',f}, true)).slice(0,400));
}
console.log('rows', n, 'mismatches', bad);
