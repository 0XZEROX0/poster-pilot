import { getAuth } from 'firebase/auth'
import { collection, deleteField, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch, type Firestore } from 'firebase/firestore'
import { useEffect, useSyncExternalStore } from 'react'
import { firestore } from './firebase'
import { costKey, costsOf, type CostMap } from './costMath'
import { money, type PriceChange } from './prices'
import { allowed } from './store'

// What each product costs the shop. Only people whose role has 'See and edit cost' may see or change it, and the
// database enforces that: the cost is NOT a field of the price list (everyone in the system reads prices/*,
// and the engine and the website sync read it too), it lives in its own collection that nobody else can read.
//
//   costs/{category}  { items: { [productId]: { cost, at, byName } } }   same category ids as prices/{category}
//   costLog/{auto}    { cat, pid, name, act: 'cost', changes: [{ f: 'cost', from, to }], at, by, byName }
//                     never changed or removed; read only with 'See and edit cost' (so not part of priceLog, which
//                     everyone reads)
//
// The cost is never copied anywhere else: quotes, live quotes (drafts), posts, the engine and the website
// sync only ever see prices/*.

export * from './costMath'

export interface CostBackend {
  watch(onData: (costs: CostMap) => void, onError: (message: string) => void): () => void
  /** Sets (or empties, with null) one product's cost, with a line in costLog, all or nothing. */
  save(cat: string, pid: string, name: string, cost: number | null, before: number | null): Promise<void>
  /** A product moved to another category gets a new id: its cost follows it. */
  move(from: { cat: string; pid: string }, to: { cat: string; pid: string }, cost: number): Promise<void>
  /** A deleted product's cost goes with it. */
  remove(cat: string, pid: string): Promise<void>
  history(max: number, product?: { cat: string; pid: string }): Promise<PriceChange[]>
}

