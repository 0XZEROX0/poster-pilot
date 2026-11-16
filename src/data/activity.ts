import { getAuth } from 'firebase/auth'
import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, startAfter, Timestamp, where, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore'
import { ACT_TEXT, FIELD_TEXT } from './history'
import { firestore } from './firebase'
import { fieldLabel } from './prices'

// One log of everything anyone does in the app, for the Activity page.
//
// It is read from three places, newest first:
//   log/{id}       what happened to each offer and post (app, engine and Facebook lines; see history.ts)
//   priceLog/{id}  every price list change (app, and the website sync as "Website")
//   costLog/{id}   every cost change (see costs.ts); read only by roles that may edit prices
//   activity/{id}  everything else: Builder quotes, discounts and live edits, people and roles, settings,
//                  engine runs asked from the app, and what the website sync sent
// Lines are only ever added. The database rules refuse any change or removal, also for the owner.
// activity/{id} = { at, by (uid | 'system' | 'website'), byName, app, act, what?, note?, ref? }

/** What the app writes into activity/{id}, per app. firestore.rules holds the same lists. */
export const ACTIVITY_ACTS = {
  builder: ['quote.saved', 'quote.updated', 'quote.deleted', 'quote.discount', 'quote.discount_removed', 'quote.live_edit'],
  people: ['join.accepted', 'join.declined', 'member.removed', 'member.role', 'role.saved', 'role.deleted', 'code.reset'],
  settings: ['templates.saved', 'engine.run'],
  tickets: ['ticket.opened', 'ticket.step', 'ticket.edited', 'ticket.deleted', 'ticket.step_removed'],
} as const
type AppWrites = typeof ACTIVITY_ACTS
export type WriteApp = keyof AppWrites

/** The apps the Activity page filters by. Engine and website lines carry their own app. */
export const APPS = ['posters', 'prices', 'builder', 'tickets', 'people', 'settings', 'website', 'engine'] as const
export type ActivityApp = (typeof APPS)[number]
export const APP_LABEL: Record<ActivityApp, string> = {
  posters: 'Offers and posters', prices: 'Prices', builder: 'Builder', tickets: 'Maintenance', people: 'People', settings: 'Settings', website: 'Website', engine: 'Engine',
}

/** English text for each kind of line that is not a post's history line (those are in history.ts). */
export const ACTIVITY_TEXT: Record<string, string> = {
  'quote.saved': 'Quote saved',
  'quote.updated': 'Quote changed',
  'quote.deleted': 'Quote deleted',
  'quote.discount': 'Extra discount given',
  'quote.discount_removed': 'Extra discount removed',
  'quote.live_edit': "Changed someone's live quote",
  'join.accepted': 'Accepted into the system',
  'join.declined': 'Join request declined',
  'member.removed': 'Removed from the system',
  'member.role': 'Role changed',
  'role.saved': 'Role saved',
  'role.deleted': 'Role deleted',
  'code.reset': 'New system code made',
  'templates.saved': 'Caption templates saved',
  'engine.run': 'Engine started by hand',
  'ticket.opened': 'Maintenance ticket opened',
  'ticket.step': 'Maintenance step added',
  'ticket.edited': 'Maintenance ticket changed',
  'ticket.deleted': 'Maintenance ticket deleted',
  'ticket.step_removed': 'Maintenance step taken out',
  'website.sent': 'Sent to the website',
  'website.error': 'Website refused a change',
  'price.edit': 'Price list changed',
  'price.add': 'Product added',
  'price.remove': 'Product deleted',
  'price.bulk': 'Changed by %',
  'cost.edit': 'Cost changed',
}

export const actText = (act: string) => ACTIVITY_TEXT[act] ?? ACT_TEXT[act] ?? act

/** Who did it: a person, or one of the workflows. */
export type WhoKind = 'person' | 'system' | 'website' | 'sheet'

