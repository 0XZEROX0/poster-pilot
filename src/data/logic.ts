import type { CaptionTemplate, PhotoChoiceItem, Post, PostItem, PostKind, Product } from './types'

// ---------- text, photo and video posts (post.kind) ----------
/** Where a text, photo or video post goes: a text post goes to Facebook only (Instagram needs a picture). */
export function placesOf(p: Pick<Post, 'kind' | 'places'>): ('fb' | 'ig')[] {
  if (p.kind === 'text') return ['fb']
  const list = (p.places ?? '').split('+').filter((w): w is 'fb' | 'ig' => w === 'fb' || w === 'ig')
  return list.length ? [...new Set(list)] : ['fb', 'ig']
}
const outText = (s: string | undefined) => /^(published|posted)/i.test((s ?? '').trim())
/** A text, photo or video post that is out on every place it goes to. */
const customPosted = (p: Post) => placesOf(p).every((w) => outText(w === 'fb' ? p.fbStatus : p.igStatus))
/** The words for a kind of post. */
export const KIND_LABEL: Record<PostKind, string> = { text: 'Text post', image: 'Photo post', video: 'Video post' }
/** The first line of the caption, for lists. */
const firstLine = (s: string | undefined) => (s ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? ''
/** A Drive file id as a picture the browser can show (Drive makes one for videos too). */
export const driveThumb = (id: string, width = 900) => `https://lh3.googleusercontent.com/d/${id}=w${width}`

/** Where a post is in its life. Each post is in exactly one stage. */
export type Stage = 'offer' | 'building' | 'fix' | 'review' | 'scheduled' | 'posted' | 'skipped'

/** Facebook states that are not problems. A post waiting for its time, or taken off the schedule, is fine. */
const fbFine = (s: string) => s === '' || /^(scheduled|published|cancelled|waiting)\b/i.test(s)

export type Problem = { kind: 'photo' | 'background' | 'ai' | 'facebook' | 'instagram'; text: string }

/** A problem the person has to act on, or null. A problem the person ignored stays hidden until its text changes. */
export function problemOf(p: Post): Problem | null {
  const problem = anyProblemOf(p)
  return problem && p.ignoredProblem === problem.text ? null : problem
}

/** The problem the engine reported, whether or not the person ignored it. */
export function anyProblemOf(p: Post): Problem | null {
  const s = p.photoStatus.trim()
  if (s && s !== 'OK' && !isBusy(p)) {
    const up = s.toUpperCase()
    if (up.startsWith('MISSING')) return { kind: 'photo', text: s }
    if (up.startsWith('BACKGROUND')) return { kind: 'background', text: s }
    return { kind: 'ai', text: s }
  }
  if (!fbFine(p.fbStatus.trim())) return { kind: 'facebook', text: p.fbStatus }
  const ig = p.igStatus.trim()
  if (ig && /error|fail/i.test(ig)) return { kind: 'instagram', text: ig }
  return null
}

/** The engine marks a row 'WORKING <time>' or 'PHOTO FOUND' while it is building the poster. */
export const isBusy = (p: Pick<Post, 'photoStatus'>) => /^(WORKING|PHOTO FOUND)/i.test(p.photoStatus.trim())

/** A redo was asked for and the engine has not picked it up yet ('Redo' or the sheet's 'Redo next image'). */
export const isRedo = (p: Pick<Post, 'feedback'>) => /^redo/i.test(p.feedback)

/** The person ignored an error that left the post without a poster: nothing more will happen to it. */
const isDeadEnd = (p: Post) => !p.posterUrl && Boolean(anyProblemOf(p)) && !problemOf(p)

/** How long a retry is given before the same poster error counts as "failed again". */
export const RETRY_MS = 4 * 60 * 1000

/**
 * A redo the engine already answered with the same poster error (no photo, no background, build
 * failed). The post still says Redo in the sheet, but waiting longer will not help: it needs a fix.
 */
export function redoFailed(p: Post, now = Date.now()): boolean {
  const kind = anyProblemOf(p)?.kind
  return isRedo(p) && !isBusy(p) && (kind === 'photo' || kind === 'background' || kind === 'ai') && now - (p.retriedAt ?? 0) > RETRY_MS
}
const isRedoing = (p: Post) => isRedo(p) && !redoFailed(p)

export const isBuilding = (p: Post) => !p.kind && (isRedoing(p) || isBusy(p) || (!anyProblemOf(p) && (!p.posterUrl || !p.photoStatus)))

/**
 * Where the offer stands before a poster is made: waiting for someone to approve it, sent back to
 * its maker, or null once approved. A post from before offers existed has no `offer` and counts as approved.
 */
export function offerOf(p: Pick<Post, 'offer' | 'appNew'> & Partial<Pick<Post, 'kind'>>): 'waiting' | 'rejected' | null {
  if (p.kind) return null
  if (p.offer === 'Rejected') return 'rejected'
  return p.offer === '' || (p.offer === undefined && p.appNew === true) ? 'waiting' : null
}

/** A post Facebook already holds cannot be deleted from the app. */
export const onFacebook = (p: Pick<Post, 'fbStatus' | 'fbPostId'>) => /^(scheduled|published)/i.test(p.fbStatus.trim()) || p.fbPostId !== ''

export function stageOf(p: Post): Stage {
  if (p.kind) {
    // No offer and no poster: it is written and uploaded in the app, then reviewed and given a time.
    if (customPosted(p) || p.takeDown === 'done') return 'posted'
    if (problemOf(p)) return 'fix'
    if (p.feedback === 'ignore') return 'skipped'
    if (p.feedback === 'Done' || p.feedback === 'Cancel') return 'scheduled'
    return 'review'
  }
  if (p.fbStatus.trim() === 'Published') return 'posted'
  if (offerOf(p)) return 'offer'
  if (isRedoing(p) || isBusy(p)) return 'building'
  if (problemOf(p)) return 'fix'
  if (isDeadEnd(p)) return 'skipped'
  if (!p.posterUrl || !p.photoStatus) return 'building'
  if (p.feedback === 'ignore') return 'skipped'
  // 'Cancel' asks the engine to take the post off Facebook's schedule. It stays approved, without a time.
  if (p.feedback === 'Done' || p.feedback === 'Cancel') return 'scheduled'
  return 'review'
}

/** An item's name as the poster and caption show it: the price list name plus the version, when it has one. */
export const itemName = (i: Pick<PostItem, 'name' | 'label'>) => [i.name.trim(), (i.label ?? '').trim()].filter(Boolean).join(' ')

export const titleOf = (p: Pick<Post, 'items' | 'variants' | 'title'> & Partial<Pick<Post, 'kind' | 'caption'>>) =>
  p.kind ? (firstLine(p.caption).slice(0, 120) || KIND_LABEL[p.kind]) : p.variants ? variantsName(p) : p.items.map((i) => i.name.trim()).filter(Boolean).join(' + ')

/** Most items a post can hold: 3 products, or 4 versions of one product. */
export const maxItems = (variants?: boolean) => (variants ? 4 : 3)

/** The words all the names start with, e.g. "Metapanda PD98" for "Metapanda PD98 Jungle Panda" and "Metapanda PD98 Hurricane Panda". */
export function commonTitle(names: string[]): string {
  const lists = names.map((n) => n.trim().split(/\s+/).filter(Boolean)).filter((w) => w.length)
  if (!lists.length) return ''
  const out: string[] = []
  for (let i = 0; i < lists[0].length; i++) {
    const w = lists[0][i]
    if (lists.every((l) => (l[i] ?? '').toLowerCase() === w.toLowerCase())) out.push(w)
    else break
  }
  return (out.length ? out : lists[0]).join(' ')
}

/** What tells a version apart: its name without the words of the shared title ("Jungle Panda"). Same rule as the engine. */
export function optionOf(title: string, name: string): string {
  const drop = new Set(title.toLowerCase().split(/\s+/).filter(Boolean))
  const rest = name.trim().split(/\s+/).filter((w) => w && !drop.has(w.toLowerCase())).join(' ')
  return rest || name.trim()
}

/** A versions post's name for captions and lists: "Metapanda PD98 (Jungle Panda / Hurricane Panda)". */
export function variantsName(p: Pick<Post, 'items' | 'title'>): string {
  const names = p.items.map(itemName).filter(Boolean)
  const title = (p.title ?? '').trim() || commonTitle(names)
  const opts = names.map((n) => optionOf(title, n)).filter((o) => o.toLowerCase() !== title.toLowerCase())
  return opts.length ? `${title} (${opts.join(' / ')})` : title
}

/** The price shown on the poster: the offer price when there is one. */
export const priceOf = (p: Pick<Post, 'priceBefore' | 'priceAfter'>) => p.priceAfter.trim() || p.priceBefore.trim()

export const hasOffer = (p: Pick<Post, 'priceBefore' | 'priceAfter'>) =>
  Boolean(p.priceAfter.trim()) && toNumber(p.priceAfter) < toNumber(p.priceBefore)

export const toNumber = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0

/** The items and price a competitor check is for. The engine writes the same key, so a changed offer shows as checking again. */
export const marketKey = (p: Pick<Post, 'items' | 'priceBefore' | 'priceAfter'>) =>
  p.items.map((it) => it.name.trim().toLowerCase()).filter(Boolean).join('|') + '#' + toNumber(priceOf(p))

/** Above the cheapest competitors by more than this share, an offer is marked red. */
export const MARKET_CLOSE = 0.03

export type MarketView =
  | { state: 'checking' }
  | { state: 'error'; error: string; checkedAt: number }
  | { state: 'done'; checkedAt: number; ours: number; total: number; found: number; count: number; tone: 'good' | 'close' | 'high' | 'partial' }

/** How an offer's price compares with the cheapest in-stock price for each item at the competitors. */
export function marketOf(p: Post): MarketView {
  const m = p.market
  if (!m || m.key !== marketKey(p) || (p.marketAsk ?? 0) > m.checkedAt) return { state: 'checking' }
  if (m.error) return { state: 'error', error: m.error, checkedAt: m.checkedAt }
  const ours = toNumber(priceOf(p))
  // Only prices you can buy count: an out-of-stock price may be old, so it never makes the total (or the warning).
  const priced = m.items.map((it) => (it.best && it.best.inStock !== false ? it.best : null))
  const found = priced.filter(Boolean).length
  const total = priced.reduce((sum, h) => sum + (h?.price ?? 0), 0)
  const count = m.items.length
  const tone = found < count || !total ? 'partial' : ours <= total ? 'good' : (ours - total) / total <= MARKET_CLOSE ? 'close' : 'high'
  return { state: 'done', checkedAt: m.checkedAt, ours, total, found, count, tone }
}

export const formatPrice = (s: string) => {
  const n = toNumber(s)
  return n ? n.toLocaleString('en-US') : s.trim()
}

/**
 * Fills a caption template the way the engine does: {name} {price} {before} {category} {company}
 * {details}. A line whose placeholder has no value is dropped.
 */
export function buildCaption(p: Pick<Post, 'items' | 'variants' | 'title' | 'company' | 'priceBefore' | 'priceAfter' | 'details' | 'captionStyle'>, templates: CaptionTemplate[]): string {
  const wanted = p.captionStyle.trim().toLowerCase()
  const tpl = templates.find((t) => t.name.trim().toLowerCase() === wanted) ?? templates.find((t) => t.name.trim().toLowerCase() === 'default') ?? templates[0]
  if (!tpl) return ''
  const values: Record<string, string> = {
    name: titleOf(p),
    price: formatPrice(priceOf(p)),
    before: hasOffer(p) ? formatPrice(p.priceBefore) : '',
    category: [...new Set(p.items.map((i) => i.category.trim()).filter(Boolean))].join(' + '),
    company: p.company.trim(),
    details: p.details.trim(),
  }
  return tpl.text
    .split('\n')
    .filter((line) => {
      const used = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
      return used.every((k) => !(k in values) || values[k])
    })
    .map((line) => line.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m)))
    .join('\n')
    .trim()
}

