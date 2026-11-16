# Website (static-eg.com) link and sync

static-eg.com is WordPress + WooCommerce. n8n reads and writes it with the REST API key in the n8n credential
"Static website" (`wooCommerceApi`, Read/Write). The app never talks to the website itself.

## Link (n8n `zZJe1FsfFeVkWQy2` "Static OS - Website link", run by hand)
- `link.js` is the "Match website products" Code node; `node n8n/website/build.cjs` prints the workflow.
- Reads every website product (`/wp-json/wc/v3/products`, 100 a page) and the price list, suggests a website product for
  each app product by name (`prices/{cat}.items.<pid>.web`, `ok: false`), and saves the whole website list in
  `web/products` for the app's picker. Empty Online price / Online sale are filled from the website once.
  Confirmed links (`ok: true`) are never touched. `Settings.dryRun` = true only reports.
- Nothing is written to the website by this workflow.
- It also runs every 15 minutes on its own (schedule, light mode): `web/products` is rewritten from the website (new or
  removed pages and options, prices, stock) and confirmed links follow moved pages or removed options. No suggestions
  are made in that mode and `dryRun` does not apply. Manual runs work as before.

## Fields (app)
- `online` = website regular price, `onlineSale` = website sale price (empty = no sale), `out` = stock.
- `web = { id, name, ok, url, type, score, price, sale, stock, sentAt, error }`: price/sale/stock are what the
  website had when last read or sent. Only `ok` links are synced (see `webPending` in `src/data/prices.ts`).

## Sync (n8n `GLZ7NazaF82FZm9S` "Static OS - Website sync", every minute)
- `gate.js` "Anything new?": reads `prices/_meta` (1 read a minute) and stops unless the version moved or a retry is due.
- `plan.js` "What to send": confirmed links (`web.ok`) whose online price / sale / stock differ from `web.*`
  (same rule as `webPending`). At most 40 a run. Failed ones retry after 30 minutes.
- `reads.js` "Website reads": one request for all simple products (`products?include=`) and one per product with
  options (`variations`), instead of one per product (2026-11-16).
- "Read website product" → `prepare.js` picks the option
  whose words are all in the app product's name and builds the WooCommerce change (`regular_price`, `sale_price`,
  `stock_status`; a product whose stock the website counts gets `stock_quantity: 0` for out of stock).
- `batch.js` "Group into batches": all changes go in WooCommerce batch requests (POST `products/batch`, and
  `products/{id}/variations/batch` per product with options; up to 100 changes each) instead of one PUT per product.
- "Send it?" → "Send to website" (POST batch) → `results.js` (matches each change to the batch answer by id) writes what the website answered back into `web.*`
  (`sentAt`, or `error`), plus one line per real send in the app's activity log (`activity/{id}`, by `website`).
  `Settings.dryRun` = true works everything out and sends nothing; `testNames` treats
  those suggested links as confirmed in a dry run.
- `node n8n/website/build-sync.cjs` prints the workflow.

## Website to app (n8n `fHuULHd2qUV5IMAn` "Static OS - Website to app", every minute)
- The other direction: changes made on the website come back into the app, for confirmed links only, including the
  chosen option of a product with options (Box/Tray, colours).
- `pull-gate.js` / `pull-links.js`: the confirmed links and the app's values are kept in the workflow's static data and
  refreshed only when `prices/_meta` version moves (or every 30 minutes). Website: one `products?include=` request
  (up to 100 ids) plus one `variations` request per product with options.
- `pull-find.js`: a link goes on only when the website's price / sale / stock / name differs from the app and that
  website state was not already looked at. Then its category is read fresh (`pull-decide.js`):
  website = app → only `web.*` is brought up to date; app has an unsent change (app ≠ `web.*`) → the app wins and the
  sync sends it; otherwise the website changed → `online` / `onlineSale` / `out` and `web.*` take the website value
  (so nothing echoes back), a `priceLog` line by "Website" is written and `_meta.version` goes up. A name change on the
  website only updates `web.name`; the app then asks which name to keep.
- One Firestore commit per category with an `updateTime` precondition; if the app changed it meanwhile it is retried.
- `node n8n/website/build-pull.cjs` prints the workflow. Successful runs are not saved.
