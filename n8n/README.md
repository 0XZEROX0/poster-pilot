# n8n: sheet and app sync

The workflow "PosterPilot - Sheet and App Sync" keeps the Posts sheet and the app's database
(Firestore) the same, both ways, once a minute. It is separate from the poster and scheduling
workflows and does not change them.

- `check-memory.js`, `plan-sync.js`, `split-writes.js`, `remember.js` are the code of its four Code nodes.
- `build.cjs <spreadsheetId> [dry]` prints the whole workflow as n8n Workflow SDK code (`workflow.sdk.js`).
- `test-plan.cjs` runs `plan-sync.js` against made-up data: `node n8n/test-plan.cjs`.

How it works

- Sheet to app: every row that has an item or a poster is copied to `posts/{id}`. Only rows that changed are sent.
- A row is recognised by a hidden tag on the row itself (Sheets developer metadata, key `p`). The tag
  moves with the row, so sorting and "Clear published" keep working. No column is added.
- App to sheet: a change made in the app sets `appDirty` and lists the fields under `appEdits`. The sync
  writes those into the row: Feedback, Caption, Caption style, Post date, Post time, Price after, Style,
  Details, Manual photo and Next photo. A post created in the app goes into the first blank row.
- Never written: Company, Price before and Preview (formulas), and everything the other workflows fill in.
- Deleting a post from the app is not carried over to the sheet yet.
- The `Settings` node has `dryRun`. When it is on, the run only reports what it would do.

## Removing deleted posters from Drive

After "Remember what was synced", six small nodes ("Remove deleted posters") move the poster of a post
deleted in the app to the Google Drive bin: only a file inside the AI Designs folder or one of its
style folders, and only when no other row still uses it. Facebook and Instagram are not touched.
