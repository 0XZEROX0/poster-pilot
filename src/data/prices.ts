import { getAuth } from 'firebase/auth'
import { collection, deleteField, doc, getDocs, increment, limit, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch, type DocumentData, type Firestore } from 'firebase/firestore'
import { useEffect, useSyncExternalStore } from 'react'
import { firestore } from './firebase'

// The price list, kept in the app's database only (no sheet). Firestore layout:
//   prices/{category}  { name, order, items: { [productId]: PriceItem without id } }   one document per category
//   prices/_meta       { version, at }   version goes up with every change, so the engine (n8n) reads one
//                                        document to know whether anything changed
//   priceLog/{auto}    { cat, pid, name, changes: [{ f, from, to }], act, at, by, byName }   never changed or removed
//
// One document per category keeps the whole list at about 15 reads, and a change to one product touches only
// that product's fields, so two people editing the same category do not overwrite each other.

export type PriceItem = {
  id: string
  name: string
  /** The price when the part goes into a build (sheet: In / داخل تجميعة). */
  in: number | null
  /** The price when it is sold on its own (sheet: Out / Alone / خارج تجميعة). Posters and offers use this one. */
  alone: number | null
  /** Years. */
  warranty: number | null
  company: string
  /** A heading in the sheet the product was listed under, such as "AIR" for coolers. */
  group?: string
  /** What the builder checks: socket (CPU, MB), memory (MB, RAM: DDR4/DDR5), size (SSD). */
  specs?: Record<string, string>
  /** Not shown in the builder or the pickers, for example while out of stock. */
  hidden?: boolean
  /** Last change: when, and by whom. */
  at?: number
  byName?: string
}

export type PriceCategory = { id: string; name: string; order: number; items: PriceItem[] }

export type FieldChange = { f: string; from: string; to: string }
export type PriceChange = { id: string; cat: string; pid: string; name: string; act: 'edit' | 'add' | 'remove' | 'bulk'; changes: FieldChange[]; at: number; by: string; byName: string }

/** What can be changed on a product. */
export type ItemPatch = Partial<Omit<PriceItem, 'id' | 'at' | 'byName'>>

/** Which spec fields each category has. The builder uses socket and memory to check that parts fit. */
export const SPEC_FIELDS: Record<string, string[]> = { cpu: ['socket'], mb: ['socket', 'memory'], ram: ['memory'], ssd: ['size'] }
export const SPEC_LABEL: Record<string, string> = { socket: 'Socket', memory: 'Memory', size: 'Size' }

const FIELD_LABEL: Record<string, string> = { in: 'In build', alone: 'Alone', warranty: 'Warranty', name: 'Name', company: 'Company', group: 'Group', hidden: 'Hidden', specs: 'Specs' }
export const fieldLabel = (f: string) => FIELD_LABEL[f] ?? SPEC_LABEL[f.replace(/^specs\./, '')] ?? f

/** "5,500", or a dash when there is no price. Western digits in both languages, like the price list. */
export const money = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? '—' : n.toLocaleString('en-US'))

/** A number typed by a person: "5,500", "5500 ", "٥٥٠٠" all work. Empty means no price. Undefined means not a number. */
export function parseMoney(text: string): number | null | undefined {
  const s = text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,\s]/g, '')
  if (s === '') return null
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined
  return Number(s)
}

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Every word typed must be in the name, company or specs, in any order: "b850 asus" finds "Asus Prime B850M-K". */
export function matches(item: PriceItem, search: string): boolean {
  const words = fold(search).split(' ').filter(Boolean)
  if (!words.length) return true
  const hay = fold([item.name, item.company, item.group ?? '', ...Object.values(item.specs ?? {})].join(' '))
  return words.every((w) => hay.includes(w))
}

const show = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'number' ? money(v) : String(v))

/** The fields that really change, as history lines. */
export function diff(before: PriceItem | null, patch: ItemPatch): FieldChange[] {
  const out: FieldChange[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'specs') {
      const was = before?.specs ?? {}
      for (const [sk, sv] of Object.entries((v as Record<string, string>) ?? {})) if ((was[sk] ?? '') !== sv) out.push({ f: `specs.${sk}`, from: was[sk] ?? '', to: sv })
      continue
    }
    const was = before ? (before as Record<string, unknown>)[k] : undefined
    if (show(was) !== show(v)) out.push({ f: k, from: show(was), to: show(v) })
  }
  return out
}

/** Rounds to the nearest step (1, 10, 50, 100). */
export const roundTo = (n: number, step: number) => Math.round(n / step) * step

