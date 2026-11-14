import { getAuth } from 'firebase/auth'
import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { firestore } from './firebase'
import type { PriceCategory, PriceItem } from './prices'

/** A kind of part in a build. `cats` are the price-list categories it is picked from; empty means any. */
export type Slot = { key: string; label: string; cats: string[] }

/** The quotation's rows, in the order of the sheet. */
export const SLOTS: Slot[] = [
  { key: 'mb', label: 'Motherboard', cats: ['mb'] },
  { key: 'cpu', label: 'CPU', cats: ['cpu'] },
  { key: 'ram', label: 'RAM', cats: ['ram'] },
  { key: 'gpu', label: 'GPU', cats: ['vga'] },
  { key: 'ssd', label: 'SSD / HDD', cats: ['ssd'] },
  { key: 'case', label: 'Case', cats: ['case'] },
  { key: 'psu', label: 'PSU', cats: ['psu'] },
  { key: 'cooler', label: 'Cooler', cats: ['cooler'] },
  { key: 'fans', label: 'Case fans', cats: ['fans', 'accfan'] },
  { key: 'monitor', label: 'Monitor', cats: ['monitor'] },
  { key: 'keyboard', label: 'Keyboard', cats: ['keyboard'] },
  { key: 'mouse', label: 'Mouse', cats: ['mouse'] },
  { key: 'pad', label: 'Mouse pad', cats: ['pad'] },
  { key: 'speaker', label: 'Speakers', cats: ['speaker'] },
  { key: 'headset', label: 'Headset', cats: ['headset'] },
  { key: 'extra', label: 'Extra', cats: [] },
  { key: 'paste', label: 'Thermal paste', cats: ['paste'] },
]
export const slotOf = (key: string) => SLOTS.find((s) => s.key === key) ?? SLOTS.find((s) => s.key === 'extra')!

/** The rows a new build starts with: one of each, like the sheet. Case fans, mouse pad, speakers and headset only when asked for. */
export const START_SLOTS = SLOTS.filter((s) => !['fans', 'pad', 'speaker', 'headset'].includes(s.key)).map((s) => s.key)

/**
 * One row of a build. The product is remembered by category and id, with a copy of its name and
 * prices from when it was picked, so a quote still reads right if the product is later deleted.
 */
export type Line = { id: string; slot: string; cat?: string; pid?: string; name: string; qty: number; warranty: number | null; alone: number | null; in: number | null }

export type Build = { id?: string; customer: string; sales: string; lines: Line[]; extra: number; buildDiscount: boolean; at?: number; byName?: string }

export const lineId = () => Math.random().toString(36).slice(2, 10)
export const emptyLine = (slot: string): Line => ({ id: lineId(), slot, name: '', qty: 1, warranty: null, alone: null, in: null })
/** Puts back an empty row for every kind a build starts with that has none, in the sheet's order. */
export function complete(lines: Line[]): Line[] {
  const rank = (slot: string) => SLOTS.findIndex((s) => s.key === slot)
  const missing = START_SLOTS.filter((k) => !lines.some((l) => l.slot === k)).map(emptyLine)
  return [...lines, ...missing].map((l, i) => ({ l, i })).sort((a, b) => rank(a.l.slot) - rank(b.l.slot) || a.i - b.i).map((x) => x.l)
}
export const newBuild = (sales: string): Build => ({ customer: '', sales, lines: START_SLOTS.map(emptyLine), extra: 0, buildDiscount: true })

/** The product a line points at, as it is in the price list now. */
export function liveItem(cats: PriceCategory[], line: Line): PriceItem | undefined {
  if (!line.cat || !line.pid) return undefined
  return cats.find((c) => c.id === line.cat)?.items.find((i) => i.id === line.pid)
}

/** The line with today's name and prices, when its product is still in the list. */
export function fresh(cats: PriceCategory[], line: Line): Line {
  const item = liveItem(cats, line)
  return item ? { ...line, name: item.name, warranty: item.warranty, alone: item.alone, in: item.in } : line
}

export const pick = (line: Line, cat: string, item: PriceItem): Line => ({ ...line, cat, pid: item.id, name: item.name, warranty: item.warranty, alone: item.alone, in: item.in })