const millis = (v: unknown) => (typeof v === 'number' ? v : (v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0)
const show = (n: number | null) => (n === null ? '' : money(n))

function firestoreCosts(db: Firestore): CostBackend {
  const me = () => getAuth(db.app).currentUser
  const who = () => ({ by: me()?.uid ?? '', byName: me()?.displayName || me()?.email || '' })
  return {
    watch(onData, onError) {
      return onSnapshot(
        collection(db, 'costs'),
        (snap) => {
          const out: CostMap = {}
          snap.docs.forEach((d) => costsOf(d.id, d.data(), out))
          onData(out)
        },
        (e) => onError(e.message),
      )
    },
    async save(cat, pid, name, cost, before) {
      if (cost === before) return
      const { by, byName } = who()
      const batch = writeBatch(db)
      batch.set(doc(db, 'costs', cat), { items: { [pid]: cost === null ? deleteField() : { cost, at: serverTimestamp(), byName } } }, { merge: true })
      batch.set(doc(collection(db, 'costLog')), { cat, pid, name: name.slice(0, 400), act: 'cost', changes: [{ f: 'cost', from: show(before), to: show(cost) }], at: serverTimestamp(), by, byName })
      await batch.commit()
    },
    async move(from, to, cost) {
      const { byName } = who()
      const batch = writeBatch(db)
      batch.set(doc(db, 'costs', to.cat), { items: { [to.pid]: { cost, at: serverTimestamp(), byName } } }, { merge: true })
      batch.set(doc(db, 'costs', from.cat), { items: { [from.pid]: deleteField() } }, { merge: true })
      await batch.commit()
    },
    async remove(cat, pid) {
      await writeBatch(db).set(doc(db, 'costs', cat), { items: { [pid]: deleteField() } }, { merge: true }).commit()
    },
    async history(max, product) {
      // One product's lines are few: read them without an order (no extra index needed) and sort here.
      const q = product
        ? query(collection(db, 'costLog'), where('cat', '==', product.cat), where('pid', '==', product.pid), limit(100))
        : query(collection(db, 'costLog'), orderBy('at', 'desc'), limit(max))
      const snap = await getDocs(q)
      return snap.docs
        .map((d) => ({ ...(d.data() as Omit<PriceChange, 'id' | 'at'>), id: `c${d.id}`, at: millis(d.data({ serverTimestamps: 'estimate' }).at) || Date.now() }))
        .sort((a, b) => b.at - a.at)
        .slice(0, max)
    },
  }
}

const DEMO_KEY = 'posterpilot.demo.costs.v1'
const DEMO_LOG_KEY = 'posterpilot.demo.costLog.v1'

function localCosts(): CostBackend {
  const load = <T,>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  }
  // A few costs so the demo shows how it looks.
  let costs = load<CostMap>(DEMO_KEY, { 'cpu/d1': 7300, 'cpu/d4': 7600, 'mb/d8': 4950, 'ram/d13': 13300, 'vga/d15': 27600, 'ssd/d19': 3500, 'case/d22': 3900, 'cooler/d25': 1050, 'monitor/d27': 5400 })
  let log = load<PriceChange[]>(DEMO_LOG_KEY, [])
  const listeners = new Set<(c: CostMap) => void>()
  const persist = () => {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(costs))
      localStorage.setItem(DEMO_LOG_KEY, JSON.stringify(log))
    } catch {
      // The demo then lasts until the page is closed.
    }
    listeners.forEach((l) => l(costs))
  }
  const drop = (k: string) => {
    const next = { ...costs }
    delete next[k]
    costs = next
  }
  return {
    watch(onData) {
      listeners.add(onData)
      onData(costs)
      return () => listeners.delete(onData)
    },
    async save(cat, pid, name, cost, before) {
      if (cost === before) return
      if (cost === null) drop(costKey(cat, pid))
      else costs = { ...costs, [costKey(cat, pid)]: cost }
      log = [{ id: `c${Date.now()}`, cat, pid, name, act: 'cost' as const, changes: [{ f: 'cost', from: show(before), to: show(cost) }], at: Date.now(), by: 'demo-you', byName: 'You' }, ...log].slice(0, 300)
      persist()
    },
    async move(from, to, cost) {
      drop(costKey(from.cat, from.pid))
      costs = { ...costs, [costKey(to.cat, to.pid)]: cost }
      persist()
    },
    async remove(cat, pid) {
      drop(costKey(cat, pid))
      persist()
    },
    async history(max, product) {
      return log.filter((l) => !product || (l.cat === product.cat && l.pid === product.pid)).slice(0, max)
    },
  }
}

export const costs: CostBackend = firestore ? firestoreCosts(firestore) : localCosts()

// One live listener for the whole app, only for people who may see cost (anyone else never asks the database).
type CostState = { loaded: boolean; costs: CostMap; error: string }
let state: CostState = { loaded: false, costs: {}, error: '' }
const listeners = new Set<() => void>()
let users = 0
let stop: (() => void) | null = null
let stopTimer: ReturnType<typeof setTimeout> | undefined
const set = (patch: Partial<CostState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const EMPTY: CostState = { loaded: true, costs: {}, error: '' }

function hold() {
  if (!allowed('cost')) return
  users++
  clearTimeout(stopTimer)
  if (!stop) stop = costs.watch((c) => set({ costs: c, loaded: true, error: '' }), (error) => set({ error, loaded: true }))
  return () => {
    users--
    if (users === 0) stopTimer = setTimeout(() => { stop?.(); stop = null; state = { loaded: false, costs: {}, error: '' } }, 5 * 60_000)
  }
}

/** Costs, live, for people whose role has 'See and edit cost'. Everyone else gets nothing (and reads nothing). */
export function useCosts(): CostState {
  useEffect(hold, [])
  const s = useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state)
  return allowed('cost') ? s : EMPTY
}

// Whether costs are on screen. Hidden every time the app opens, so they are never shown by accident to
// someone looking over a shoulder; one switch for the whole app (Prices and Builder).
let shown = false
const shownListeners = new Set<() => void>()
export const setCostShown = (v: boolean) => {
  shown = v
  shownListeners.forEach((l) => l())
}
export const useCostShown = () => useSyncExternalStore((l) => (shownListeners.add(l), () => shownListeners.delete(l)), () => shown)
