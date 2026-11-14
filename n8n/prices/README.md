# Price list import (one time)

n8n workflow `czPtRKPY4vPna1kB` "PosterPilot - Import price list (one time)". Manual trigger.

- `import.js` is the "Plan import" Code node: reads the 14 category tabs of the "Price List Hardware" sheet and
  builds `prices/{category}` documents plus `prices/_meta` (see `src/data/prices.ts`).
- `Settings.dryRun = true` (default) only returns a report. Set it to false for the real import.
- The real run refuses when `prices/_meta` already exists (so it can never overwrite prices edited in the app)
  or when fewer than 100 products were read.
- `node n8n/prices/build.cjs` prints the workflow as n8n Workflow SDK code.