/** The sheet's sums: price is the "alone" price; the build discount is what buying it as a build saves. */
export function totals(lines: Line[], extra: number, buildDiscount: boolean) {
  let subtotal = 0
  let inBuild = 0
  for (const l of lines) {
    if (!l.name) continue
    const alone = l.alone ?? l.in ?? 0
    subtotal += alone * l.qty
    inBuild += (l.in ?? alone) * l.qty
  }
  const saved = buildDiscount ? Math.max(0, subtotal - inBuild) : 0
  const discount = saved + (extra || 0)
  return { subtotal, saved, discount, total: subtotal - discount }
}

const norm = (s: string | undefined) => (s ?? '').toUpperCase().replace(/[\s-]+/g, '')

/**
 * Why a product does not fit the rest of the build, or '' when it fits (or when we cannot tell).
 * CPU and motherboard share a socket; RAM and motherboard share a memory type (DDR4, DDR5).
 */
export function misfit(cat: string, item: PriceItem, others: { cat: string; item: PriceItem }[]): string {
  const mb = others.find((o) => o.cat === 'mb')?.item
  const cpu = others.find((o) => o.cat === 'cpu')?.item
  const rams = others.filter((o) => o.cat === 'ram').map((o) => o.item)
  const s = item.specs ?? {}
  if (cat === 'cpu' && mb?.specs?.socket && s.socket && norm(mb.specs.socket) !== norm(s.socket)) return `Socket ${s.socket}, motherboard is ${mb.specs.socket}`
  if (cat === 'ram' && mb?.specs?.memory && s.memory && norm(mb.specs.memory) !== norm(s.memory)) return `${s.memory}, motherboard takes ${mb.specs.memory}`
  if (cat === 'mb') {
    if (cpu?.specs?.socket && s.socket && norm(cpu.specs.socket) !== norm(s.socket)) return `Socket ${s.socket}, CPU is ${cpu.specs.socket}`
    const ram = rams.find((r) => r.specs?.memory && s.memory && norm(r.specs.memory) !== norm(s.memory))
    if (ram) return `${s.memory}, RAM is ${ram.specs!.memory}`
  }
  return ''
}

/** The products picked in a build, as they are in the price list now. */
export const chosen = (cats: PriceCategory[], lines: Line[]) =>
  lines.flatMap((l) => {
    const item = liveItem(cats, l)
    return item && l.cat ? [{ cat: l.cat, item, line: l.id }] : []
  })

/** The shop details printed under every quotation. */
export const SHOP = {
  location: 'مول البستان - 18 شارع يوسف الجندى، باب اللوق، التحرير ( مواعيد العمل من 12م ال 10م )',
  website: 'www.static-eg.com/',
  phone: '01223311744 -- 01272222829',
  footer: 'الاسعار سارية ليوم واحد فقط',
}

// ---------- Saved quotes ----------

export type SavedQuote = Build & { id: string; at: number; by: string; byName: string; total: number }

export interface QuoteBackend {
  /** Newest first. `everyone` lists all people's quotes (needs 'See all saved quotes'); otherwise only one's own. */
  list(max: number, everyone: boolean): Promise<SavedQuote[]>
  save(b: Build, total: number): Promise<string>
  remove(id: string): Promise<void>
}

