# Run timed workflows from the app

Every n8n workflow that runs on a timer can also be started by the app, right when it is needed, instead of
waiting for its next check. The timers stay as the fallback (engine computer was off, no connection...).

## How the app asks

The app POSTs `token=<Firebase ID token>&run=<jobs>` to the engine webhook (`VITE_ENGINE_NUDGE_URL`,
`/webhook/static-os-nudge` on the App engine `qRX3fplFZLoSmgir`). The engine checks the token with Google and that
the person is a member (`members/{uid}`), then `What to run` (what-to-run.js) and the `Run which` switch start:

| job | what starts |
| --- | --- |
| app | Find app changes (carry out post changes); from there `Build now?` starts the poster workflow and `Scheduler now?` the scheduler parts the change needs |
| lists | the engine's product list / reprice branch (`Settings`, normally every 10 minutes) |
| poster | Static OS - Build Posters `fxLNBzuRpZjweUgr` |
| queue, changes, captions, status, instagram | Static OS - Schedule Posters `Oa5WOuoSdrNquHHe` with `{ parts }` |
| move | Move Published Posters `9lDhcMvHhbodLi8L` |
| market | Competitor Prices `cBTEsBYTVhNS8p7q` |
| photos | Website photos `7WRJVybLkYgJh0Nh` |
| website | Website sync (app to site) `GLZ7NazaF82FZm9S` |
| pull | Website to app `fHuULHd2qUV5IMAn` |

Each of those workflows has a `When app asks` Execute Workflow Trigger next to its timer.

When the app sends what:
- a post change that the engine carries out: `app` (debounced 800 ms, several changes send one knock)
- Check prices again (marketAsk): `market`; website photo picker (photoAsk): `photos`
- a price list save: `lists,website`; caption templates save: `captions,changes`
- Settings > General > Engine > Run now: the row's jobs, or all of them

`Plan app changes` (plan-app-changes.js, same as ../direct/engine-app.js) adds `sched`: `queue` when a Done post
has its Post date and Post time, `changes` for a cancel or a change to a scheduled post, `captions` for a post
without a caption.

## One run at a time

`Static OS - Run turn (sub-workflow)` `WhMqnfr8mJS2480G` (turn-plan.js, turn-result.js, turn-answer.js,
build-turn.cjs) hands out a turn per key: Firestore `status/run_<key>` `{ until, by, at }`, taken with an
`updateTime` / `exists:false` precondition so two runs can never both get it, and it lasts `seconds` at most.
Inputs `{ op: take|give, key, seconds, wait, updateTime, by }`; take answers `{ ok, turn: mine|busy|lost|open,
updateTime }`. With `wait` it tries again every 10 seconds (up to 9 times). A database error means "go ahead".

The scheduler parts that post to Facebook / Instagram or cancel posts use it (keys `sched-queue` 600 s,
`sched-instagram` 300 s, `sched-changes` 300 s): trigger -> `Take turn (...)` -> `Got turn (...)?` -> the part,
plus `Give back turn (...)` placed lower so it runs after the whole part. A run started by the app waits for its
turn; a timer run that finds it busy stops. The poster workflow has its own turn (status/posterRun, see
../instant). The other workflows are safe to overlap (preconditioned writes, or moves that cannot happen twice),
so they skip the turn to save Firestore writes.

call.cjs makes the Execute Workflow parameters for the turn; sched-ops.cjs and engine-ops.cjs print the
update_workflow operations that were applied.
