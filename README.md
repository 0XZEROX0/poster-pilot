<p align="center">
  <img src="public/static-logo.png" alt="Static" width="200">
</p>

<h1 align="center">Static OS</h1>

<p align="center">
  <a href="https://github.com/0xzerox0/poster-pilot/actions/workflows/deploy.yml"><img src="https://github.com/0xzerox0/poster-pilot/actions/workflows/deploy.yml/badge.svg?branch=main" alt="Deploy to GitHub Pages"></a>
  <a href="https://0xzerox0.github.io/poster-pilot/"><img src="https://img.shields.io/badge/app-live-f05828?logo=githubpages&logoColor=white" alt="Live app"></a>
  <img src="https://img.shields.io/badge/React-19-283890?logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/Firebase-Firestore-283890?logo=firebase&logoColor=white" alt="Firebase Firestore">
  <img src="https://img.shields.io/badge/automation-n8n-283890?logo=n8n&logoColor=white" alt="n8n">
  <img src="https://img.shields.io/badge/PWA-installable-f05828" alt="Installable PWA">
</p>

The Static team's workspace: the shop price list, a PC build quotation tool, and the control
panel for the product poster pipeline (offers, review, fixes and the Facebook and Instagram
planner). The heavy work (finding photos, building posters, posting on time) runs in n8n
workflows, which read and write the same Firestore database as the app.

It installs on Android from Chrome ("Add to Home screen") and runs in any browser, in English or
Arabic, light or dark.

## Apps

| Group | App | What it is for |
| --- | --- | --- |
| | Dashboard | Counts for review, fix, scheduled and posted today, plus what goes out next |
| Shop | Prices | The price list by category, with in stock and out of stock, as a table or as cards |
| Shop | Builder | PC builds with fit checks, totals and discounts, saved quotes, live quotes and an A4 quotation print |
| Posters | Offers | New product offers (1 to 3 products, price, style, time), search and approval |
| Posters | Review | Finished posters: Approve, Redo or Skip |
| Posters | Fix | Every post with a problem, with the reason and the way to fix it |
| Posters | Planner | A month of scheduled and posted posts |
| Posters | Posted | History, newest first |
| Posters | Database | Every post in one table |
| | Settings | Language, people, roles and permissions, caption templates, account |

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
The owner can make custom roles, each with its own permissions and pages. `tests/rules/rules.test.mjs` checks the rules against the Firestore
emulator (`firebase emulators:exec --only firestore "node tests/rules/rules.test.mjs"`, with
`firebase-tools` and `@firebase/rules-unit-testing` installed).

The published site reads the same values from `.env.production`, which is committed: they are the
web app's public identifiers, not secrets. Access is protected by the rules and the access list.

## How the data is laid out

| Document | Holds |
| --- | --- |
| `prices/{category}` | The price list, one document per category (`prices/_meta` holds the version) |
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
| `npm test` | Unit tests |
| `npm run build` | Type-check and build into `dist` |
| `npm run lint` | Lint |

Every push to `main` is tested, built and published to GitHub Pages by
`.github/workflows/deploy.yml` (the badge at the top shows its last result).
