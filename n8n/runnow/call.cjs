// Helper: the parameters of an Execute Workflow node that calls "Static OS - Run turn".
const TURN = 'WhMqnfr8mJS2480G';
const field = (id, type) => ({ id, displayName: id, required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type, removed: false });
module.exports = (value) => ({
  source: 'database', mode: 'once', options: { waitForSubWorkflow: true },
  workflowId: { __rl: true, mode: 'id', value: TURN, cachedResultName: 'Static OS - Run turn (sub-workflow)' },
  workflowInputs: { mappingMode: 'defineBelow', value, matchingColumns: [], attemptToConvertTypes: false, convertFieldsToString: false,
    schema: [field('op', 'string'), field('key', 'string'), field('seconds', 'number'), field('wait', 'boolean'), field('updateTime', 'string'), field('by', 'string')] },
});
