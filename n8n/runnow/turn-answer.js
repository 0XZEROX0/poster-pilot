// "Answer" Code node: what the calling workflow gets back. take -> { ok, turn, updateTime }; give -> { ok }.
const j = $input.first().json || {};
if ($('When asked').first().json.op === 'give') return [{ json: { ok: !!j.commitTime, given: true } }];
return [{ json: { ok: j.ok === true, turn: j.turn || 'busy', updateTime: j.updateTime || '', why: j.why || '' } }];
