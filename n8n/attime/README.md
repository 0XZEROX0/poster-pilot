# Post at a time Facebook won't schedule

Asked for on 2026-11-20: Facebook only takes a scheduled post when its time is far enough ahead (we keep 30 minutes),
and Instagram has no schedule at all. A post whose Post date/time is closer than that still goes out at its minute.

## How it works

- **Under 30 minutes away** (and still ahead): the post is NOT put on Facebook's schedule. Its FB status becomes
  `Waiting to post at 17:00 from the app`, and the workflow starts one timer for it.
- **The timer** is workflow **Static OS - Post at time** (`O7LGzamX1eTPHxIs`, folder Static OS / Posters & Facebook,
  source `post-at-time.sdk.js`). It is started without waiting and sleeps in a Wait node until the minute
  (n8n keeps waiting runs in its database, so a restart does not lose them, and no Firestore reads happen while it
  waits). Then it runs the scheduler's queue part (posters) or the text/photo/video posts workflow.
- **At the minute**: that run sees the waiting post is due and publishes it at once through the Post now path
  (`published: true`); Instagram follows right after, as for Post now.
- **30 minutes or more ahead**: unchanged, Facebook's own schedule.
- A waiting post whose minute was missed (server off) is still sent up to 2 hours late, never later; then the status
  says so. A time already in the past that was never waiting is reported, as before (but a time set to the current
  minute, up to 2 minutes back, goes out at once).
- **Cancel schedule** works as before (Feedback Cancel -> FB status Cancelled, date/time emptied). The timer still
  fires, finds nothing due and does nothing. Changing the time gives a new waiting status and a new timer (or Facebook's
  schedule if it is now 30+ minutes ahead); an old timer that fires early finds nothing to do.
- Only one timer per post and time: a new timer starts only when the waiting status text changes.

## Changed nodes

- Scheduler `Oa5WOuoSdrNquHHe`: `Plan Queue` (plan-queue.js) -> new `Post from the app later?` -> true:
  `Save waiting status` (store write FB status) + `Timers to start` -> `Start post timer`; false: Download Design as before.
  `Find Changed Posts` (find-changed-posts.js) no longer reports times under 15 minutes.
- Text, photo and video posts `loraXApCLeMZ2aP8`: plan (../custom/plan.js) gives `note` + `wait` for such posts; new
  `Timers to start` -> `Start post timer` hang off `One action each`. Instagram-only posts get the same timer
  (IG status `Waiting to post at ...`), instead of waiting for the next 5-minute check.
- `ops.cjs` prints the update_workflow operations (`node ops.cjs sched`, `node ops.cjs custom <live One action each>`).

## App

`logic.ts`: `LOCAL_POST_MIN`, `waitsInApp`, `minutesUntil`, `postsFromApp`. The post chip shows
"Today · 5:00 PM · from the app", and the post editor explains it under the time when the time is under 30 minutes away.
No rules change.
