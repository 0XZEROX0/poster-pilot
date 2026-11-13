// Cuts the planned database writes into batches. In a dry run nothing is written.
const plan = $('Plan sync').first().json;
if (plan.dryRun) return [];
const size = 150;
const out = [];
for (let i = 0; i < plan.writes.length; i += size) out.push({ json: { start: i, writes: plan.writes.slice(i, i + size) } });
return out;
