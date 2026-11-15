# Post now

An approved post (Feedback Done, poster ready, not on Facebook yet) can be published on Facebook and Instagram at
once instead of waiting for a Post date and time. Asked for on 2026-11-15.

## App

- Post editor: **Post now** (only for people whose role has "Schedule posts", rules `postNow` needs `schedule`).
  It asks "Publish to Facebook and Instagram now?" first. Hidden while there are unsaved changes, once Facebook holds
  the post, or after it was already pressed (the post then shows "Posting now").
- Pressing it writes `postNow: 'yes'` and `postDate` / `postTime` = the Cairo minute of the press, plus a history line
  `schedule.postnow` (shows on the post's history and the Activity page). Then it knocks on the engine (`app`).
- Giving the post a new date or time (editor or Planner) before it went out clears `postNow`.

## n8n

- Posts store `e0uQUJm6ImAuoEfV`: new column `Post now` <-> field `postNow` (lib.js HEADERS / TYPED).
- Engine: no change. A Done post with a Post date and time already starts the scheduler's queue part at once.
- Scheduler `Oa5WOuoSdrNquHHe` (sources here):
  - `Plan Queue` (plan-queue.js): a row with Post now = yes, no FB post id, and a press from the last 2 hours is
    published now (`postNow`, `slot` = now). At most 5 per run, ahead of scheduled rows.
  - `Schedule Facebook Post`: `published: true` (no `scheduled_publish_time`) for those rows. No retries on this node.
  - `Save Slot To Sheet`: FB status `Published`, Scheduled for / Post date / Post time = the real minute, Post now
    emptied (also emptied on a Facebook error, so it is never tried twice by itself).
  - `Give back turn (Queue)` -> `Instagram now?` -> `Start Instagram now` (this workflow, parts `instagram`): Instagram
    publishes at once through its normal path (Scheduled for = Post date/time, time has come).
  - `Find Changed Posts` (find-changed-posts.js): a Post now press older than 2 hours that never went out is turned
    off with FB status "Post now was not done in time - press Post now again or set a Post date and time". A cancel
    also empties Post now. `Clear Row For Reschedule` passes `Post now` through when the check set it.

## No double posting

- The queue part runs one at a time (turn `sched-queue`, see ../runnow), and only picks rows with no Scheduled for
  and no FB post id. The save right after the Facebook call fills both.
- The app hides the button once `postNow` is set; the rules let only schedulers set it.
- A late press (engine off for hours) is never posted late; it is turned off with a note.

ops.cjs prints the update_workflow operations that were applied (`node ops.cjs sched`).