/** A bulk change: every product of a category up or down by a percent, rounded. Products without that price are left alone. */
export function bulkPatches(items: PriceItem[], percent: number, which: 'both' | 'in' | 'alone', step: number): { item: PriceItem; patch: ItemPatch }[] {
  const out: { item: PriceItem; patch: ItemPatch }[] = []
  const f = 1 + percent / 100
  for (const item of items) {
    const patch: ItemPatch = {}
    if (which !== 'alone' && item.in !== null) patch.in = roundTo(item.in * f, step)
    if (which !== 'in' && item.alone !== null) patch.alone = roundTo(item.alone * f, step)
    if (diff(item, patch).length) out.push({ item, patch })
  }
  return out
}

/** A short id for a new product: safe as a Firestore field name. */
export const newProductId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

const num = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : null)
const millis = (v: unknown) => (typeof v === 'number' ? v : (v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0)

/** A category document as the app uses it. Products keep the order they had in the sheet (`n`), new ones go last. */
export function categoryOf(id: string, d: DocumentData): PriceCategory {
  const raw = (d.items ?? {}) as Record<string, DocumentData>
  const items = Object.entries(raw)
    .filter(([, v]) => v && typeof v === 'object')
    .map(([pid, v]) => ({ n: typeof v.n === 'number' ? v.n : Number.MAX_SAFE_INTEGER, at: millis(v.at), item: { id: pid, name: String(v.name ?? ''), in: num(v.in), alone: num(v.alone), warranty: num(v.warranty), company: String(v.company ?? ''), group: v.group ? String(v.group) : undefined, specs: v.specs ?? undefined, hidden: v.hidden === true || undefined, at: millis(v.at) || undefined, byName: v.byName || undefined } as PriceItem }))
    .sort((a, b) => a.n - b.n || a.at - b.at || a.item.name.localeCompare(b.item.name))
    .map((x) => x.item)
  return { id, name: String(d.name ?? id), order: typeof d.order === 'number' ? d.order : 99, items }
}

export interface PriceBackend {
  watch(onData: (cats: PriceCategory[]) => void, onError: (message: string) => void): () => void
  /** A new product when `before` is null. */
  save(cat: string, id: string, patch: ItemPatch, before: PriceItem | null): Promise<void>
  remove(cat: string, item: PriceItem): Promise<void>
  bulk(cat: string, list: { item: PriceItem; patch: ItemPatch }[]): Promise<void>
  /** The latest changes, newest first: all of them, or one product's. */
  history(max: number, product?: { cat: string; pid: string }): Promise<PriceChange[]>
}

function firestorePrices(db: Firestore): PriceBackend {
  const me = () => getAuth(db.app).currentUser
  const who = () => ({ by: me()?.uid ?? '', byName: me()?.displayName || me()?.email || '' })
  const fieldsFor = (id: string, patch: ItemPatch, byName: string): Record<string, unknown> => {
    const out: Record<string, unknown> = { [`items.${id}.at`]: serverTimestamp(), [`items.${id}.byName`]: byName }
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'specs') for (const [sk, sv] of Object.entries((v as Record<string, string>) ?? {})) out[`items.${id}.specs.${sk}`] = sv
      else out[`items.${id}.${k}`] = v === undefined ? deleteField() : v
    }
    return out
  }
  /** Writes the changes, a history line for each product and the new version number, all or nothing. Big lists go in parts. */
  const commit = async (cat: string, rows: { id: string; name: string; act: PriceChange['act']; changes: FieldChange[]; fields: Record<string, unknown> }[]) => {
    const { by, byName } = who()
    for (let i = 0; i < rows.length; i += 200) {
      const part = rows.slice(i, i + 200)
      const batch = writeBatch(db)
      batch.update(doc(db, 'prices', cat), Object.assign({}, ...part.map((r) => r.fields)))
      for (const r of part) batch.set(doc(collection(db, 'priceLog')), { cat, pid: r.id, name: r.name, act: r.act, changes: r.changes.slice(0, 12), at: serverTimestamp(), by, byName })
      batch.set(doc(db, 'prices', '_meta'), { version: increment(1), at: serverTimestamp() }, { merge: true })
      await batch.commit()
    }
  }
  return {
    watch(onData, onError) {
      return onSnapshot(
        collection(db, 'prices'),
        (snap) => onData(snap.docs.filter((d) => d.id !== '_meta').map((d) => categoryOf(d.id, d.data())).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))),
        (e) => onError(e.message),
      )
    },
    async save(cat, id, patch, before) {
      const changes = diff(before, patch)
      if (!changes.length) return
      const { byName } = who()
      const fields = before
        ? fieldsFor(id, patch, byName)
        : { [`items.${id}`]: { ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), at: serverTimestamp(), byName } }
      await commit(cat, [{ id, name: patch.name ?? before?.name ?? '', act: before ? 'edit' : 'add', changes, fields }])
    },
    async remove(cat, item) {
      await commit(cat, [{ id: item.id, name: item.name, act: 'remove', changes: [{ f: 'name', from: item.name, to: '' }], fields: { [`items.${item.id}`]: deleteField() } }])
    },
    async bulk(cat, list) {
      const { byName } = who()
      await commit(cat, list.map(({ item, patch }) => ({ id: item.id, name: item.name, act: 'bulk' as const, changes: diff(item, patch), fields: fieldsFor(item.id, patch, byName) })))
    },
    async history(max, product) {
      const q = product
        ? query(collection(db, 'priceLog'), where('cat', '==', product.cat), where('pid', '==', product.pid), orderBy('at', 'desc'), limit(max))
        : query(collection(db, 'priceLog'), orderBy('at', 'desc'), limit(max))
      const snap = await getDocs(q)
      return snap.docs.map((d) => ({ ...(d.data() as Omit<PriceChange, 'id' | 'at'>), id: d.id, at: millis(d.data().at) || Date.now() }))
    },
  }
}

