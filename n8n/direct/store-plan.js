// Posts store, step 1: works out what to ask the database.
// Called by the poster and scheduling workflows in place of their old "read the Posts sheet" and
// "update a row" steps. Input items: { op: 'read', purpose, raw } or { op: 'write', id, cols }.
const PROJECT = 'poster-pilot-8d35e';
const DB = 'projects/' + PROJECT + '/databases/(default)/documents';
const items = $input.all().map(i => i.json);
const first = items[0] || {};
const op = String(first.op || 'read');
if (op === 'write') {
  const ids = [...new Set(items.map(j => String(j.id || '').trim()).filter(id => /^[A-Za-z0-9_-]{4,40}$/.test(id)))];
  return [{ json: { op, url: DB + ':batchGet', body: { documents: (ids.length ? ids : ['-']).map(id => DB + '/posts/' + id) } } }];
}
const purpose = String(first.purpose || '');
if (purpose === 'templates') return [{ json: { op, purpose, url: DB + ':batchGet', body: { documents: [DB + '/catalog/templates'] } } }];
const from = [{ collectionId: 'posts' }];
const structuredQuery = purpose === 'all' ? { from } : { from, where: { fieldFilter: { field: { fieldPath: 'q' }, op: 'ARRAY_CONTAINS', value: { stringValue: purpose } } } };
return [{ json: { op, purpose, url: DB + ':runQuery', body: { structuredQuery } } }];
