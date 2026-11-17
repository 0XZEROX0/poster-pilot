<p align="center">
  <img src="public/static-logo.png" alt="Static" width="200">
</p>

<h1 align="center">Static OS</h1>

<p align="center">
  <a href="https://github.com/0xzerox0/poster-pilot/releases/latest"><img src="https://img.shields.io/github/v/release/0xzerox0/poster-pilot?label=release&color=283890" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/status-stable-2ea043" alt="Stable">
  <a href="https://github.com/0xzerox0/poster-pilot/actions/workflows/deploy.yml"><img src="https://github.com/0xzerox0/poster-pilot/actions/workflows/deploy.yml/badge.svg?branch=main" alt="Deploy to GitHub Pages"></a>
  <a href="https://0xzerox0.github.io/poster-pilot/"><img src="https://img.shields.io/badge/app-live-f05828?logo=githubpages&logoColor=white" alt="Live app"></a>
  <br>
  <img src="https://img.shields.io/badge/React-19-283890?logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/Firebase-Firestore-283890?logo=firebase&logoColor=white" alt="Firebase Firestore">
  <img src="https://img.shields.io/badge/automation-n8n-283890?logo=n8n&logoColor=white" alt="n8n">
  <img src="https://img.shields.io/badge/PWA-installable-f05828" alt="Installable PWA">
  <img src="https://img.shields.io/badge/English%20%7C%20%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9-283890" alt="English and Arabic">
</p>

<p align="center">
  <a href="https://0xzerox0.github.io/poster-pilot/"><b>Open the app</b></a> ·
  <a href="https://github.com/0xzerox0/poster-pilot/releases/latest">Latest release</a> ·
  <a href="#screenshots">Screenshots</a>
</p>

The Static team's workspace, in one place: the shop price list, a PC build quotation tool, the
maintenance and warranty desk, and the control panel for the product poster pipeline (offers,
review, fixes, the week plan and the Facebook and Instagram planner). The heavy work (finding
photos, building posters, checking competitor prices, syncing the website, posting on time) runs
in n8n workflows, which read and write the same Firestore database as the app.

It installs on Android from Chrome ("Add to Home screen") and runs in any browser, in English or
Arabic, light or dark.

<p align="center">
  <img src="docs/screenshots/home-light.png" alt="Static OS home screen" width="49%">
  <img src="docs/screenshots/home-dark.png" alt="Static OS home screen, dark" width="49%">
</p>

## Apps

The home screen is a grid of apps, each opening on its own screen with its own top bar. Anyone who
prefers the old sidebar can switch back in Settings.

| Group | App | What it is for |
| --- | --- | --- |
| Shop | Prices | The price list by category: stock, cost and profit (for those allowed), website prices and links, as a table or as cards |
| Shop | Builder | PC builds with fit checks, totals and discounts, saved and live quotes, and a printed quotation (A4 or A5, with or without prices) |
| Shop | Maintenance | Repair and warranty tickets: steps, deadlines, WhatsApp updates and an A5 receipt |
| | Dashboard | Counts for review, fix, scheduled and posted today, plus what goes out next |
| Posters | Offers | New product offers (1 to 3 products, or up to 4 versions of one product), photo picker from the website, search and approval |
| Posters | Review | Finished posters: Approve, Redo, Skip, or Post now on Facebook and Instagram |
| Posters | Fix | Every post with a problem, with the reason and the way to fix it |
| Posters | Planner | Month and day views of scheduled and posted posts, drag to plan |
| Posters | Brainstorm | The week plan, before anything gets a date |
| Posters | Posted | History, newest first |
| Posters | Database | Every post in one table |
| Team | Activity | Who did what, across the whole app |
| | Settings | Language, layout, profile photo and name, people, roles and permissions, caption templates |

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/prices.png" alt="Prices"><br><b>Prices</b>: the whole price list, with stock and website prices</td>
    <td width="50%"><img src="docs/screenshots/review.png" alt="Review"><br><b>Review</b>: approve finished posters</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/maintenance.png" alt="Maintenance"><br><b>Maintenance</b>: a new ticket, product picked from the price list</td>
    <td><img src="docs/screenshots/planner.png" alt="Planner"><br><b>Planner</b>: the day view, drag approved posts onto a time</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/brainstorm.png" alt="Brainstorm"><br><b>Brainstorm</b>: plan the week first</td>
    <td><img src="docs/screenshots/settings-people.png" alt="Settings, people"><br><b>Settings</b>: system code, join requests, members and roles</td>
  </tr>
