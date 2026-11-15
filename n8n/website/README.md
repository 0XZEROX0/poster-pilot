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
