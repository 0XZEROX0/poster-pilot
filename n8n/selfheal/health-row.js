// "Health row" Code node (Static OS - Self-heal, after "What needs fixing").
// One row for the System health page (data table "Static OS - health checks", src selfheal):
// website 1 = order alerts arrive, 0 = stuck for more than 15 minutes; meta 1 = token works, 0 = Facebook refused it;
// -1 = could not tell (for example no internet).
const first = name => { try { return $(name).first().json || {}; } catch (e) { return {}; } };
const now = Date.now();
const order = first('Read newest website order');
const timing = first('Read hook timing');
const me = first('Check Facebook token');
const modified = order.date_modified_gmt ? Date.parse(order.date_modified_gmt + 'Z') : 0;
const stalled = modified > 0 && now - modified > 15 * 60000 && modified > Number(timing.lastHook || 0) + 60000;
const msg = me.error ? String(me.error.message || me.error.description || JSON.stringify(me.error)) : '';
const meta = me.id ? 1 : (me.error && !/timeout|ECONN|ENOTFOUND|EAI_AGAIN|socket|network|aborted/i.test(msg) ? 0 : -1);
const website = modified > 0 ? (stalled ? 0 : 1) : -1;
const open = (first('What needs fixing').open || []).join(', ');
return [{ json: { at: now, src: 'selfheal', internet: -1, website, meta, disk: -1, up: -1, n8n: -1, note: open } }];
