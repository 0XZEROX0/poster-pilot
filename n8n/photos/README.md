# Website photos for the photo picker

n8n workflow `7WRJVybLkYgJh0Nh` "PosterPilot - Website photos". Every 30 seconds.

- The app sets `photoAsk` (a time) on a post when someone opens "Choose a photo from the website".
- `choices.js` is the "Find website photos" Code node. For each item it searches static-eg.com's public
  product search the same way the poster maker does ("Match Items Folder Photo" + "Pick Static Store Photo"),
  and saves every photo of the matched product in the post's `photoChoices` (see `PhotoChoices` in
  `src/data/types.ts`), then removes `photoAsk`. With no exact product, up to 3 closest products are listed in `near`.
- The person taps a photo; the app writes it to that item's `manualPhoto` and sets Feedback = Redo, so the poster
  maker rebuilds with it. The poster workflow itself is not changed.
- Firestore cost: one query read per run when nobody asked (about 2,900 reads a day), plus one write per answer.
- `node n8n/photos/build.cjs` prints the workflow as n8n Workflow SDK code.

## Versions picker (New offer)

- With "Versions of one product" ticked and one product picked, New offer's `VersionPicker` writes
  `photoAsks/{uid}` `{ name, ask, by }` (rules: own document, `offers.create`) and starts the `photos` job.
- "Find version requests" reads `photoAsks` where `ask > 0`. `choices.js` answers with `choice` (one
  `PhotoChoiceItem`: every photo of the product, each option's own photo first with `label` = the option, e.g.
  "Jungle Panda"; option kinds that are the same for every option are left out; plus `near` = other website products
  of the same family, labelled with the words their name adds, e.g. "White Blue") and `answered` = ask, and removes `ask`.
- Each tapped photo becomes an item: `name` = the price list product (so the price check works), `label` = the
  version name, `manualPhoto` = the photo. The Posts store shows `name + label` in the Item N columns.
- One more Firestore read per run (about 2,900 a day).
