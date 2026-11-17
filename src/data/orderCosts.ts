import { getAuth } from 'firebase/auth'
import { arrayUnion, deleteField, doc, getDoc, serverTimestamp, setDoc, writeBatch, type DocumentData } from 'firebase/firestore'
import { firestore } from './firebase'
import { myNameFor } from './profiles'

// What each line of a completed order cost the shop, typed in (or taken from the price list) by someone whose role
// may see cost. Kept apart from orders/* (which everyone handling orders reads), one document per month the orders
// were placed in (Cairo), so the Sales page reads one or two documents for a period, not one per order.
//
//   orderCosts/{YYYY-MM}  { orders: { [orderId]: { lines: [{ n: line name, c: cost of one, or null, k?: product }], at, byName,
//                         log: [{ at, byName, note }] } } }   log: what was changed, oldest first
//   orderCosts/links      { web: { 'websiteId:optionId': 'cat/pid' }, names: { [plain line name]: 'cat/pid' } }
//                         lines picked as a price list product for every order: a website product, or a name
//
// A saved cost belongs to the line with the same place and name; if the order's lines change, it no longer applies.
// k is the price list product (`cat/pid`) picked for that one line. a: the cost was kept automatically from that
// price list product (on the order's day), so the order holds it even if the price list changes or the product goes.

/** a: the price list product the cost was kept from, automatically (not typed): it only counts while the line is
 * still that product, so picking another product brings the new product's cost. */
export type SavedLine = { n: string; c: number | null; k?: string; a?: string }
export type SavedCosts = Record<string, SavedLine[]>
export type CostLinks = { web: Record<string, string>; names: Record<string, string> }
export const NO_LINKS: CostLinks = { web: {}, names: {} }
/** note: what changed, added to the order's cost history (who and when are added here). */
export type CostEntry = { id: string; placedAt: number; lines: SavedLine[]; note?: string }
/** The cost history of an order: every change to its costs or products, kept with its costs (only cost roles see it). */
export type CostLog = { at: number; byName: string; note: string }
export type CostLogs = Record<string, CostLog[]>

/** The Cairo month (YYYY-MM) of a moment. */
export function monthOf(ms: number): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}`
}
/** Every month from one Cairo day to another (YYYY-MM-DD), both included. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let y = +from.slice(0, 4), m = +from.slice(5, 7)
  const end = to.slice(0, 7)
  for (let i = 0; i < 240; i++) {
    const k = `${y}-${String(m).padStart(2, '0')}`
    out.push(k)
    if (k >= end) break
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
export function savedOf(d: DocumentData | undefined, into: SavedCosts, logs?: CostLogs) {
  for (const [id, v] of Object.entries((d?.orders ?? {}) as Record<string, DocumentData>)) {
    if (logs && Array.isArray(v?.log)) logs[id] = (v.log as DocumentData[]).map((l) => ({ at: num(l?.at) ?? 0, byName: String(l?.byName ?? ''), note: String(l?.note ?? '') })).sort((a, b) => a.at - b.at)
    if (!Array.isArray(v?.lines)) continue
    into[id] = (v.lines as DocumentData[]).map((l) => {
      const line: SavedLine = { n: String(l?.n ?? ''), c: num(l?.c) }
      if (typeof l?.k === 'string' && l.k) line.k = l.k
      if (typeof l?.a === 'string' && l.a) line.a = l.a
      return line
    })
  }
}
const strMap = (v: unknown): Record<string, string> => Object.fromEntries(Object.entries((v && typeof v === 'object' ? v : {}) as Record<string, unknown>).filter(([, x]) => typeof x === 'string' && x)) as Record<string, string>
export const linksOf = (d: DocumentData | undefined): CostLinks => ({ web: strMap(d?.web), names: strMap(d?.names) })

export interface OrderCostBackend {
  load(months: string[]): Promise<{ saved: SavedCosts; logs: CostLogs }>
  save(entries: CostEntry[]): Promise<void>
  loadLinks(): Promise<CostLinks>
  /** Picks a price list product for every line of a website product (web) or with a name (names); '' unlinks. */
  link(kind: 'web' | 'names', key: string, product: string): Promise<void>
}
const cleanEntry = (l: SavedLine) => {
  const out: SavedLine = { n: l.n.slice(0, 400), c: l.c }
  if (l.k) out.k = l.k.slice(0, 120)
  if (l.a && l.c !== null) out.a = l.a.slice(0, 120)
  return out
}

function firestoreBackend(): OrderCostBackend {
  const db = firestore!
  return {
    async load(months) {
      const saved: SavedCosts = {}
      const logs: CostLogs = {}
      const snaps = await Promise.all(months.map((m) => getDoc(doc(db, 'orderCosts', m))))
      for (const s of snaps) if (s.exists()) savedOf(s.data(), saved, logs)
      return { saved, logs }
    },
    async save(entries) {
      const me = getAuth(db.app).currentUser
      const byName = myNameFor(me)
      const months = new Map<string, Record<string, unknown>>()
      for (const e of entries) {
        const m = monthOf(e.placedAt)
        if (!months.has(m)) months.set(m, {})
        months.get(m)![e.id] = { lines: e.lines.map(cleanEntry), at: serverTimestamp(), byName, ...(e.note ? { log: arrayUnion({ at: Date.now(), byName, note: e.note.slice(0, 500) }) } : {}) }
      }
      // A batch takes up to 500 writes; one write per month is far below that.
      const batch = writeBatch(db)
      for (const [m, orders] of months) batch.set(doc(db, 'orderCosts', m), { orders }, { merge: true })
      await batch.commit()
    },
    async loadLinks() {
      const s = await getDoc(doc(db, 'orderCosts', 'links'))
      return linksOf(s.exists() ? s.data() : undefined)
    },
    async link(kind, key, product) {
      await setDoc(doc(db, 'orderCosts', 'links'), { [kind]: { [key.slice(0, 200)]: product ? product : deleteField() } }, { merge: true })
    },
  }
}

const DEMO_KEY = 'posterpilot.demo.orderCosts.v2'
const DEMO_LINKS = 'posterpilot.demo.orderLinks.v1'
function localBackend(): OrderCostBackend {
  const readLinks = (): CostLinks => { try { return linksOf(JSON.parse(localStorage.getItem(DEMO_LINKS) || '{}')) } catch { return { web: {}, names: {} } } }
  type Demo = { saved: SavedCosts; logs: CostLogs }
  const read = (): Demo => { try { const d = JSON.parse(localStorage.getItem(DEMO_KEY) || '{}'); return { saved: d.saved ?? {}, logs: d.logs ?? {} } } catch { return { saved: {}, logs: {} } } }
  return {
    async load() { return read() },
    async save(entries) {
      const all = read()
      for (const e of entries) {
        all.saved[e.id] = e.lines
        if (e.note) all.logs[e.id] = [...(all.logs[e.id] ?? []), { at: Date.now(), byName: 'You', note: e.note }]
      }
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(all)) } catch { /* the demo then forgets on reload */ }
    },
    async loadLinks() { return readLinks() },
    async link(kind, key, product) {
      const l = readLinks()
      if (product) l[kind][key] = product
      else delete l[kind][key]
      try { localStorage.setItem(DEMO_LINKS, JSON.stringify(l)) } catch { /* the demo then forgets on reload */ }
    },
  }
}

export const orderCosts: OrderCostBackend = firestore ? firestoreBackend() : localBackend()