const millis = (v: unknown) => (typeof v === 'number' ? v : (v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0)
const clean = (b: Build) => ({
  customer: b.customer.trim().slice(0, 120),
  sales: b.sales.trim().slice(0, 120),
  lines: b.lines.filter((l) => l.name).slice(0, 40).map((l) => ({ slot: l.slot, cat: l.cat ?? '', pid: l.pid ?? '', name: l.name, qty: l.qty, warranty: l.warranty, alone: l.alone, in: l.in })),
  extra: Number(b.extra) || 0,
  buildDiscount: b.buildDiscount,
})
const asQuote = (id: string, d: Record<string, unknown>): SavedQuote => ({
  id,
  customer: String(d.customer ?? ''),
  sales: String(d.sales ?? ''),
  lines: (Array.isArray(d.lines) ? d.lines : []).map((l: Record<string, unknown>) => ({ id: lineId(), slot: String(l.slot ?? 'extra'), cat: l.cat ? String(l.cat) : undefined, pid: l.pid ? String(l.pid) : undefined, name: String(l.name ?? ''), qty: Number(l.qty) || 1, warranty: typeof l.warranty === 'number' ? l.warranty : null, alone: typeof l.alone === 'number' ? l.alone : null, in: typeof l.in === 'number' ? l.in : null })),
  extra: Number(d.extra) || 0,
  buildDiscount: d.buildDiscount !== false,
  at: millis(d.at),
  by: String(d.by ?? ''),
  byName: String(d.byName ?? ''),
  total: Number(d.total) || 0,
})

function firestoreQuotes(): QuoteBackend {
  const db = firestore!
  return {
    async list(max, everyone) {
      if (everyone) {
        const snap = await getDocs(query(collection(db, 'quotes'), orderBy('at', 'desc'), limit(max)))
        return snap.docs.map((d) => asQuote(d.id, d.data()))
      }
      // One's own quotes: few, so they are sorted here (sorting in the query would need an extra index).
      const uid = getAuth(db.app).currentUser?.uid ?? ''
      const snap = await getDocs(query(collection(db, 'quotes'), where('by', '==', uid)))
      return snap.docs.map((d) => asQuote(d.id, d.data())).sort((a, b) => b.at - a.at).slice(0, max)
    },
    async save(b, total) {
      const me = getAuth(db.app).currentUser
      const body = { ...clean(b), total, at: serverTimestamp() }
      if (b.id) {
        await updateDoc(doc(db, 'quotes', b.id), body)
        return b.id
      }
      const ref = await addDoc(collection(db, 'quotes'), { ...body, by: me?.uid ?? '', byName: me?.displayName || me?.email || '' })
      return ref.id
    },
    async remove(id) {
      await deleteDoc(doc(db, 'quotes', id))
    },
  }
}

function localQuotes(): QuoteBackend {
  const KEY = 'posterpilot.demo.quotes.v1'
  const load = (): SavedQuote[] => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]')
    } catch {
      return []
    }
  }
  const store = (list: SavedQuote[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(list))
    } catch {
      // The demo keeps nothing then.
    }
  }
  return {
    async list(max) {
      return load().sort((a, b) => b.at - a.at).slice(0, max)
    },
    async save(b, total) {
      const id = b.id ?? `q${Date.now()}`
      const list = load().filter((q) => q.id !== id)
      store([{ ...asQuote(id, clean(b)), id, at: Date.now(), by: 'demo-you', byName: 'You', total }, ...list])
      return id
    },
    async remove(id) {
      store(load().filter((q) => q.id !== id))
    },
  }
}

export const quotes: QuoteBackend = firestore ? firestoreQuotes() : localQuotes()

// ---------- Live builds ----------

/**
 * The build each person has open right now, kept in drafts/{uid} a moment after every change, so that
 * someone with 'See all saved quotes' can watch it being made. One small write per pause in typing.
 */
/** extra is the builder's own extra discount; grant is the one given from Live quotes (0 when none). */
export type LiveBuild = { uid: string; customer: string; sales: string; byName: string; lines: Line[]; extra: number; grant: number; buildDiscount: boolean; total: number; at: number }

function asLive(uid: string, d: Record<string, unknown>): LiveBuild {
  const q = asQuote(uid, d)
  return { uid, customer: q.customer, sales: q.sales, byName: q.byName, lines: q.lines, extra: q.extra, grant: Number(d.grant) || 0, buildDiscount: q.buildDiscount, total: q.total, at: q.at || Date.now() }
}

/** What a quote is made of, to tell whether two versions differ (empty rows and line ids don't count). */
export const shape = (b: { customer: string; extra: number; buildDiscount: boolean }, lines: Line[]) =>
  JSON.stringify([b.customer.trim(), Number(b.extra) || 0, b.buildDiscount, lines.filter((l) => l.name).map((l) => [l.slot, l.pid || l.name, l.qty])])

export const LIVE_IDLE_MS = 30 * 60_000