/** Today's date in Cairo, where the store and its posting schedule live. */
export function cairoNow(now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * When a post goes out. A published post keeps the time it went out. Otherwise the date and time the
 * person asked for win, because the engine follows them within a few minutes; else the engine's slot.
 */
export function whenOf(p: Post): { date: string; time: string } | null {
  const m = p.scheduledFor.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/)
  const engine = m ? { date: m[1], time: m[2] } : null
  if (engine && p.fbStatus.trim() === 'Published') return engine
  if (p.feedback === 'Cancel') return null
  if (p.postDate && p.postTime) return { date: p.postDate, time: p.postTime.padStart(5, '0') }
  return engine
}

/**
 * Facebook only takes a scheduled post when its time is far enough ahead. A time less than LOCAL_POST_MIN minutes away
 * is not put on Facebook's schedule: the post waits in the app and the server publishes it at that minute (like Post now).
 * The engine marks such a post "Waiting to post at 17:00 from the app".
 */
export const LOCAL_POST_MIN = 30
export const waitsInApp = (p: Pick<Post, 'fbStatus' | 'igStatus'>) => /^waiting to post at/i.test((p.fbStatus ?? '').trim()) || /^waiting to post at/i.test((p.igStatus ?? '').trim())

/** Minutes from now (Cairo time) until a date and time; negative when it has passed. Null when either is missing. */
export function minutesUntil(date: string, time: string, now = cairoNow()): number | null {
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/), t = time.match(/^(\d{1,2}):(\d{2})/), n = now.time.match(/^(\d{1,2}):(\d{2})/)
  if (!d || !t || !n) return null
  const at = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2])
  const [y, m, day] = now.date.split('-').map(Number)
  return Math.round((at - Date.UTC(y, m - 1, day, +n[1], +n[2])) / 60000)
}

