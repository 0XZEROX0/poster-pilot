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

## Fields (app)
- `online` = website regular price, `onlineSale` = website sale price (empty = no sale), `out` = stock.
- `web = { id, name, ok, url, type, score, price, sale, stock, sentAt, error }`: price/sale/stock are what the
  website had when last read or sent. Only `ok` links are synced (see `webPending` in `src/data/prices.ts`).

## Sync (n8n `GLZ7NazaF82FZm9S` "Static OS - Website sync", every minute)
- `gate.js` "Anything new?": reads `prices/_meta` (1 read a minute) and stops unless the version moved or a retry is due.
- `plan.js` "What to send": confirmed links (`web.ok`) whose online price / sale / stock differ from `web.*`
  (same rule as `webPending`). At most 40 a run. Failed ones retry after 30 minutes.
- "Read website product" (the product, or its options for a product with options) → `prepare.js` picks the option
  whose words are all in the app product's name and builds the WooCommerce change (`regular_price`, `sale_price`,
  `stock_status`; a product whose stock the website counts gets `stock_quantity: 0` for out of stock).
- "Send it?" → "Send to website" (PUT) → `results.js` writes what the website answered back into `web.*`
  (`sentAt`, or `error`). `Settings.dryRun` = true works everything out and sends nothing; `testNames` treats
  those suggested links as confirmed in a dry run.
- `node n8n/website/build-sync.cjs` prints the workflow.
