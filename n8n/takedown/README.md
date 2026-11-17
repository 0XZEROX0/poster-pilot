# Delete from Facebook and Instagram

A published post can be taken off the Facebook Page and Instagram from Static OS. Asked for on 2026-11-17.
Deleting a post in the app (the old Delete) still only removes it from the app and never touches Facebook or Instagram.

## Can Instagram posts be deleted?

Yes, since Meta's December 2025 update ("IG Media Deleting API", Instagram API with Facebook Login):
`DELETE /{ig-media-id}` on graph.facebook.com, with the `instagram_manage_contents` permission on the token.
The scheduler's credential "Meta Page Token" (`mkgnFIzTWTgamXBY`) is a Facebook Login Page token. If it was made
without `instagram_manage_contents`, the Instagram part answers "(#10) ... permission" and the app shows
"Not fully removed" with that note; the token then needs that permission added and the delete pressed again.

## App

- Post editor, published posts only: **Delete from Facebook and Instagram** (permission `social.delete`, "Delete from
  Facebook and Instagram"; the owner and the built-in Admin have it, the built-in Member does not, saved roles must
  tick it). The confirm says it cannot be undone and the button only works after typing `DELETE` (or `حذف`).
- Pressing it writes `takeDown: 'asked'`, `takeDownAt` (ms), `takeDownBy` (name) and a history line
  `social.delete`, then knocks on the engine with `run=takedown`. These fields are not copied to `appEdits`, so the
  App engine's post changes part is not involved.
- The post stays in the app. Chip: "Being removed", then "Removed from FB + IG" or "Not removed"; the editor shows
  the engine's note. A failed try can be pressed again. "Open on Facebook" is hidden once it is removed.
- Rules: `takeDown*` need `social.delete`, only `'asked'`, only when `fbStatus == 'Published'` and the post was not
  asked already (or failed). `takeDownNote` / `takeDownTry` are engine only. 12 new emulator checks.

## n8n

- New workflow **Static OS - Delete from Facebook and Instagram** `AeH2jEtA0kOCPrhK` (build.cjs, plan.js,
  one-each.js, result.js): `When app asks` / hourly safety run / manual -> runQuery posts where takeDown in
  (asked, working) -> `Plan` (stuck `working` > 30 min is tried again) -> `Claim posts` (takeDown working, updateTime
  precondition, so two runs never take the same post) -> `Delete Facebook post` (DELETE /{fbPostId}) ->
  `On Instagram?` (IG id from IG status "Posted/Published ... (id)") -> `Delete Instagram post` -> `Result` ->
  `Save result` (takeDown done/failed, takeDownNote, IG status, queues without ig/status/story, history lines
  `fb.removed`, `ig.removed`, `takedown.error`).
- "Already gone" answers count as removed. fbStatus stays `Published` so no other part picks the post up again.
  An IG post that was never made gets IG status "Not posted - removed from Facebook first", so the Instagram part
  can never post it after its Facebook post is gone.
- The hidden photo the Facebook post was made from is left alone (it was uploaded unpublished and is not visible).
- App engine `qRX3fplFZLoSmgir`: `What to run` accepts `takedown`; `Run which` output 10 "Remove from Facebook and
  Instagram" -> `Start removing posts` (engine-ops.cjs prints the operations).
- Firestore reads: one query per hour when nothing is asked.
