import { getAuth } from 'firebase/auth'
import { collection, deleteField, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch, type DocumentData, type Firestore } from 'firebase/firestore'
import { useEffect, useSyncExternalStore } from 'react'
import { firestore } from './firebase'
import { nudgeEngine } from './nudge'

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
  /** The price on the website (static-eg.com). Separate from the shop prices; empty means not set yet. */
  online?: number | null
  /** The sale price on the website. Empty means the product is not on sale there. */
  onlineSale?: number | null
  /** Years. */
  warranty: number | null
  company: string
  /** A heading in the sheet the product was listed under, such as "AIR" for coolers. */
  group?: string
  /** What the builder checks: socket (CPU, MB), memory (MB, RAM: DDR4/DDR5), size (SSD). */
  specs?: Record<string, string>
  /** Not shown in the builder or the pickers. */
  hidden?: boolean
  /** Out of stock. Information for now; the builder, offers and a website can use it later. Absent means in stock. */
  out?: boolean
  /** The product on static-eg.com this one is linked to. Only a confirmed link (ok) is kept in step with the website. */
  web?: WebLink
  /** Last change: when, and by whom. */
  at?: number
  byName?: string
}

/**
 * A link to a website product. The engine suggests links (ok: false) by name; a person confirms or changes them.
 * price, sale and stock are what the website had when the engine last looked or sent a change.
 */
export type WebLink = {
  id: number
  name: string
  ok: boolean
  url?: string
  /** simple, or variable for a product with options (colour, Tray/Box). */
  type?: string
  /** How sure the name match was, 0-100 (suggested links only). */
  score?: number
  price?: number | null
  sale?: number | null
  stock?: string
  /** Set by the engine: when the last change reached the website, and the last error. */
  sentAt?: string
  error?: string
  /** A name the website product should get (chosen in the app). Sent like a price change; gone once the website has it. */
  rename?: string
  /** For a website product with options (Box/Tray, colours): the option this app product is, by id and by name. */
  variation?: number
  option?: string
  /** Set by the engine: when it last tried to send. */
  triedAt?: string
}

/** One product of static-eg.com, from web/products (refreshed by the engine). */
export type WebOption = { id: number; name: string; price: number | null; sale: number | null; stock: string }
export type WebProduct = { id: number; name: string; price: number | null; sale: number | null; stock: string; type: string; url: string; options?: WebOption[] }

/** A linked website product with options whose option is not chosen yet (nothing can be sent for it). */
export const webNeedsOption = (item: PriceItem) => Boolean(item.web && item.web.type === 'variable' && !item.web.variation)

/** What a linked product still has to send to the website. Empty when it is in step (or not confirmed). */
export function webPending(item: PriceItem, evenIfNotConfirmed = false): string[] {
  const w = item.web
  if (!w || (!w.ok && !evenIfNotConfirmed)) return []
  const out: string[] = []
  if (item.online !== undefined && item.online !== null && item.online !== (w.price ?? null)) out.push('price')
  if ((item.onlineSale ?? null) !== (w.sale ?? null)) out.push('sale')
  if (w.stock && (item.out ? 'outofstock' : 'instock') !== (w.stock === 'outofstock' ? 'outofstock' : 'instock')) out.push('stock')
  if (w.rename && !sameName(w.rename, w.name)) out.push('name')
  return out
}

const normName = (s: string) => s.replace(/\s+/g, ' ').trim()
/** Two product names are the same when only spaces differ. */
export const sameName = (a: string, b: string) => normName(a) === normName(b)

/**
 * The name the linked website product has (or will have, once a chosen name is sent), when it is not the app's name.
 * Not for a website product with options: its name is shared by several app products ("… Tray", "… Box").
 */
export function webNameDiff(item: PriceItem): string | null {
  const w = item.web
  if (!w || w.type === 'variable') return null
  const there = w.rename || w.name
  return there && !sameName(there, item.name) ? there : null
}

export type PriceCategory = { id: string; name: string; order: number; items: PriceItem[] }

export type FieldChange = { f: string; from: string; to: string }
export type PriceChange = { id: string; cat: string; pid: string; name: string; act: 'edit' | 'add' | 'remove' | 'bulk'; changes: FieldChange[]; at: number; by: string; byName: string }

/** What can be changed on a product. */
export type ItemPatch = Partial<Omit<PriceItem, 'id' | 'at' | 'byName'>>

/** Which spec fields each category has. The builder uses socket and memory to check that parts fit. */
export const SPEC_FIELDS: Record<string, string[]> = { cpu: ['socket'], mb: ['socket', 'memory'], ram: ['memory'], ssd: ['size'], case: ['psu'] }
export const SPEC_LABEL: Record<string, string> = { socket: 'Socket', memory: 'Memory', size: 'Size', psu: 'Power supply in the box' }

const NO = /^(no|none|-|—|لا)$/i

/**
 * The power supply a case comes with, such as "750W" (or "Yes" when the wattage is unknown), or '' when it has none.
 * "Power supply in the box" on the Prices page wins ("No" means none); when it is empty, the name tells:
 * "Xigmatek Osiris II + Valkyrie 750W" or "Darkflash K430 + GS750 ... PSU".
 */
export function casePsu(item: PriceItem | undefined): string {
  if (!item) return ''
  const set = (item.specs?.psu ?? '').trim()
  if (set) return NO.test(set) ? '' : set
  const name = item.name
  const watt = name.match(/\+.*?\b(\d{3,4})\s*W\b/i)?.[1] ?? (/\bPSU\b/i.test(name) ? name.match(/\+\s*[A-Za-z]{0,4}(\d{3,4})\b/)?.[1] : undefined)
  if (watt) return `${watt}W`
  return /\+.*\bPSU\b/i.test(name) ? 'Yes' : ''
}