/** True when a post's chosen time is too close for Facebook's schedule but still ahead: the app will post it at that minute. */
export const postsFromApp = (date: string, time: string, now = cairoNow()) => {
  const left = minutesUntil(date, time, now)
  return left !== null && left >= 0 && left < LOCAL_POST_MIN
}

/** The minutes a story may wait after its post, offered in the post editor. */
export const STORY_DELAYS = [0, 15, 30, 60, 120, 180] as const

/** True when the post's story goes to this place ('fb' or 'ig'). */
export const storyTo = (p: Pick<Post, 'story'>, where: 'fb' | 'ig'): boolean => (p.story ?? '').split('+').includes(where)

/** The story's minutes after the post (0 for none or anything that is not a whole number). */
export function storyDelayOf(p: Pick<Post, 'storyDelay'>): number {
  const n = Number(String(p.storyDelay ?? '').trim() || 0)
  return Number.isInteger(n) && n > 0 && n <= 24 * 60 ? n : 0
}

/** When the post's story goes out: the post's own time plus its delay, in Cairo time. Null without a story or a time. */
export function storyWhenOf(p: Post): { date: string; time: string } | null {
  if (!p.story) return null
  const when = whenOf(p)
  if (!when) return null
  const [h, m] = when.time.split(':').map(Number)
  const total = h * 60 + m + storyDelayOf(p)
  return { date: addDays(when.date, Math.floor(total / 1440)), time: `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` }
}

