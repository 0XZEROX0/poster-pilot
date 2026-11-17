import { addDays } from './logic'
import { costKey, type CostMap } from './costMath'
import { isManual, priceOf, type Order } from './orders'

// Sales and profit of orders (website and added by hand), for a period. Pure sums; the page reads the orders.
//
// Orders count by the day they were placed (Cairo). Sales are the completed orders' agreed price (the website total
// when none was agreed). Delivery is passed on to the courier, so profit = (sales - delivery) - what the items cost.
// An order whose items do not all have a cost is left out of the profit (and counted, so the page can say so).

export const PERIODS = ['today', 'yesterday', 'week', 'month', 'lastmonth', 'custom'] as const
export type Period = (typeof PERIODS)[number]
export const PERIOD_LABEL: Record<Period, string> = { today: 'Today', yesterday: 'Yesterday', week: 'Last 7 days', month: 'This month', lastmonth: 'Last month', custom: 'Pick dates' }

/** Minutes Cairo is ahead of UTC at a moment (2 or 3 hours, with summer time). */
function cairoOffset(ms: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(ms / 60000) * 60000) / 60000)
}
/** The moment a Cairo day (YYYY-MM-DD) starts. */
export function cairoStart(date: string): number {
  const guess = Date.parse(`${date}T00:00:00Z`)
  return guess - cairoOffset(guess - 3 * 3600_000) * 60000
}

/** The days a period covers: from (inclusive) to (inclusive), Cairo dates. */
export function periodDays(p: Period, today: string, from = '', to = ''): { from: string; to: string } {
  const month = today.slice(0, 7)
  if (p === 'today') return { from: today, to: today }
  if (p === 'yesterday') { const y = addDays(today, -1); return { from: y, to: y } }
  if (p === 'week') return { from: addDays(today, -6), to: today }
  if (p === 'month') return { from: `${month}-01`, to: today }
  if (p === 'lastmonth') {
    const last = addDays(`${month}-01`, -1)
    return { from: `${last.slice(0, 7)}-01`, to: last }
  }
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
  const a = ok(from) ? from : today
  const b = ok(to) ? to : a
  return a <= b ? { from: a, to: b } : { from: b, to: a }
}
/** The same days as moments: [start, end). */
export const periodRange = (days: { from: string; to: string }) => ({ from: cairoStart(days.from), to: cairoStart(addDays(days.to, 1)) })

/** Website product (and option) -> price list product, from the confirmed website links: `${websiteId}:${optionId}` -> `${cat}/${pid}`. */
export function webIndex(cats: { id: string; items: { id: string; web?: { id: number; ok: boolean; variation?: number } }[] }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of cats) for (const it of c.items) if (it.web?.ok && it.web.id) out[`${it.web.id}:${it.web.variation ?? 0}`] = costKey(c.id, it.id)
  return out
}

/** What an order's items cost the shop, and how many lines have no cost (or no price list product). */
export function orderCost(o: Pick<Order, 'items'>, costs: CostMap, web: Record<string, string>): { cost: number; missing: number } {
  let cost = 0
  let missing = 0
  for (const it of o.items) {
    const key = it.cat && it.ref ? costKey(it.cat, it.ref) : web[`${it.pid}:${it.vid}`]
    const c = key ? costs[key] : undefined
    if (c === undefined) missing++
    else cost += c * (it.qty || 1)
  }
  return { cost: Math.round(cost * 100) / 100, missing }
}

export type Sums = {
  /** Orders placed in the period. */
  orders: number
  completed: number
  cancelled: number
  /** Still new or confirmed, and what they are worth. */
  open: number
  openValue: number
  /** Completed orders: what customers paid in all, the delivery part of it, and the average order. */
  sales: number
  delivery: number
  average: number
  /** Profit of the completed orders whose items all have a cost, how many those are, and how many were left out. */
  profit: number
  costed: number
  uncosted: number
}
const zero = (): Sums => ({ orders: 0, completed: 0, cancelled: 0, open: 0, openValue: 0, sales: 0, delivery: 0, average: 0, profit: 0, costed: 0, uncosted: 0 })
const r2 = (n: number) => Math.round(n * 100) / 100

export type OrderLine = { o: Order; sale: number; profit: number | null }

type Row = { o: Order; open: boolean; done: boolean; sale: number; profit: number | null }
function rowsOf(list: Order[], costs: CostMap | null, web: Record<string, string>): Row[] {
  return list.map((o) => {
    const open = o.status === 'new' || o.status === 'confirmed'
    const done = o.status === 'completed'
    const sale = priceOf(o)
    const c = done && costs ? orderCost(o, costs, web) : null
    return { o, open, done, sale, profit: c && !c.missing ? r2(sale - o.shipping - c.cost) : null }
  })
}
function add(s: Sums, r: Row) {
  s.orders++
  if (r.open) { s.open++; s.openValue += r.sale; return }
  if (!r.done) { s.cancelled++; return }
  s.completed++
  s.sales += r.sale
  s.delivery += r.o.shipping
  if (r.profit === null) s.uncosted++
  else { s.costed++; s.profit += r.profit }
}
function finish(s: Sums) {
  s.sales = r2(s.sales); s.delivery = r2(s.delivery); s.openValue = r2(s.openValue); s.profit = r2(s.profit)
  s.average = s.completed ? Math.round(s.sales / s.completed) : 0
  return s
}

/** Sums for all orders, website ones and ones added by hand; plus each completed order with its profit. */
export function statsOf(list: Order[], costs: CostMap | null, web: Record<string, string>) {
  const all = zero(), website = zero(), manual = zero()
  const rows = rowsOf(list, costs, web)
  for (const r of rows) { add(all, r); add(isManual(r.o) ? manual : website, r) }
  const lines: OrderLine[] = rows.filter((r) => r.done).map(({ o, sale, profit }) => ({ o, sale, profit }))
  lines.sort((a, b) => b.o.placedAt - a.o.placedAt)
  return { all: finish(all), website: finish(website), manual: finish(manual), lines }
}

/** Sums by any key (sales rep, category, where the order came from), biggest sales first. Empty keys count as "". */
export function sumsBy(list: Order[], costs: CostMap | null, web: Record<string, string>, key: (o: Order) => string): [string, Sums][] {
  const m = new Map<string, Sums>()
  for (const r of rowsOf(list, costs, web)) {
    const k = key(r.o).trim()
    if (!m.has(k)) m.set(k, zero())
    add(m.get(k)!, r)
  }
  return [...m.entries()].map(([k, s]) => [k, finish(s)] as [string, Sums]).sort((a, b) => b[1].sales - a[1].sales || b[1].orders - a[1].orders)
}