/** The specs to show as chips: "AM5", "DDR5", "PSU 750W". */
export const specChips = (item: PriceItem): string[] =>
  Object.entries(item.specs ?? {}).flatMap(([k, v]) => (!v ? [] : k === 'psu' ? (NO.test(v) ? [] : [`PSU ${v}`]) : [v]))

const FIELD_LABEL: Record<string, string> = { in: 'In build', alone: 'Alone', online: 'Online', onlineSale: 'Online sale', web: 'Website product', warranty: 'Warranty', name: 'Name', company: 'Company', group: 'Group', hidden: 'Hidden', out: 'Stock', specs: 'Specs' }
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
    if (k === 'web') {
      const a = was as WebLink | undefined, b = v as WebLink | undefined
      const label = (w?: WebLink) => (w ? `${w.rename || w.name}${w.option ? ` (${w.option})` : ''}${w.ok ? ' ✓' : ''}` : '')
      if (label(a) !== label(b)) out.push({ f: k, from: label(a), to: label(b) })
      continue
    }
    if (k === 'out') {
      if (Boolean(was) !== Boolean(v)) out.push({ f: k, from: was ? 'Out of stock' : 'In stock', to: v ? 'Out of stock' : 'In stock' })
      continue
    }
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
const webOf = (v: unknown): WebLink | undefined => {
  const w = v as Record<string, unknown> | null | undefined
  if (!w || typeof w !== 'object' || typeof w.id !== 'number') return undefined
  return { id: w.id, name: String(w.name ?? ''), ok: w.ok === true, url: w.url ? String(w.url) : undefined, type: w.type ? String(w.type) : undefined, score: typeof w.score === 'number' ? w.score : undefined, price: num(w.price), sale: num(w.sale), stock: w.stock ? String(w.stock) : undefined, sentAt: w.sentAt ? String(w.sentAt) : undefined, error: w.error ? String(w.error) : undefined, rename: w.rename ? String(w.rename) : undefined, variation: typeof w.variation === 'number' ? w.variation : undefined, option: w.option ? String(w.option) : undefined, triedAt: w.triedAt ? String(w.triedAt) : undefined }
}

/** Every product on the website, for picking a link by hand. Read once when asked (one document). */
export async function loadWebProducts(): Promise<WebProduct[]> {
  if (!firestore) return [
    { id: 1, name: 'Intel Core i5-14400F Box', price: 8500, sale: 7999, stock: 'instock', type: 'simple', url: '' },
    { id: 2, name: 'AMD Ryzen 5 7600X Tray', price: 9500, sale: null, stock: 'outofstock', type: 'simple', url: '' },
    { id: 3, name: 'AMD Ryzen 5 7600X Box', price: null, sale: null, stock: 'instock', type: 'variable', url: '', options: [{ id: 31, name: 'Box', price: 9500, sale: null, stock: 'outofstock' }, { id: 32, name: 'Tray', price: 9500, sale: 8999, stock: 'instock' }] },
  ]
  const snap = await getDoc(doc(firestore, 'web', 'products'))
  const items = (snap.data()?.items ?? {}) as Record<string, Record<string, unknown>>
  const optionsOf = (o: unknown): WebOption[] | undefined => (Array.isArray(o) ? o.map((x: Record<string, unknown>) => ({ id: Number(x.i), name: String(x.n ?? ''), price: num(x.p), sale: num(x.s), stock: String(x.st ?? '') })) : undefined)
  return Object.entries(items).map(([id, v]) => ({ id: Number(id), name: String(v.n ?? ''), price: num(v.p), sale: num(v.s), stock: String(v.st ?? ''), type: String(v.t ?? 'simple'), url: String(v.u ?? ''), options: optionsOf(v.o) })).sort((a, b) => a.name.localeCompare(b.name))
}

const millis = (v: unknown) => (typeof v === 'number' ? v : (v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0)

/** A category document as the app uses it. Products keep the order they had in the sheet (`n`), new ones go last. */
export function categoryOf(id: string, d: DocumentData): PriceCategory {
  const raw = (d.items ?? {}) as Record<string, DocumentData>
  const items = Object.entries(raw)
    .filter(([, v]) => v && typeof v === 'object')
    .map(([pid, v]) => ({ n: typeof v.n === 'number' ? v.n : Number.MAX_SAFE_INTEGER, at: millis(v.at), item: { id: pid, name: String(v.name ?? ''), in: num(v.in), alone: num(v.alone), online: num(v.online) ?? undefined, onlineSale: num(v.onlineSale) ?? undefined, web: webOf(v.web), warranty: num(v.warranty), company: String(v.company ?? ''), group: v.group ? String(v.group) : undefined, specs: v.specs ?? undefined, hidden: v.hidden === true || undefined, out: v.out === true || undefined, at: millis(v.at) || undefined, byName: v.byName || undefined } as PriceItem }))
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
    // The product list, the prices of open posts and the website follow at once, not at their next timed check.
    nudgeEngine(getAuth(db.app), ['lists', 'website'])
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
    { id: 'case', name: 'Case', order: 6, items: [P('Xigmatek Osiris II 4 Fan ARGB', 3000, 3000, 1, 'Xigmatek'), P('Xigmatek Osiris II 4 Fan ARGB + Valkyrie 750W ATX3.1 80+ Bronze', 4500, 4500, 1, 'Xigmatek'), P('AeroCool P500C ARGB + 600W 80+', 4500, 4500, 1, 'AeroCool')] },
    { id: 'psu', name: 'Power supply', order: 7, items: [P('Xigmatek Valkyrie 750W 80+ Bronze', 2600, 2700, 3, 'Xigmatek'), P('MSI MAG A650BN 650W 80+ Bronze', 2400, 2500, 3, 'MSI')] },
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
