// "Again soon?" Code node: after a run that did something (and while this is round 1 to 5), the workflow starts itself
// again 30 seconds later, so Instagram follows Facebook and Instagram's "ready" check comes quickly, not 5 minutes later.
let acted = 0;
try { acted = $('One action each').all().length; } catch (e) { acted = 0; }
let round = 0;
try { round = $('When engine asks').isExecuted ? Number(($('When engine asks').first().json || {}).round) || 0 : 0; } catch (e) { round = 0; }
return acted > 0 && round < 5 ? [{ json: { round: round + 1 } }] : [];
