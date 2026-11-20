// n8n Workflow SDK code for "Static OS - Post at time" (2026-11-20).
// A post whose time is too close for Facebook's schedule (under 30 minutes) waits in the app instead. The scheduler (posters)
// or the text/photo/video posts workflow starts this workflow once for that post, without waiting for it. It sleeps until the
// post's minute (n8n keeps a waiting run in its database, so it survives a restart, and it costs no Firestore reads while it
// waits), then starts the right workflow, which publishes the post at once.
import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const start = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.1,
  config: { name: 'When a post must wait', parameters: { inputSource: 'passthrough' } }
});

const waitTill = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Wait until its minute',
    notes: 'Sleeps until the post time ($json.at, ISO with the Cairo offset). A time already passed goes on at once.',
    parameters: { resume: 'specificTime', dateTime: expr('{{ $json.at }}') }
  }
});

const isCustom = ifElse({
  version: 2.2,
  config: {
    name: 'Text, photo or video post?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr("{{ $json.target === 'custom' }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const customAsk = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Ask posts workflow',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "return [{ json: { round: 0, by: 'post-at-time' } }];" }
  }
});

const queueAsk = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Ask scheduler queue',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "return [{ json: { parts: ['queue'], by: 'post-at-time' } }];" }
  }
});

const runCustom = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Run text, photo and video posts',
    parameters: {
      source: 'database', mode: 'once', options: { waitForSubWorkflow: false },
      workflowId: { __rl: true, mode: 'id', value: 'loraXApCLeMZ2aP8', cachedResultName: 'Static OS - Text, photo and video posts' }
    }
  }
});

const runQueue = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Run scheduler queue',
    parameters: {
      source: 'database', mode: 'once', options: { waitForSubWorkflow: false },
      workflowId: { __rl: true, mode: 'id', value: 'Oa5WOuoSdrNquHHe', cachedResultName: 'Static OS - Schedule Posters To Facebook and Instagram' }
    }
  }
});

export default workflow('post-at-time', 'Static OS - Post at time')
  .add(start)
  .to(waitTill)
  .to(isCustom.onTrue(customAsk.to(runCustom)).onFalse(queueAsk.to(runQueue)));
