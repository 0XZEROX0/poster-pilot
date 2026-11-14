import type { CaptionTemplate, Post } from './types'

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

export const isBuilding = (p: Post) => isRedoing(p) || isBusy(p) || (!anyProblemOf(p) && (!p.posterUrl || !p.photoStatus))

/**
 * Where the offer stands before a poster is made: waiting for someone to approve it, sent back to
 * its maker, or null once approved. A post from before offers existed has no `offer` and counts as approved.
 */
export function offerOf(p: Pick<Post, 'offer' | 'appNew'>): 'waiting' | 'rejected' | null {
  if (p.offer === 'Rejected') return 'rejected'
  return p.offer === '' || (p.offer === undefined && p.appNew === true) ? 'waiting' : null
}

/** A post Facebook already holds cannot be deleted from the app. */
export const onFacebook = (p: Pick<Post, 'fbStatus' | 'fbPostId'>) => /^(scheduled|published)/i.test(p.fbStatus.trim()) || p.fbPostId !== ''

export function stageOf(p: Post): Stage {
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

export const titleOf = (p: Post) => p.items.map((i) => i.name.trim()).filter(Boolean).join(' + ')

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
export function buildCaption(p: Pick<Post, 'items' | 'company' | 'priceBefore' | 'priceAfter' | 'details' | 'captionStyle'>, templates: CaptionTemplate[]): string {
  const wanted = p.captionStyle.trim().toLowerCase()
  const tpl = templates.find((t) => t.name.trim().toLowerCase() === wanted) ?? templates.find((t) => t.name.trim().toLowerCase() === 'default') ?? templates[0]
  if (!tpl) return ''
  const values: Record<string, string> = {
    name: p.items.map((i) => i.name.trim()).filter(Boolean).join(' + '),
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
  const hay = norm(`${p.items.map((i) => `${i.category} ${i.name}`).join(' ')} ${p.company} ${p.style}`)
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
