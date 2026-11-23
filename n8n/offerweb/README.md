# Also add to the website (offers on static-eg.com)

Asked on 2026-11-23: when posting a design, an optional switch that also puts the offer on static-eg.com, the same way
the Static Friday bundle offers were added by hand (product 13040, Ultra 5 225F + Prime H810M-A).

## App

- Post editor, any offer past the offer stage (not text/photo/video posts): box **Website** with the checkbox
  **Also add to the website** (permission `schedule`). It is part of the editor's changes and goes out with Save or
  Approve. Off again = the website product is set back to draft (hidden), never deleted.
- `posts.webAdd`: the app writes `asked` (on, try again, or a change the product follows) or `remove` / `''` (off).
  The engine writes `working`, `waiting` (no approved poster or no date and time yet), `scheduled`, `live`, `failed`,
  `removed`, plus `webNote` (what happened, Cairo time), `webProductId`, `webLink`, `webAt` (Cairo go-live time) and
  its own `webLive`, `webPoster`, `webTry`, `webJob`.
- With it on, a change to Post date/time, Post now, prices, products, name or Feedback asks again (`webAskFor` in
  logic.ts, used by both backends), so the website product follows the post. This ask is allowed to anyone who may
  make that change (rules), the on/off switch only with `schedule`.
- The app knocks with `run=offerweb`. History lines: `website.add`, `website.remove` (app), `website.scheduled`,
  `website.live`, `website.hidden`, `website.error` (engine).
- RULES CHANGE: `webAdd` (publish firestore.rules).

## n8n: "Static OS - Offer to website" `VxHTLa1Rv6xqbgH8` (folder Posters & Facebook)

`When app asks` / hourly safety run (minute 7) / manual -> runQuery posts where webAdd in (asked, working, remove,
scheduled) -> `Plan` -> `Claim posts` (webAdd working, updateTime precondition) -> `Read brands` -> `Build` ->
`Website call?` -> `Send to website` (POST /wc/v3/products or /products/{id}) -> `Keep answer` -> `Result` -> `Save result`.

- Product: simple, name = items joined " + " (versions-of-one posts: their title), regular price = Price before,
  sale price = Price after (no sale when Price before is not higher), in stock, reviews off, category STATIC FRIDAY
  797 only, brands from the post's companies and brand names found in the name, description = the name as a centred
  `<h4>`, Rank Math focus keyword = name, primary category 797, the poster as the only photo.
- When: a post already published goes live at once. Otherwise the product is sent with `date_created_gmt` = the
  post's date and time; WordPress keeps it as status `future` (tested 2026-11-23, product 13042, trashed) and
  publishes it by itself at that minute. The hourly run re-publishes a `scheduled` one 5 minutes after its time as a
  safety net and marks it `live`. Approved without date/time, or not approved yet: `waiting` (a product that is not
  live yet is put back to draft meanwhile).
- Photo: WooCommerce only takes a photo link ending in .jpg, so the same workflow serves the poster at
  `/webhook/d4c1dd09-58b2-4dce-8b84-26010d881e3b/offer-poster/<post id>-<last 8 of Drive id>-<name>.jpg`
  (`Poster link` -> `Read the post` -> `Is it that poster?` -> Drive download -> respond). It answers only while that
  post is `working` and only with that post's own poster; otherwise 404. A new photo is sent only for a new product or
  a new poster.
- Firestore reads: one query per hour when nothing is waiting, plus one read per poster fetch.
- App engine `qRX3fplFZLoSmgir`: `What to run` accepts `offerweb`; `Run which` output 11 "Offers to website" ->
  `Start offers to website` (engine-ops.cjs prints the operations).

Tested 2026-11-23 on the real post v97VP7G8QafS8InDYvQZ (225F + H810M-A, already on the website by hand as 13040):
linked it (webProductId 13040) and ran the workflow; it updated 13040 with the same name, prices, category, brands and
a fresh copy of the poster fetched through the webhook, and the post now shows "On the website".