/**
 * Where a post's story stands, for one place: 'off' (not asked for), 'posted', 'failed' (with the engine's text),
 * or 'waiting' (asked for, not out yet).
 */
export function storyStateOf(p: Post, where: 'fb' | 'ig'): { state: 'off' | 'waiting' | 'posted' | 'failed'; text: string } {
  if (!storyTo(p, where)) return { state: 'off', text: '' }
  const text = String((where === 'fb' ? p.storyFbStatus : p.storyIgStatus) ?? '').trim()
  if (/^(posted|published)/i.test(text)) return { state: 'posted', text }
  if (text && !/^waiting/i.test(text)) return { state: 'failed', text }
  return { state: 'waiting', text }
}

/** The engine's automatic slots: 17:00 Cairo, then every 15 minutes, 5 a day. */
export const SLOT_START = '17:00'
export const SLOT_STEP_MIN = 15
export const SLOTS_PER_DAY = 5

export function nextFreeSlot(posts: Post[], now = cairoNow()): { date: string; time: string } {
  const taken = new Set(posts.map(whenOf).filter(Boolean).map((w) => `${w!.date} ${w!.time}`))
  const [h, m] = SLOT_START.split(':').map(Number)
  for (let day = 0; day < 120; day++) {
    const date = addDays(now.date, day)
    for (let k = 0; k < SLOTS_PER_DAY; k++) {
      const mins = h * 60 + m + k * SLOT_STEP_MIN
      const time = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
      // Facebook needs at least 15 minutes of notice.
      if (day === 0 && time <= addMinutes(now.time, 15)) continue
      if (!taken.has(`${date} ${time}`)) return { date, time }
    }
  }
  return { date: addDays(now.date, 1), time: SLOT_START }
}

