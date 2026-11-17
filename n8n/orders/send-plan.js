// "What to send" Code node: orders whose status was changed in the app (want = the WooCommerce status to send).
// One WooCommerce batch request for all of them. Always returns one item; `send` says whether to send.
const docs = $input.all().map(i => i.json && i.json.document).filter(Boolean).map(d => ({ name: d.name, updateTime: d.updateTime, f: fieldsOf(d) }))
  .filter(d => d.f.want && d.f.wooId);
const update = docs.map(d => ({ id: d.f.wooId, status: d.f.want }));
return [{ json: { send: update.length > 0 && !DRY, dry: DRY, count: update.length, body: { update }, docs } }];