export type ActivityRow = {
  id: string
  at: number
  by: string
  who: string
  kind: WhoKind
  app: ActivityApp
  act: string
  /** What it was done to: a post, a product, a quote's customer, a person, a role. */
  what: string
  note?: string
  changes?: { f: string; from: string; to: string }[]
  /** The post, for post lines, so the page can open it. */
  postId?: string
}

const kindOf = (by: string): WhoKind => (by === 'system' ? 'system' : by === 'website' ? 'website' : by === 'sheet' ? 'sheet' : 'person')
const nameOf = (by: string, byName: string) => (by === 'system' ? 'System' : by === 'website' ? 'Website' : by === 'sheet' ? 'Sheet' : byName || 'Someone')
const millis = (v: unknown) => (typeof v === 'number' ? v : (v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const changesOf = (v: unknown, label: (f: string) => string) =>
  Array.isArray(v) ? v.slice(0, 12).map((c: Record<string, unknown>) => ({ f: label(str(c.f)), from: String(c.from ?? ''), to: String(c.to ?? '') })) : undefined

export type Source = 'activity' | 'log' | 'priceLog' | 'costLog'

/** One stored line as a row of the Activity page. */
export function toRow(src: Source, id: string, d: DocumentData): ActivityRow {
  const by = str(d.by)
  const base = { id: `${src}/${id}`, at: millis(d.at) || Date.now(), by, who: nameOf(by, str(d.byName)), kind: kindOf(by) }
  if (src === 'log') {
    const engine = by === 'system' && /^prices\.checked$/.test(str(d.act))
    return { ...base, app: engine ? 'engine' : 'posters', act: str(d.act), what: str(d.title), note: str(d.note) || undefined, changes: changesOf(d.changes, (f) => FIELD_TEXT[f] ?? f), postId: str(d.postId) || undefined }
  }
  if (src === 'costLog') {
    return { ...base, app: 'prices', act: 'cost.edit', what: str(d.name), note: str(d.cat) || undefined, changes: changesOf(d.changes, fieldLabel) }
  }
  if (src === 'priceLog') {
    return { ...base, app: 'prices', act: `price.${str(d.act)}`, what: str(d.name), note: str(d.cat) || undefined, changes: changesOf(d.changes, fieldLabel) }
  }
  const app = (APPS as readonly string[]).includes(str(d.app)) ? (str(d.app) as ActivityApp) : 'engine'
  return { ...base, app, act: str(d.act), what: str(d.what), note: str(d.note) || undefined }
}

// ---------- Writing ----------

const DEMO_KEY = 'posterpilot.demo.activity.v1'
function demoLoad(): ActivityRow[] {
  try {
    const list = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/**
 * Adds a line to the activity log, after the thing itself was saved. It never stops the work: if the
 * database still has rules from before the log existed, the line is simply not kept.
 */
export function track<A extends WriteApp>(app: A, act: AppWrites[A][number], info: { what?: string; note?: string; ref?: string } = {}): void {
  const extra = {
    ...(info.what ? { what: short(info.what, 300) } : {}),
    ...(info.note ? { note: short(info.note, 1000) } : {}),
    ...(info.ref ? { ref: short(info.ref, 80) } : {}),
  }
  if (!firestore) {
    try {
      const row: ActivityRow = { id: `demo/${Date.now()}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), by: 'demo-you', who: 'You', kind: 'person', app, act, what: extra.what ?? '', note: extra.note }
      localStorage.setItem(DEMO_KEY, JSON.stringify([row, ...demoLoad()].slice(0, 300)))
    } catch {
      // The demo keeps nothing then.
    }
    return
  }
  const me = getAuth(firestore.app).currentUser
  if (!me) return
  addDoc(collection(firestore, 'activity'), { app, act, ...extra, by: me.uid, byName: me.displayName || me.email || '', at: serverTimestamp() }).catch(() => {})
}

/** "Changed someone's live quote" is noted once per quote per this long, not on every keystroke. */
const LIVE_EDIT_EVERY_MS = 10 * 60_000
const liveEditSeen = new Map<string, number>()
export function trackLiveEdit(uid: string, what: string, note: string) {
  const last = liveEditSeen.get(uid) ?? 0
  if (Date.now() - last < LIVE_EDIT_EVERY_MS) return
  liveEditSeen.set(uid, Date.now())
  track('builder', 'quote.live_edit', { what, note, ref: uid })
}

// ---------- Reading ----------

/** How many lines are read from each place at a time. Each line is one database read. */
export const PER_READ = 50

type Cursor = { src: Source; buffer: ActivityRow[]; last: QueryDocumentSnapshot | null; done: boolean; error: string }

/**
 * The lines between two moments, newest first, a page at a time. The three places are read lazily and
 * merged, so a page costs about one read per line shown. Filters (person, app, action, search) are
 * applied on the page itself: asking the database for them would need extra indexes.
 */
export class ActivityFeed {
  private cursors: Cursor[]
  private from: number
  private to: number
  constructor(from: number, to: number, sources: Source[] = ['activity', 'log', 'priceLog']) {
    this.from = from
    this.to = to
    this.cursors = sources.map((src) => ({ src, buffer: [], last: null, done: !firestore, error: '' }))
  }

  get done() {
    return this.cursors.every((c) => c.done && !c.buffer.length)
  }

  /** Places that could not be read (for example activity/ before the new rules are published). */
  get errors() {
    return this.cursors.filter((c) => c.error).map((c) => `${c.src}: ${c.error}`)
  }

  private async fill(c: Cursor) {
    const db = firestore!
    const parts = [where('at', '>=', Timestamp.fromMillis(this.from)), where('at', '<', Timestamp.fromMillis(this.to)), orderBy('at', 'desc')]
    const q = c.last ? query(collection(db, c.src), ...parts, startAfter(c.last), limit(PER_READ)) : query(collection(db, c.src), ...parts, limit(PER_READ))
    try {
      const snap = await getDocs(q)
      c.buffer.push(...snap.docs.map((d) => toRow(c.src, d.id, d.data({ serverTimestamps: 'estimate' }))))
      c.last = snap.docs[snap.docs.length - 1] ?? c.last
      if (snap.docs.length < PER_READ) c.done = true
    } catch (e) {
      c.error = (e as Error).message
      c.done = true
    }
  }

  /** The next `n` lines, newest first. */
  async more(n: number): Promise<ActivityRow[]> {
    if (!firestore) return this.demo(n)
    const out: ActivityRow[] = []
    while (out.length < n) {
      // A place that may have more and has nothing waiting is read first, so the merge stays in time order.
      const empty = this.cursors.filter((c) => !c.done && !c.buffer.length)
      if (empty.length) await Promise.all(empty.map((c) => this.fill(c)))
      const ready = this.cursors.filter((c) => c.buffer.length)
      if (!ready.length) break
      const next = ready.reduce((a, b) => (b.buffer[0].at > a.buffer[0].at ? b : a))
      out.push(next.buffer.shift()!)
    }
    return out
  }

  private demoRows: ActivityRow[] | null = null
  private async demo(n: number) {
    this.demoRows ??= demoLoad().filter((r) => r.at >= this.from && r.at < this.to).sort((a, b) => b.at - a.at)
    const out = this.demoRows.splice(0, n)
    if (!this.demoRows.length) this.cursors.forEach((c) => (c.done = true))
    return out
  }
}

/** Whether a row passes the page's filters. */
export function matches(r: ActivityRow, f: { who: string; app: string; act: string; search: string }) {
  if (f.who && (f.who.startsWith('kind:') ? r.kind !== f.who.slice(5) : r.by !== f.who)) return false
  if (f.app && r.app !== f.app) return false
  if (f.act && r.act !== f.act) return false
  const words = f.search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = [r.who, actText(r.act), r.what, r.note ?? '', ...(r.changes ?? []).flatMap((c) => [c.f, c.from, c.to])].join(' ').toLowerCase()
  return words.every((w) => text.includes(w))
}
