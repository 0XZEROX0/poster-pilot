# Stories on Facebook and Instagram

Asked for on 2026-11-17: any post can also go out as a story on the Facebook Page and on Instagram. Plan:
`/mnt/project-files/plans/stories-and-story-editor-plan.md` (project files). This is step 1 (automatic story picture);
the story editor comes next.

## What Meta allows (checked 2026-11-17)

- Facebook Page photo story: upload the photo hidden (`POST /{page}/photos`, `published=false`), then
  `POST /{page}/photo_stories` with `photo_id`. A photo already used in a published post can't be a story, so the story
  always gets its own picture.
- Instagram story: `POST /{ig}/media` with `media_type=STORIES` and `image_url`, wait, then `POST /{ig}/media_publish`.
  50 API posts a day (stories most likely count). Business accounts only.
- Neither can schedule a story, so the Stories part posts it when its time comes. No tappable stickers, links, polls,
  mentions or music through the API.

## App fields (posts/{id}) and store columns

| field | column | who writes |
| --- | --- | --- |
| `story` (`''`, `fb`, `ig`, `fb+ig`) | Story | app (needs `schedule`) |
| `storyDelay` (minutes, `''` = same time) | Story delay | app (needs `schedule`) |
| `storyImage` (Drive link, 1080x1920) | Story image | engine |
| `storyFbStatus`, `storyIgStatus` (`''`, `Waiting`, `Posted`, error text) | Story FB status, Story IG status | engine |
| `ex.storyFrom` (poster link the picture was made from) | Story from | engine |
| `ex.storyPhotoId`, `ex.storyFbId`, `ex.storyIgId` | Story photo id, Story FB id, Story IG id | engine |

`lib.js` (Posts store + engine): new queue `story` (approved post with a poster, a chosen place that is neither
posted nor failed); history lines `story.made`, `story.fb`, `story.ig`, `story.error`. `engine-app.js`: a new story
choice sets the chosen places to `Waiting` (clears a failure = "Try the story again"), empties places taken off, and
starts the `instagram` scheduler part at once.

## Scheduler part "Stories" (runs right after the Instagram part, in the same turn `sched-instagram`)

1. `Read Story Queue`: Posts store `{ op: 'read', purpose: 'story', raw: true }` (one query per run, no new timer).
2. `Plan Stories` (plan-stories.js): one item per post with `make`, `fb`, `ig` (max 4 posts per run).
3. `Make story?` -> `Download Poster` (Drive, posterId) -> `Make Story Picture` (Edit Image, multi step):
   1080x1920 canvas; the poster resized to 1920x1920, centred crop, blurred and darkened as background; the poster
   960x960 at x 60, y 420; text "static-eg.com" and "Al Bustan Mall · 10th floor" white, centred, y 1430-1520
   (outside Instagram's top 250 px and bottom 340 px) -> `Upload Story Picture` (Drive folder "Stories" under AI Designs)
   -> store write `Story image`, `Story from`.
4. `Facebook story?` -> `Download Story Picture` -> `Upload Hidden Story Photo` (`/{page}/photos`, published=false,
   binary) -> `Post Facebook Story` (`/{page}/photo_stories`) -> store write `Story FB status` = Posted,
   `Story photo id`, `Story FB id`; on error `Story FB status` = "Facebook error: ...".
5. `Instagram story?` -> (no Story photo id yet: upload the hidden photo as in 4) -> `Story Photo Link` (GET photo
   `?fields=images`, largest) -> `Create Instagram Story` (`media_type=STORIES`, image_url) -> wait 15 s ->
   `Publish Instagram Story` -> store write `Story IG status` = Posted, `Story IG id`; on error the error text.
   Before creating, `GET /{ig}/content_publishing_limit`: 45 or more used today -> "Instagram daily limit reached,
   tried again tomorrow" (Waiting kept).

Every Meta call has no retry (a retry could post twice); a failure waits for "Try the story again" in the app.
Post now needs nothing extra: the scheduler's "Start Instagram now" runs the Instagram part, and Stories with it.

## Applying (ops.cjs)

`ops.cjs` prints the `update_workflow` operations, patched onto the live workflows (other threads edit the same
nodes): `node ops.cjs store store.json`, `node ops.cjs engine engine.json`, `node ops.cjs sched sched.json`, where
each `.json` is the live workflow from `get_workflow_details`. The store write / read and turn nodes are copied from
`Save Slot To Sheet`, `Read Posts Sheet (Instagram)` and `Take/Give back turn (Instagram)`; Meta auth from
`Schedule Facebook Post`.

As built in ops.cjs (differs a little from the plan above):
- Own turn `sched-stories` (600 s), taken after `Give back turn (Instagram)`, so a story never posts twice.
- Three straight branches from `Plan Stories`: make pictures, Facebook, Instagram. A picture made in a run posts in
  the next run (pictures are made as soon as the post is approved, so normally long before the story is due).
- Story picture (`fit-poster.js` + Edit Image): poster fitted into 960x1180, centred, on a blurred, darkened copy of
  itself, 1080x1920 JPEG, saved to AI Designs / Stories (folder made on first use), shared "anyone with the link".
- Instagram always gets its own hidden Facebook photo for the public link.
- Over 45 Instagram API posts today: Story IG status "Waiting - Instagram daily limit reached, trying again later".

## Story editor (step 2, phase A)

The app's story editor (`src/components/StoryEditor.tsx`, Konva, loaded only when opened) draws the 1080x1920 story:
the poster, a background (blurred poster, a colour or two colours) and text in five Instagram-like styles. The design
is kept on the post as `storyDesign` (JSON text, app only, needs `schedule`) so it can be opened again.

n8n workflow "Static OS - Story editor" (`Lid6aS3Y0ykvHqWy`, SDK code in `story-editor-workflow.js`), two webhooks
on the same address as the app nudge, both checking the member's Firebase token like the nudge does:
- `POST /webhook/static-os-story-asset` `{token, id}`: sends the poster's Drive file as a JPEG up to 1600 px, so the
  browser can draw it into a picture it may save (Drive pictures cannot be read back from a canvas).
- `POST /webhook/static-os-story` `{token, postId, image}`: saves the JPEG to AI Designs / Stories, shares it, and
  writes `storyImage`, `storyDesignedAt` and `ex.storyFrom = 'design'` on the post. `plan-stories.js` never remakes a
  picture whose Story from starts with `design`, so the poster maker cannot replace it.
