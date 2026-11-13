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
3. In Firestore, create the document `config/access` with a list field `emails`. Its first email
   becomes the owner the first time that person opens the app; the others on it become members.

Everyone else joins with the system code: the owner copies it from Settings, the new person pastes
it after signing in, and an owner or admin accepts the request. The code alone opens nothing.
Roles are owner (everything, new code, roles), admin (sees the code, accepts and removes people)
and member (uses the app). `tests/rules/rules.test.mjs` checks the rules against the Firestore
emulator (`firebase emulators:exec --only firestore "node tests/rules/rules.test.mjs"`, with
`firebase-tools` and `@firebase/rules-unit-testing` installed).

The published site reads the same values from `.env.production`, which is committed: they are the
web app's public identifiers, not secrets. Access is protected by the rules and the access list.

## How the data is laid out

| Document | Holds |
| --- | --- |
| `posts/{id}` | One post, the fields of `Post` in `src/data/types.ts` |
| `catalog/products` | `{ items }`, the product list used by the search |
| `catalog/styles` | `{ names }`, the background styles |
| `catalog/templates` | `{ items }`, the caption templates |
| `status/engine` | `{ lastSync, note }`, written by n8n so the app can show it is alive |
| `config/access` | `{ emails }`, the first list: owner first, then the first members |
| `members/{uid}` | `{ email, name, role, joinedAt }`, the people inside |
| `requests/{uid}` | `{ email, name, code, createdAt }`, someone waiting to be accepted |
| `secret/code` | `{ code }`, the system code, readable by owner and admins |

A change made in the app is also listed in the post's `appEdits` map (a new post has
`appNew`, a deleted one `appDeleted`). n8n carries the change out and removes the entry.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Local development server |
| `npm test` | Tests for the post stages, captions and time slots |
| `npm run build` | Type-check and build into `dist` |
| `npm run lint` | Lint |