export const live = {
  /** Shares this person's build. Does nothing in the demo. */
  async publish(b: Build, total: number, grant: number): Promise<void> {
    if (!firestore) return
    const me = getAuth(firestore.app).currentUser
    if (!me) return
    const body = clean(b)
    await setDoc(doc(firestore, 'drafts', me.uid), { customer: body.customer, sales: body.sales, lines: body.lines, extra: body.extra, grant, buildDiscount: body.buildDiscount, total, at: serverTimestamp(), byName: me.displayName || me.email || '' })
  },
  /** One person's open build, live. */
  watchOne(uid: string, onData: (b: LiveBuild | null) => void): () => void {
    if (!firestore) {
      onData(null)
      return () => {}
    }
    return onSnapshot(doc(firestore, 'drafts', uid), (snap) => onData(snap.exists() ? asLive(uid, snap.data()) : null), () => onData(null))
  },
  /** Everyone's open builds, newest first, live. */
  watch(onData: (list: LiveBuild[]) => void, onError: (message: string) => void): () => void {
    if (!firestore) {
      onData([])
      return () => {}
    }
    return onSnapshot(
      query(collection(firestore, 'drafts'), orderBy('at', 'desc'), limit(50)),
      (snap) => onData(snap.docs.map((d) => asLive(d.id, d.data()))),
      (e) => onError(e.message),
    )
  },
}

// ---------- Extra discount given on someone's live quote ----------

/** A discount someone with 'Give extra discount' put on another person's open quote: grants/{that person's uid}. */
export type Grant = { amount: number; byName: string; at: number }

export const grants = {
  watch(uid: string, onData: (g: Grant | null) => void): () => void {
    if (!firestore || !uid) {
      onData(null)
      return () => {}
    }
    return onSnapshot(
      doc(firestore, 'grants', uid),
      (snap) => {
        const d = snap.data()
        onData(snap.exists() && d && Number(d.amount) > 0 ? { amount: Number(d.amount), byName: String(d.byName ?? ''), at: millis(d.at) } : null)
      },
      () => onData(null),
    )
  },
  async give(uid: string, amount: number): Promise<void> {
    if (!firestore) return
    const me = getAuth(firestore.app).currentUser
    if (!me) return
    if (amount <= 0) {
      await deleteDoc(doc(firestore, 'grants', uid))
      return
    }
    await setDoc(doc(firestore, 'grants', uid), { amount, by: me.uid, byName: me.displayName || me.email || '', at: serverTimestamp() })
  },
  /** Ends the discount given on one's own quote, for example when starting a new quote. */
  async clearMine(): Promise<void> {
    if (!firestore) return
    const me = getAuth(firestore.app).currentUser
    if (me) await deleteDoc(doc(firestore, 'grants', me.uid)).catch(() => {})
  },
}

// ---------- Changes someone with 'Edit live quotes' makes to another person's open quote ----------

/** The whole quote as the editor left it: edits/{the builder's uid}. The builder's app takes it in and removes it. */
export type QuoteEdit = { customer: string; lines: Line[]; extra: number; buildDiscount: boolean; byName: string; at: number }

export const edits = {
  async send(uid: string, b: Build): Promise<void> {
    if (!firestore) return
    const me = getAuth(firestore.app).currentUser
    if (!me) return
    const body = clean(b)
    await setDoc(doc(firestore, 'edits', uid), { customer: body.customer, lines: body.lines, extra: body.extra, buildDiscount: body.buildDiscount, by: me.uid, byName: me.displayName || me.email || '', at: serverTimestamp() })
  },
  /** Changes made to this person's quote by someone else. */
  watchMine(onData: (e: QuoteEdit) => void): () => void {
    if (!firestore) return () => {}
    const me = getAuth(firestore.app).currentUser
    if (!me) return () => {}
    return onSnapshot(
      doc(firestore, 'edits', me.uid),
      (snap) => {
        if (!snap.exists() || snap.metadata.hasPendingWrites) return
        const q = asQuote(me.uid, snap.data())
        onData({ customer: q.customer, lines: q.lines, extra: q.extra, buildDiscount: q.buildDiscount, byName: q.byName, at: q.at })
      },
      () => {},
    )
  },
  async clearMine(): Promise<void> {
    if (!firestore) return
    const me = getAuth(firestore.app).currentUser
    if (me) await deleteDoc(doc(firestore, 'edits', me.uid)).catch(() => {})
  },
}
