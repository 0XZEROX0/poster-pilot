import { getAuth } from 'firebase/auth'
import { addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
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
  { key: 'keyboard', label: 'Keyboard', cats: ['acc'] },
  { key: 'mouse', label: 'Mouse', cats: ['acc'] },
  { key: 'extra', label: 'Extra', cats: [] },
  { key: 'paste', label: 'Thermalpaste', cats: ['paste'] },
]
export const slotOf = (key: string) => SLOTS.find((s) => s.key === key) ?? SLOTS[SLOTS.length - 2]

/** The rows a new build starts with: one of each, like the sheet. Case fans only when asked for. */
export const START_SLOTS = SLOTS.filter((s) => s.key !== 'fans').map((s) => s.key)

/**
 * One row of a build. The product is remembered by category and id, with a copy of its name and
 * prices from when it was picked, so a quote still reads right if the product is later deleted.
 */
export type Line = { id: string; slot: string; cat?: string; pid?: string; name: string; qty: number; warranty: number | null; alone: number | null; in: number | null }

export type Build = { id?: string; customer: string; sales: string; lines: Line[]; extra: number; buildDiscount: boolean; at?: number; byName?: string }

export const lineId = () => Math.random().toString(36).slice(2, 10)
export const emptyLine = (slot: string): Line => ({ id: lineId(), slot, name: '', qty: 1, warranty: null, alone: null, in: null })
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

export type SavedQuote = Build & { id: string; at: number; byName: string; total: number }

export interface QuoteBackend {
  list(max: number): Promise<SavedQuote[]>
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
  byName: String(d.byName ?? ''),
  total: Number(d.total) || 0,
})

function firestoreQuotes(): QuoteBackend {
  const db = firestore!
  return {
    async list(max) {
      const snap = await getDocs(query(collection(db, 'quotes'), orderBy('at', 'desc'), limit(max)))
      return snap.docs.map((d) => asQuote(d.id, d.data()))
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
      store([{ ...asQuote(id, clean(b)), id, at: Date.now(), byName: 'You', total }, ...list])
      return id
    },
    async remove(id) {
      store(load().filter((q) => q.id !== id))
    },
  }
}

export const quotes: QuoteBackend = firestore ? firestoreQuotes() : localQuotes()
