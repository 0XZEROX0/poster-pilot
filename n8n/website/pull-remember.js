// "Remember what was saved" Code node: the website values of a category that was saved are marked as looked at, so
// they are not read again. A category that failed (it changed in the meantime) is tried again next run.
const sd = $getWorkflowStaticData('global');
sd.seen = sd.seen || {};
const done = [];
$input.all().forEach((it, i) => {
  const m = $('Decide and build changes').itemMatching(i);
  const p = m && m.json;
  if (!p || !(it.json && it.json.commitTime)) return;
  for (const [key, snap] of p.seen) sd.seen[key] = snap;
  done.push(p.cat);
});
return [{ json: { saved: done } }];
