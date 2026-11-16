# Instant poster builds

Before: a change in the app waited for the App engine (every minute) and then for the poster workflow
(every 3 minutes), so a new poster could take up to 4 minutes to start. Now it starts within seconds.

1. The app (`src/data/nudge.ts`) sends a "knock" to the engine's webhook right after a change it saves
   (new post, approved offer, Redo, delete...). The knock is a form POST with the person's Firebase sign-in
   token only; several changes in a row send one knock (3 s after the last change, at most 15 s after the first).
   The webhook allows the app's address (CORS, checked 2026-11-16: it answers 200 with
   `access-control-allow-origin: https://0xzerox0.github.io`), so the app reads that the knock arrived. If it did
   not, the app knocks again after 3, 10 and 30 s, and shows it on the engine dot and in Settings > Engine.
2. "Static OS - App engine" (`qRX3fplFZLoSmgir`), trigger **App nudge** (`POST /webhook/static-os-nudge`):
   - `onlyRunIf` drops requests without a token-shaped value (no execution is created).
   - **Who is asking** checks the token with Google (`identitytoolkit accounts:lookup`, the app's public key).
   - **Is a member** reads `members/{uid}`; **Member?** stops the run unless that member exists.
   - Then the usual "app changes" steps run at once. `Plan app changes` (`../direct/engine-app.js`) now also
     returns `build: true` when a post needs a poster now (approved, Redo, missing photo), and
     **Build now?** -> **Start poster run** starts the poster workflow without waiting for it.
   The every-minute run does the same, so the poster also starts within a minute when the knock does not arrive.
3. "Static OS - Build Posters" (`fxLNBzuRpZjweUgr`) has a second trigger **When engine asks** and a
   one-run-at-a-time guard in front of `Read Posts Rows` (both for it and for the 3-minute schedule):
   - `Read build turn` / `Plan build turn` (`plan-turn.js`) / `Take build turn` / `Turn result` (`turn-result.js`):
     the turn is the document `status/posterRun` `{until, by, at}`, taken with a Firestore precondition
     (`updateTime` or `exists:false`), so two runs can never both get it. It lasts 2 minutes at most.
   - `Hand back turn` runs right after `Claim Rows` has marked the posts WORKING (WORKING keeps other runs away
     from then on); `Hand back turn at the end` runs last for runs that had nothing to build.
   - A run started by the engine that finds the turn taken waits 3 s and tries again (up to 40 times, 2 minutes;
     was 15 s x 8 until 2026-11-16).
     A scheduled run just stops; the next one comes 3 minutes later.
   - If the database answers with something unexpected, the run goes ahead without a turn (as before).
   - `Skip Busy Rows` (`skip-busy-rows.js`) treats engine-started runs like scheduled ones (MISSING photos are
     still retried only every 15 minutes, AI errors only on Redo).

The schedules stay as the fallback, so nothing is lost when the PC or the knock is offline.
