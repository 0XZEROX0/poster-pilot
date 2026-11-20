// "Order links to send" Code node: the order links customers filled in (state 'filled', found by "Find order links").
// Each one is claimed first (state 'sending', only if the link did not change since it was read), so two runs at the
// same time never make two website orders for one link. Always returns one item; `claim` says whether there is any.
const docs = $input.all().map(i => i.json && i.json.document).filter(Boolean)
  .map(d => ({ name: d.name, id: d.name.split('/').pop(), updateTime: d.updateTime, f: fieldsOf(d) }))
  .filter(d => d.f.state === 'filled' && d.f.form && typeof d.f.form === 'object');
const writes = docs.map(d => ({
  update: { name: d.name, fields: { state: ev('sending'), sendingAt: { timestampValue: NOW } } },
  updateMask: { fieldPaths: ['state', 'sendingAt'] },
  currentDocument: { updateTime: d.updateTime },
}));
return [{ json: { claim: docs.length > 0 && !DRY, dry: DRY, count: docs.length, writes, docs } }];
