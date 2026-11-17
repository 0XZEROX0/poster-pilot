# Website orders (static-eg.com) <-> Static OS Orders app

n8n `QP4OrcmkFHHZ8ulM` "Static OS - Website orders" (folder Static OS / Website sync). Sources here; `node build.cjs`
prints the whole workflow, `node ops.cjs ["Node name,..."]` prints the update operations that put the Code node
sources into the live workflow.

## Data
`orders/W<website order id>`: see `src/data/orders.ts`. The engine makes each document and keeps the website part
(customer, phone, email, address, delivery, items, totals, pay method, website status) up to date. The app changes only
`status`, `want`, `closed`, `agreed`, `date`, `time`, `steps` (firestore.rules enforces it).

## Status mapping
| Website (WooCommerce) | App |
|---|---|
| pending, on-hold | New |
| processing | Confirmed |
| completed | Completed |
| cancelled | Cancelled |
| refunded, failed | Refunded, Failed (only from the website) |

App -> website: Confirm order / Open again = processing, Delivered = completed, Cancel order = cancelled.

## Runs
- Website -> app: WooCommerce webhooks `order.created` + `order.updated` call `/webhook/static-website-order-<secret>`;
  each call waits 30 s and only the newest of a burst goes on (data table `qRho6PXhcLVZDIrj`, key `orders`). Then one
  request: orders changed since the last read (10 min overlap). The first run reads the last `sinceDays` (30) days and
  every open order. App documents are read with one `batchGet`, written with one non-atomic `batchWrite`, each write with
  an `updateTime` precondition (a write refused because the app changed the order meanwhile is redone next run).
- App -> website: the app asks the engine for job `orders` after Confirm / Delivered / Cancel / Open again; the engine
  starts this workflow (`When app asks`). "Find orders to send" queries `want IN [...]` (1 read when none), sends one
  WooCommerce `orders/batch`, and writes the answer back (`webStatus`, `want` = '', or `webError`) plus a line in the
  activity log by Website.
- Every hour at :40 the same run as a safety net; every hour at :25 the webhooks are checked/re-enabled
  (`Hook settings.hooks` must be true).
- Website requests stay >= 1.5 s apart and a burst of webhook calls starts one read (Hostinger firewall, see
  `n8n/website/README.md`).

## Switches
- `Settings.dryRun` (true = read and report only, write nothing anywhere).
- `Hook settings.hooks` (true = create/keep the two WooCommerce order webhooks on static-eg.com).

WooCommerce emails the customer when an order moves to Processing or Completed, as when it is changed on the site.

## Live (2026-11-17)
- Published with `dryRun` false and `hooks` true. First import: 57 orders (execution 56330). WooCommerce webhooks
  id 2 (order.created) and id 3 (order.updated) point at this workflow.
- The App engine (qRX3fplFZLoSmgir) starts this workflow for `run=orders` (output 10 of "Run which",
  node "Start website orders"); operations in `engine-ops.cjs` (Run which rules are set as a whole array).
