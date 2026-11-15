// Did this run get the turn? 'mine' = yes; 'lost' = another run took it a moment earlier;
// 'open' = the database answered with something unexpected, so the run goes ahead without a turn (as before this check existed).
const j = $input.first().json || {};
const nudged = $('Plan build turn').first().json.nudged === true;
const res = (j.writeResults || [])[0];
if (res && res.updateTime) return [{ json: { turn: 'mine', updateTime: res.updateTime, nudged } }];
const errText = JSON.stringify(j.error || j);
if (/FAILED_PRECONDITION|ALREADY_EXISTS|409/i.test(errText)) return [{ json: { turn: 'lost', nudged } }];
return [{ json: { turn: 'open', nudged, note: errText.slice(0, 300) } }];
