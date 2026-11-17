# Post results (reach and likes)

n8n workflow **Static OS - Post results (reach and likes)**, id `5hfzggjTjfR8xicd`, published 2026-11-17.

- Runs at 10:00 and 22:00 Cairo. Reads the published posts (Firestore query `fbPostId != ""`, 4 fields only) and the last
  `status/results` document: about 22 reads and 1 write per run.
- Posts published in the last 60 days are asked again; older ones keep their last numbers.
- Asks Meta (credential "Meta Page Token") per post:
  - Facebook `/{post}/insights?metric=post_total_media_view_unique,post_media_view,post_reactions_by_type_total,post_clicks&period=lifetime`
    (`post_impressions*` metrics are gone from the Graph API) and `/{post}?fields=shares,reactions.summary(...),comments.summary(...)`.
  - Instagram `/{media}?fields=like_count,comments_count,permalink` and `/{media}/insights?metric=reach,saved,shares,views,total_interactions`.
    The media id comes from the post's IG status, "Published ... (id)".
- Saves one document, `status/results`: `{ at, need: [...], posts: { [postId]: { fb, ig, igLink, at } } }`. The app listens to it
  (members can already read `status/*`, so no rules change). `need` lists what the token may not read:
  `fbIns` (needs `read_insights`), `fbEng` (needs `pages_read_engagement` / `pages_read_user_content`), `igIns` (needs `instagram_manage_insights`).

Code nodes: `plan-asks.js`, `sum-up.js`. `node build.cjs` prints the Workflow SDK code.
