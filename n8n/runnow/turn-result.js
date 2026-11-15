// "Turn result" Code node: 'mine' = this run has the turn; 'lost' = another run took it a moment earlier;
// 'open' = the database answered with something unexpected, so the run goes ahead without a turn.
const j = $input.first().json || {};
const wait = $('Plan turn').last().json.wait === true;
const res = (j.writeResults || [])[0];
if (res && res.updateTime) return [{ json: { ok: true, turn: 'mine', updateTime: res.updateTime } }];
const err = JSON.stringify(j.error || j);
if (/FAILED_PRECONDITION|ALREADY_EXISTS|409/i.test(err)) return [{ json: { ok: false, turn: 'lost', retry: wait } }];
return [{ json: { ok: true, turn: 'open', updateTime: '', note: err.slice(0, 300) } }];