</table>

On a phone:

<p align="center">
  <img src="docs/screenshots/phone-home.png" alt="Home on a phone" width="16%">
  <img src="docs/screenshots/phone-home-arabic.png" alt="Home in Arabic" width="16%">
  <img src="docs/screenshots/phone-builder.png" alt="Builder on a phone" width="16%">
  <img src="docs/screenshots/phone-ticket.png" alt="A maintenance ticket" width="16%">
  <img src="docs/screenshots/phone-review.png" alt="Review on a phone" width="16%">
  <img src="docs/screenshots/phone-post-now.png" alt="Post now" width="16%">
</p>

All screenshots are from demo mode, with sample data.

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
emulator (`npm run test:rules`, with Java, `firebase-tools` and `@firebase/rules-unit-testing` installed).

The published site reads the same values from `.env.production`, which is committed: they are the
web app's public identifiers, not secrets. Access is protected by the rules and the access list.

## How the data is laid out

| Document | Holds |
| --- | --- |
| `prices/{category}` | The price list, one document per category (`prices/_meta` holds the version) |
| `costs/{category}` | Cost prices, readable only by roles allowed to see cost |
| `posts/{id}` | One post, the fields of `Post` in `src/data/types.ts` |
| `log/{id}` | The history of one post, from the app and from n8n |
| `plans/{week}` | The Brainstorm week plan |
| `tickets/{id}` | One maintenance ticket and its steps |
| `quotes/{id}`, `drafts/{uid}`, `edits/{uid}` | Saved quotes, live quotes and edits to someone else's live quote |
| `activity/{id}` | The app-wide activity list |
| `catalog/products` | `{ items }`, the product list used by the search |
| `catalog/styles` | `{ names }`, the background styles |
| `catalog/templates` | `{ items }`, the caption templates |
| `status/engine` | `{ lastSync, note }`, written by n8n so the app can show it is alive |
| `config/access` | `{ emails }`, the first list: owner first, then the first members |
| `members/{uid}` | `{ email, name, role, joinedAt }`, the people inside |
| `profiles/{uid}` | The name and photo shown next to each person |
| `roles/{id}` | Custom roles and their permissions |
| `requests/{uid}` | `{ email, name, code, createdAt }`, someone waiting to be accepted |
| `secret/code` | `{ code }`, the system code, readable by owner and admins |

A change made in the app is also listed in the post's `appEdits` map (a new post has
`appNew`, a deleted one `appDeleted`). n8n carries the change out and removes the entry.
The n8n workflows themselves are kept as code in `n8n/`.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Local development server |
| `npm test` | Unit tests |
| `npm run build` | Type-check and build into `dist` |
| `npm run lint` | Lint |
| `npm run check:n8n` | Check that every n8n code file in `n8n/` can be read by JavaScript |
| `npm run test:rules` | Database rules checks against the Firestore emulator |

Every pull request runs `.github/workflows/checks.yml`: lint, unit tests, type-check and build,
the n8n code check, and the database rules checks. A pull request is merged only when these
are green and it has no conflicts.

Every push to `main` is tested, built and published to GitHub Pages by
`.github/workflows/deploy.yml` (the badge at the top shows its last result).

## Releases

The version is the one in `package.json`. On every push to `main`,
`.github/workflows/release.yml` checks whether that version has a release yet. If not, it tags it
and publishes a normal, stable GitHub release (never a pre-release) with the changes since the
last one. To make a new release, raise the version in the pull request, for example with
`npm version minor --no-git-tag-version`.
