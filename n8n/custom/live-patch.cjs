// How the live App engine ('Plan app changes', qRX3fplFZLoSmgir) and Posts store ('Apply', e0uQUJm6ImAuoEfV) were
// patched for text, photo and video posts on 2026-11-17: the same changes as lib.js / engine-app.js, applied as exact
// string patches to the live node code (other threads change those nodes too). Usage: node live-patch.cjs <dir> with
// live-engine.js, gen.cjs (store code from lib.js + store-apply.js) in <dir>; writes out-engine.js and out-store.js.
const fs=require('fs');const S=process.argv[2];
const once=(c,a,b)=>{if(c.split(a).length!==2)throw new Error('not once: '+a.slice(0,60));return c.replace(a,b);};
const FNS=`const KINDS = ['text', 'image', 'video'];
const kindOf = f => KINDS.includes(clean(f && f.kind)) ? clean(f.kind) : '';
function placesOf(f) {
  if (kindOf(f) === 'text') return ['fb'];
  const p = clean(f.places).split('+').filter(w => w === 'fb' || w === 'ig');
  return p.length ? [...new Set(p)] : ['fb', 'ig'];
}
const isPub = s => /^(published|posted)/i.test(clean(s));
const isFail = s => { const v = clean(s); return v !== '' && !isPub(v) && !/^(scheduled|cancelled|waiting|posting)\\b/i.test(v); };
function customZone(f) {
  const places = placesOf(f);
  const st = w => w === 'fb' ? f.fbStatus : f.igStatus;
  if (clean(f.takeDown) === 'done') return 'posted';
  if (places.some(w => isFail(st(w)))) return 'fix';
  if (places.every(w => isPub(st(w)))) return 'posted';
  if (/^(done|cancel)$/i.test(clean(f.feedback))) return 'approved';
  return 'design';
}
function customWork(f) {
  if (!kindOf(f) || f.appDeleted === true || clean(f.takeDown)) return false;
  const ex = (f.ex && typeof f.ex === 'object') ? f.ex : {};
  const fb = low(f.feedback);
  if (fb === 'cancel') return true;
  if (clean(f.fbPostId) && !isPub(f.fbStatus)) return true;
  if (clean(ex.igContainer)) return true;
  if (fb !== 'done') return false;
  if (!(clean(f.postDate) && clean(f.postTime)) && low(f.postNow) !== 'yes') return false;
  const places = placesOf(f);
  return (places.includes('fb') && !isPub(f.fbStatus) && !isFail(f.fbStatus)) || (places.includes('ig') && !isPub(f.igStatus) && !isFail(f.igStatus));
}
`;
function lib(c){
  c=once(c,'function zoneOf(f) {\n','function zoneOf(f) {\n  if (kindOf(f)) return customZone(f);\n');
  c=once(c,'function queuesOf(f) {\n','function queuesOf(f) {\n  if (kindOf(f)) return customWork(f) ? [\'custom\'] : [];\n');
  c=once(c,'  return open.length > 0;\n}\n','  return open.length > 0;\n}\n'+FNS);
  return c;
}
function eng(c){
  c=once(c,'let build = false;\n','let build = false;\nlet customNow = false;\n');
  c=once(c,"  if (f.appNew === true || 'items' in edits) {\n","  const custom = kindOf(f);\n  if ((f.appNew === true || 'items' in edits) && !custom) {\n");
  c=once(c,"  g.zone = zoneOf(g); g.q = queuesOf(g); mask.add('zone'); mask.add('q');\n","  if (custom && !clean(g.takeDown) && ['caption', 'media', 'places', 'postDate', 'postTime', 'postNow', 'feedback'].some(k => k in edits)) {\n    for (const k of ['fbStatus', 'igStatus']) if (isFail(g[k])) { g[k] = ''; mask.add(k); }\n  }\n  g.zone = zoneOf(g); g.q = queuesOf(g); mask.add('zone'); mask.add('q');\n  if (custom && g.q.includes('custom')) customNow = true;\n");
  c=once(c,"  if (low(g.feedback) === 'cancel' || (clean(g.scheduledFor) && g.q.includes('changes'))) sched.add('changes');","  if (!custom && (low(g.feedback) === 'cancel' || (clean(g.scheduledFor) && g.q.includes('changes')))) sched.add('changes');");
  c=once(c,"build, sched: [...sched]","build, custom: customNow, sched: [...sched]");
  return c;
}
const AF=Object.getPrototypeOf(async function(){}).constructor;
const e=eng(lib(fs.readFileSync(S+'/live-engine.js','utf8')));new AF(e);fs.writeFileSync(S+'/out-engine.js',e);
const g=require(S+'/gen.cjs')(S+'/head').store;const s=lib(g);new AF(s);fs.writeFileSync(S+'/out-store.js',s);
console.log('ok',e.length,s.length);
