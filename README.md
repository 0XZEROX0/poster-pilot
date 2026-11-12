# PosterPilot

A phone-friendly web app for the Static poster pipeline: review finished posters, fix the ones
with problems, and schedule them for Facebook and Instagram. It replaces the Posts Google Sheet as
the control panel. The work itself (finding photos, building posters, posting on time) stays in
the n8n workflows, which read and write the same database.

It installs on Android from Chrome ("Add to Home screen") and runs in any browser.

## Screens

| Screen | What it is for |
| --- | --- |
| Home | Counts for review, fix, scheduled and posted today, plus what goes out next |
| Review | Finished posters: Approve, Redo or Skip |
| Fix | Every post with a problem, with the reason and the way to fix it |
| Calendar | A month of scheduled and posted posts |
| Posted | History, newest first |
| New post | Search the product list, pick 1 to 3 products, price, style, time |
| Settings | Language (English or Arabic), caption templates, account |

## Run it

```
npm install
npm run dev
```

With no Firebase values the app runs in **demo mode**: sample data kept in the browser and a
pretend engine, so every button can be tried. Nothing is posted.

To connect it to Firebase, copy `.env.example` to `.env.local` and fill in the values from the
Firebase console (Project settings, Your apps, Web app). Then:

1. Authentication: turn on Google sign-in, and add the site's domain under Authorized domains.
2. Firestore: create the database and publish `firestore.rules`.
3. In Firestore, create the document `config/access` with a list field `emails` holding the
   Google accounts that may open the app.

For the published site, put the same lines as `.env` into the repository secret `FIREBASE_ENV`.

## How the data is laid out

| Document | Holds |
| --- | --- |
| `posts/{id}` | One post, the fields of `Post` in `src/data/types.ts` |
| `catalog/products` | `{ items }`, the product list used by the search |
| `catalog/styles` | `{ names }`, the background styles |
| `catalog/templates` | `{ items }`, the caption templates |
| `status/engine` | `{ lastSync, note }`, written by n8n so the app can show it is alive |
| `config/access` | `{ emails }`, who may open the app |

A change made in the app is also listed in the post's `appEdits` map (a new post has
`appNew`, a deleted one `appDeleted`). n8n carries the change out and removes the entry.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Local development server |
| `npm test` | Tests for the post stages, captions and time slots |
| `npm run build` | Type-check and build into `dist` |
| `npm run lint` | Lint |