const DEMO_KEY = 'posterpilot.demo.prices.v1'
const DEMO_LOG_KEY = 'posterpilot.demo.priceLog.v1'

/** A few products from each kind, so the demo shows how the page works. */
export function demoPrices(): PriceCategory[] {
  let n = 0
  const P = (name: string, inb: number | null, alone: number | null, warranty: number | null, company: string, specs?: Record<string, string>, group?: string): PriceItem => ({ id: `d${++n}`, name, in: inb, alone, warranty, company, specs, group })
  return [
    { id: 'cpu', name: 'CPU', order: 1, items: [P('Intel Core I5-14400F tray', 7800, 8000, 1, 'Intel', { socket: 'LGA1700' }), P('Intel Core I5-12400F Box', 7400, 7400, 1, 'Intel', { socket: 'LGA1700' }), P('Intel Core Ultra 5 225F Box', 8000, 8000, 3, 'Intel', { socket: 'LGA1851' }), P('AMD Ryzen 5 7600X Tray', 8000, 9000, 1, 'AMD', { socket: 'AM5' }), P('AMD Ryzen 7 7800X3D tray', 17500, 18000, 1, 'AMD', { socket: 'AM5' }), P('AMD Ryzen 5 5600 Tray', 4300, 4500, 1, 'AMD', { socket: 'AM4' })] },
    { id: 'mb', name: 'Motherboard', order: 2, items: [P('ASUS PRIME B550M-A', 4900, 4900, 3, 'Asus Prime', { socket: 'AM4', memory: 'DDR4' }), P('Asus Prime B850M-F', 5500, 5700, 3, 'Asus Prime', { socket: 'AM5', memory: 'DDR5' }), P('Asus Prime B850M-K', 5500, 5500, 3, 'Asus Prime', { socket: 'AM5', memory: 'DDR5' }), P('Gigabyte B760M DS3H DDR4', 5200, 5400, 3, 'Gigabyte', { socket: 'LGA1700', memory: 'DDR4' })] },
    { id: 'ram', name: 'RAM', order: 3, items: [P('Lexar DDR4 8GB 3200Mhz CL22', 3000, 3500, 1, 'Lexar', { memory: 'DDR4' }), P('Patriot Viper Steel 16GB 3200Mhz CL16', 7000, 8000, 3, 'Patriot', { memory: 'DDR4' }), P('Twinmos Volt X 16GB 6000Mhz CL36 Black', 14500, 14500, 1, 'Twinmos', { memory: 'DDR5' })] },
    { id: 'vga', name: 'Graphics card', order: 4, items: [P('ASUS Dual RX 7600 8GB OC', 21000, 21000, 3, 'Asus'), P('ASUS Dual RTX 5060 OC Edition 8GB', 29000, 30000, 3, 'Asus'), P('Gigabyte GeForce RTX 5070 GAMING OC 12G', 47500, 49500, 3, 'Gigabyte')] },
    { id: 'ssd', name: 'SSD / HDD', order: 5, items: [P('Hiksemi NVMe 256GB', 2500, 2800, 1, 'HikSemi', { size: '256GB' }), P('HIKSEMI Wave 512GB NVMe M.2 SSD', 3800, 4100, 1, 'HikSemi', { size: '512GB' }), P('WD Blue SN5000 NVMe 1TB Gen4', 7450, 7500, 3, 'Western Digital', { size: '1TB' })] },
    { id: 'cooler', name: 'Cooler', order: 8, items: [P('Thermalright Assassin X 120 Refined SE ARGB Black', 1250, 1250, 3, 'Thermalright', undefined, 'AIR'), P('Darkflash C400 ARGB, Single Tower, 4 Heat Pipes - Black', 800, 800, 1, 'Darkflash', undefined, 'AIR')] },
    { id: 'monitor', name: 'Monitor', order: 10, items: [P('MSI PRO MP276E18 27″ FHD IPS 180Hz 1ms', 6000, 6000, 2, 'MSI'), P('MSI MAG 276QE27 27" WQHD IPS 275Hz 0.5MS', 11500, 11500, 3, 'MSI')] },
  ]
}

