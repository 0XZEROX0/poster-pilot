# Text, photo and video posts

Asked for on 2026-11-17: besides product posters, the app can make a **text post** (Facebook only, because Instagram
does not allow a post without a picture), a **photo post** (1 to 10 photos: an album on Facebook, a carousel on
Instagram) and a **video post** (a video on Facebook, a Reel on Instagram), with a caption, places, date and time.

## App fields (posts/{id})

| field | meaning |
| --- | --- |
| `kind` | `text`, `image` or `video`. Missing = product poster. Set when the post is made; never changes. |
| `media` | `[{ id, type, w?, h? }]`: Google Drive files in AI Designs / Uploads, shared by link. |
| `places` | `fb+ig` (default), `fb` or `ig`. A text post is always `fb`. |
| `ex.key` | engine: what was put on Facebook's schedule (a change takes it off and schedules it again). |
| `ex.igContainer`, `ex.igMadeAt` | engine: the Instagram post being made ready. |

These posts skip the offer step and have no poster: they start in Review (`zone` design), "Approve now" in New post
approves them at once, and they go out at their date and time (or Post now). `lib.js` gives them their own zone rule
(`customZone`) and one queue, `custom`, while there is something to send, check or cancel (`customWork`).

## Why Google Drive and not Firebase Storage

Firebase Storage needs the paid (Blaze) plan. Uploads go to Drive instead: workflow **Static OS - Upload post media**
(`FADMnE9NHGVRS668`, webhook `static-os-media`, built by `media.cjs`) checks the sign-in, starts a Drive resumable
upload for the browser (the file goes straight from the phone to Drive, not through the n8n computer), then checks the
file and shares it "anyone with the link" so Facebook and Instagram can fetch it.

## Workflow "Static OS - Text, photo and video posts" (`loraXApCLeMZ2aP8`, built by `build.cjs`)

Started by the App engine at once ("Custom posts now?") and every 5 minutes (one query: `q` contains `custom`).
One turn at a time (`status/run_custom-posts`). `plan.js` picks one step per post per run, and the workflow starts
itself again 30 seconds later while it did something (up to 6 rounds):

1. Cancel: delete the post from Facebook's schedule, empty the time, keep it approved.
2. A change on a scheduled post (`ex.key`), or no longer approved: delete it from Facebook's schedule; scheduled again next run.
3. Facebook: text `/feed`; photos uploaded hidden then `/feed` with `attached_media`; video `/videos` with `file_url`.
   Scheduled (`scheduled_publish_time`), or published at once for Post now. At least 15 minutes ahead, at most 75 days.
4. Instagram cannot hold a post on a schedule: when the time comes, the photo(s) (as hidden Facebook photos, for a JPEG
   link) or the video (Drive link) become a container, then a CAROUSEL or REELS container; a later round publishes it
   when Instagram says FINISHED (`media_publish`). More than 12 hours late (workflows off): an error instead.
5. After its time, check that Facebook published the scheduled post.

Meta calls never retry (a retry could post twice). Errors go to FB status / IG status and show in Fix; any change to the
post or approving it again clears them, and it is tried again. `result.js` turns each answer into the post's changes;
`save.js` saves them with zone, queue and history lines.

`live-patch.cjs`: how the live engine and store nodes were patched (string patches on the live code).
