import { getAuth } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, writeBatch, type DocumentData } from 'firebase/firestore'
import { firestore } from './firebase'
import { myNameFor } from './profiles'

// What each line of a completed order cost the shop, typed in (or taken from the price list) by someone whose role
// may see cost. Kept apart from orders/* (which everyone handling orders reads), one document per month the orders
// were placed in (Cairo), so the Sales page reads one or two documents for a period, not one per order.
//
//   orderCosts/{YYYY-MM}  { orders: { [orderId]: { lines: [{ n: line name, c: cost of one, or null }], at, byName } } }
//
// A saved cost belongs to the line with the same place and name; if the order's lines change, it no longer applies.

export type SavedLine = { n: string; c: number | null }
export type SavedCosts = Record<string, SavedLine[]>
export type CostEntry = { id: string; placedAt: number; lines: SavedLine[] }

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
export function savedOf(d: DocumentData | undefined, into: SavedCosts) {
  for (const [id, v] of Object.entries((d?.orders ?? {}) as Record<string, DocumentData>)) {
    if (!Array.isArray(v?.lines)) continue
    into[id] = (v.lines as DocumentData[]).map((l) => ({ n: String(l?.n ?? ''), c: num(l?.c) }))
  }
}

export interface OrderCostBackend {
  load(months: string[]): Promise<SavedCosts>
  save(entries: CostEntry[]): Promise<void>
}

function firestoreBackend(): OrderCostBackend {
  const db = firestore!
  return {
    async load(months) {
      const out: SavedCosts = {}
      const snaps = await Promise.all(months.map((m) => getDoc(doc(db, 'orderCosts', m))))
      for (const s of snaps) if (s.exists()) savedOf(s.data(), out)
      return out
    },
    async save(entries) {
      const me = getAuth(db.app).currentUser
      const byName = myNameFor(me)
      const months = new Map<string, Record<string, unknown>>()
      for (const e of entries) {
        const m = monthOf(e.placedAt)
        if (!months.has(m)) months.set(m, {})
        months.get(m)![e.id] = { lines: e.lines.map((l) => ({ n: l.n.slice(0, 400), c: l.c })), at: serverTimestamp(), byName }
      }
      // A batch takes up to 500 writes; one write per month is far below that.
      const batch = writeBatch(db)
      for (const [m, orders] of months) batch.set(doc(db, 'orderCosts', m), { orders }, { merge: true })
      await batch.commit()
    },
  }
}

const DEMO_KEY = 'posterpilot.demo.orderCosts.v1'
function localBackend(): OrderCostBackend {
  const read = (): SavedCosts => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '{}') as SavedCosts } catch { return {} } }
  return {
    async load() { return read() },
    async save(entries) {
      const all = read()
      for (const e of entries) all[e.id] = e.lines
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(all)) } catch { /* the demo then forgets on reload */ }
    },
  }
}

export const orderCosts: OrderCostBackend = firestore ? firestoreBackend() : localBackend()