function localPrices(): PriceBackend {
  const load = <T,>(key: string, fallback: () => T): T => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback()
    } catch {
      return fallback()
    }
  }
  let cats = load(DEMO_KEY, demoPrices)
  let log = load<PriceChange[]>(DEMO_LOG_KEY, () => [])
  const listeners = new Set<(c: PriceCategory[]) => void>()
  const persist = () => {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(cats))
      localStorage.setItem(DEMO_LOG_KEY, JSON.stringify(log))
    } catch {
      // The demo then lasts until the page is closed.
    }
    listeners.forEach((l) => l(cats))
  }
  const note = (cat: string, item: PriceItem, act: PriceChange['act'], changes: FieldChange[]) => {
    log = [{ id: `l${Date.now()}${Math.random().toString(36).slice(2, 6)}`, cat, pid: item.id, name: item.name, act, changes, at: Date.now(), by: 'demo-you', byName: 'You' }, ...log].slice(0, 300)
  }
  const apply = (item: PriceItem, patch: ItemPatch): PriceItem => ({ ...item, ...patch, specs: patch.specs ? { ...item.specs, ...patch.specs } : item.specs, at: Date.now(), byName: 'You' })
  const edit = (cat: string, fn: (items: PriceItem[]) => PriceItem[]) => {
    cats = cats.map((c) => (c.id === cat ? { ...c, items: fn(c.items) } : c))
  }
  return {
    watch(onData) {
      listeners.add(onData)
      onData(cats)
      return () => listeners.delete(onData)
    },
    async save(cat, id, patch, before) {
      const changes = diff(before, patch)
      if (!changes.length) return
      if (before) edit(cat, (items) => items.map((i) => (i.id === id ? apply(i, patch) : i)))
      else edit(cat, (items) => [...items, apply({ id, name: '', in: null, alone: null, warranty: null, company: '' }, patch)])
      note(cat, { ...(before ?? ({ id } as PriceItem)), name: patch.name ?? before?.name ?? '' }, before ? 'edit' : 'add', changes)
      persist()
    },
    async remove(cat, item) {
      edit(cat, (items) => items.filter((i) => i.id !== item.id))
      note(cat, item, 'remove', [{ f: 'name', from: item.name, to: '' }])
      persist()
    },
    async bulk(cat, list) {
      const byId = new Map(list.map((x) => [x.item.id, x.patch]))
      edit(cat, (items) => items.map((i) => (byId.has(i.id) ? apply(i, byId.get(i.id)!) : i)))
      for (const { item, patch } of list) note(cat, item, 'bulk', diff(item, patch))
      persist()
    },
    async history(max, product) {
      return log.filter((l) => !product || (l.cat === product.cat && l.pid === product.pid)).slice(0, max)
    },
  }
}

export const prices: PriceBackend = firestore ? firestorePrices(firestore) : localPrices()


// One live listener for the whole app, kept while any screen that shows prices is open.
type PriceState = { loaded: boolean; cats: PriceCategory[]; error: string }
let state: PriceState = { loaded: false, cats: [], error: '' }
const listeners = new Set<() => void>()
let users = 0
let stop: (() => void) | null = null
let stopTimer: ReturnType<typeof setTimeout> | undefined
const set = (patch: Partial<PriceState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function hold() {
  users++
  clearTimeout(stopTimer)
  if (!stop) stop = prices.watch((cats) => set({ cats, loaded: true, error: '' }), (error) => set({ error, loaded: true }))
  return () => {
    users--
    // Switching between pages should not start the listener again (that would read every category again).
    if (users === 0) stopTimer = setTimeout(() => { stop?.(); stop = null }, 5 * 60_000)
  }
}

/** The price list, live, while the calling screen is open. */
export function usePrices(): PriceState {
  useEffect(hold, [])
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state)
}