export function addMinutes(time: string, n: number): string {
  const [h, m] = time.split(':').map(Number)
  const mins = Math.min(h * 60 + m + n, 23 * 60 + 59)
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

/** A Drive "view" link as a small image the browser can show; other links are returned unchanged. */
export function previewUrl(link: string, width = 900): string {
  const m = link.match(/drive\.google\.com\/file\/d\/([\w-]+)/) ?? link.match(/[?&]id=([\w-]+)/)
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w${width}` : link
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** True when every word typed is found in the post's item names, company or style. */
export function matchesSearch(p: Post, query: string): boolean {
  const words = norm(query).split(' ').filter(Boolean)
  if (!words.length) return true
  const hay = norm(`${p.items.map((i) => `${i.category} ${i.name}`).join(' ')} ${p.company} ${p.style} ${p.kind ? p.caption : ''}`)
  return words.every((w) => hay.includes(w))
}

/**
 * Posts that already use the given items. "same" holds posts with exactly these items (a single item
 * or the whole bundle, in any order); "partly" holds posts that share at least one of them.
 */
export function duplicatesOf(names: string[], posts: Post[]): { same: Post[]; partly: Post[] } {
  const want = new Set(names.map(norm).filter(Boolean))
  const same: Post[] = []
  const partly: Post[] = []
  if (!want.size) return { same, partly }
  for (const p of posts) {
    const have = new Set(p.items.map((i) => norm(i.name)).filter(Boolean))
    const shared = [...want].filter((n) => have.has(n)).length
    if (!shared) continue
    if (shared === want.size && have.size === want.size) same.push(p)
    else partly.push(p)
  }
  return { same, partly }
}

/** A post's category: its item's category from the product list, or Bundle when it holds more than one item. */
export const categoryOf = (p: Pick<Post, 'items'>) => (p.items.length > 1 ? 'Bundle' : p.items[0]?.category.trim() || 'Other')

/** How far from the typed price an offer may be and still be found. */
export const PRICE_RANGE = 500

/**
 * A search that is only a price: "22000", "22,000", "22000 EGP", "21.5", "21.5k", "22k".
 * A number below 1,000 is read as thousands (21.5 → 21,500). Anything else is not a price.
 */
export function priceQuery(query: string): number | null {
  const m = /^\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:egp|le|ج\.?م)?\s*$/i.exec(query)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  return m[2] || n < 1000 ? Math.round(n * 1000) : n
}

/** An offer is found by its items (as everywhere else) or by a price within PRICE_RANGE of the typed one. */
export function matchesOffer(p: Post, query: string): boolean {
  if (matchesSearch(p, query)) return true
  const want = priceQuery(query)
  return want !== null && Math.abs(toNumber(priceOf(p)) - want) <= PRICE_RANGE
}

/** Website photos older than this are looked up again when the photo picker opens. */
const PHOTOS_FRESH = 6 * 3600 * 1000

/** The website photos the engine found for item `index`, when they are for the same item name and recent enough. */
export function choicesFor(post: Post, index: number, now = Date.now()): PhotoChoiceItem | null {
  const c = post.photoChoices
  const it = c?.items?.[index]
  const name = post.items[index]?.name ?? ''
  if (!c || !it || it.name.trim().toLowerCase() !== name.trim().toLowerCase()) return null
  if (now - c.checkedAt > PHOTOS_FRESH) return null
  return it
}

/**
 * Price before and Company for a post's items, from the price list: the same rule as the engine's pricesFrom, so the
 * value the app shows is the one the engine writes. Same category, any case and spacing. Versions of one product show
 * the highest price, other posts the sum. An item that is not in the list (or has no number) gives 'Check item'.
 */
export function listPriceOf(items: Pick<PostItem, 'category' | 'name'>[], products: Product[], variants?: boolean): { priceBefore: string; company: string } {
  const list = items.filter((it) => it.name.trim())
  if (!list.length) return { priceBefore: '', company: '' }
  const same = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()
  const isNum = (s: string) => /^-?[\d,]+(\.\d+)?$/.test(s.trim()) && /\d/.test(s)
  let sum = 0, top = 0, bad = false
  const companies: string[] = []
  for (const it of list) {
    const p = products.find((x) => x.category === it.category.trim() && same(x.name, it.name))
    if (!p || (p.price.trim() !== '' && !isNum(p.price))) { bad = true; continue }
    const one = p.price.trim() === '' ? 0 : Number(p.price.replace(/,/g, ''))
    sum += one
    top = Math.max(top, one)
    if (p.company.trim() && !companies.includes(p.company.trim())) companies.push(p.company.trim())
  }
  return { priceBefore: bad ? 'Check item' : (variants ? top : sum).toLocaleString('en-US'), company: companies.join(' + ') }
}

/** A product name made comparable: case, spaces, inch marks (″ vs "), "Wi Fi" vs "WIFI" and brackets do not count. */
export const nameKey = (s: string) => s.toLowerCase().replace(/[″”“]/g, '"').replace(/wi[\s-]*fi/g, 'wifi').replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').trim()
const words = (s: string) => new Set(nameKey(s).split(/[^a-z0-9.+]+/).filter(Boolean))

/** The price list product closest to a name, in the same category when it has one; null when nothing is close enough. */
export function closestProduct(name: string, category: string, products: Product[]): Product | null {
  const want = words(name)
  if (!want.size) return null
  let best: Product | null = null
  let score = 0
  for (const p of products) {
    if (category.trim() && p.category !== category.trim()) continue
    const have = words(p.name)
    let both = 0
    for (const w of want) if (have.has(w)) both++
    // Share of the words the two names have together (Jaccard), so "PD98 Pro" does not match "PD98 Pro V2 Mouse Pad".
    const s = both / (want.size + have.size - both)
    if (s > score) { score = s; best = p }
  }
  return score >= 0.5 ? best : null
}

/** One item of a post whose price cannot be found: not in the price list (by its exact name), or there without a number. */
export type PriceIssue = { index: number; item: PostItem; reason: 'not-in-list' | 'no-price'; suggestion: Product | null }

/**
 * Why a product post has no usable Price before: each item the price list does not price (the same match as the engine:
 * same category, exact name), with the closest list product to swap in. `missing` is true when the post shows no
 * Price before at all ('Check item', empty or 0). Text, photo and video posts, published and skipped posts have none.
 */
export function priceIssues(post: Post, products: Product[]): { missing: boolean; items: PriceIssue[]; ignored?: boolean } {
  const none = { missing: false, items: [] }
  if (post.kind || ['posted', 'skipped'].includes(stageOf(post))) return none
  const before = post.priceBefore.trim()
  const missing = before === '' || before === 'Check item' || !/[1-9]/.test(before)
  // An empty product list (still loading) says nothing about the items.
  if (!products.length) return { missing, items: [] }
  const same = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()
  const items: PriceIssue[] = []
  post.items.forEach((item, index) => {
    if (!item.name.trim()) return
    const p = products.find((x) => x.category === item.category.trim() && same(x.name, item.name))
    if (p && /[1-9]/.test(p.price)) return
    items.push({ index, item, reason: p ? 'no-price' : 'not-in-list', suggestion: p ? null : closestProduct(item.name, item.category, products) })
  })
  const found = missing || items.length > 0
  // Ignored for exactly these products: no warning; a change of products brings it back.
  if (found && post.priceIgnored && post.priceIgnored === priceKey(post)) return { missing: false, items, ignored: true }
  return { missing: found, items }
}

/** The products of a post, as an ignored missing Price before remembers them. */
export const priceKey = (post: Pick<Post, 'items'>) => post.items.map((i) => `${i.category.trim()}|${i.name.trim()}`).join('\n')

/** Who may set a missing Price before aside: the people who approve offers or posters, or fix problems. */
export const PRICE_IGNORE_PERMS = ['offers.approve', 'designs.approve', 'fix'] as const

/** Posts (not published, not skipped) that show no Price before or have an item the price list cannot price. */
export const postsMissingPrice = (posts: Post[], products: Product[]) => posts.filter((p) => priceIssues(p, products).missing)

// ---------- "Also add to the website" (post.webAdd) ----------
/** The website option is on for this post (asked, being made, waiting, scheduled, live or failed). */
export const webOn = (p: Pick<Post, 'webAdd'>) => !!p.webAdd && p.webAdd !== 'remove' && p.webAdd !== 'removed'
/** Changes that the website product follows: its name, prices, poster (approved again after a redo) and when it goes live. */
const WEB_FIELDS = ['postDate', 'postTime', 'postNow', 'priceBefore', 'priceAfter', 'items', 'title', 'feedback'] as const
/**
 * The webAdd to save with a change, or undefined to leave it: when the website option is on, a change the website
 * product follows asks the engine to bring the product up to date again.
 */
export function webAskFor(before: Pick<Post, 'webAdd'> & Partial<Pick<Post, 'kind'>> | undefined, patch: Partial<Post>): 'asked' | undefined {
  if (!before || before.kind || 'webAdd' in patch || !webOn(before) || before.webAdd === 'asked') return undefined
  return WEB_FIELDS.some((k) => k in patch) ? 'asked' : undefined
}
/** Where the website product stands, in words for the post editor. */
export function webStateOf(p: Pick<Post, 'webAdd' | 'webAt' | 'webNote' | 'webLink'>): { tone: 'good' | 'info' | 'bad' | 'neutral'; text: string } | null {
  switch (p.webAdd) {
    case 'asked': case 'working': return { tone: 'info', text: 'Being added to the website' }
    case 'waiting': return { tone: 'neutral', text: 'Waiting' }
    case 'scheduled': return { tone: 'info', text: 'On the website from' }
    case 'live': return { tone: 'good', text: 'On the website' }
    case 'failed': return { tone: 'bad', text: 'Not added to the website' }
    case 'remove': return { tone: 'info', text: 'Being hidden on the website' }
    case 'removed': return { tone: 'neutral', text: 'Hidden on the website' }
    default: return null
  }
}
