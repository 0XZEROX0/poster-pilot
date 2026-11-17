import { addDays } from './logic'
import { costAt, costKey, type CostHist, type CostMap } from './costMath'
import type { CostLinks, SavedCosts } from './orderCosts'
import { plainName } from './nameMatch'
import { isManual, priceOf, type Order } from './orders'

// Sales and profit of orders (website and added by hand), for a period. Pure sums; the page reads the orders.
//
// Orders count by the day they were placed (Cairo). Sales are the completed orders' agreed price (the website total
// when none was agreed). Delivery is passed on to the courier, so profit = (sales - delivery) - what the items cost.
// An order whose items do not all have a known cost is left out of the profit (and counted, so the page can say so):
// counting it would show the whole sale as profit. A line's cost is the one saved on the order, else the price list
// cost the product had on the day the order was placed (see lineCosts).

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
  for (const c of cats) for (const it of c.items) if (it.web?.ok && it.web.id) {
    out[`${it.web.id}:${it.web.variation ?? 0}`] = costKey(c.id, it.id)
    // Any option of the same website product: only a suggestion (another colour usually costs about the same).
    if (!out[`${it.web.id}:*`]) out[`${it.web.id}:*`] = costKey(c.id, it.id)
  }
  return out
}

/** Everything needed to say what an order cost: price list costs with their history, website links, and costs saved on orders. */
export type CostCtx = { costs: CostMap; hist: CostHist; web: Record<string, string>; saved: SavedCosts; links?: CostLinks }

/**
 * What one line cost (for one), and where that came from:
 *  - 'order': typed in (or accepted) for this order: exact;
 *  - 'list': the price list cost the product had on the day the order was placed;
 *  - null: not known. `suggest` is then a cost to offer: today's price list cost of the same product (its cost
 *    was typed in after the order) or of another option of the same website product.
 */
export type LineCost = {
  unit: number | null
  from: 'order' | 'list' | null
  suggest: number | null
  /** The price list product the line is (`cat/pid`), and how that is known: from the order or a confirmed website
   * link ('own'), or picked by someone for this line, this website product or this name ('picked'). */
  key?: string
  via?: 'own' | 'picked'
}

/** The price list product a line is, if known. */
export function lineKey(o: Pick<Order, 'id'>, it: Order['items'][number], i: number, ctx: Pick<CostCtx, 'web' | 'saved' | 'links'>): { key: string; via: 'own' | 'picked' } | null {
  const own = it.cat && it.ref ? costKey(it.cat, it.ref) : it.pid ? ctx.web[`${it.pid}:${it.vid}`] : undefined
  if (own) return { key: own, via: 'own' }
  const s = ctx.saved[o.id]?.[i]
  const picked = (s && s.n === it.name && s.k) || (it.pid ? ctx.links?.web[`${it.pid}:${it.vid}`] : undefined) || ctx.links?.names[plainName(it.name)]
  return picked ? { key: picked, via: 'picked' } : null
}

export function lineCosts(o: Pick<Order, 'id' | 'items' | 'placedAt'>, ctx: CostCtx): LineCost[] {
  const saved = ctx.saved[o.id]
  return o.items.map((it, i) => {
    const s = saved?.[i]
    const k = lineKey(o, it, i, ctx)
    const link = k ? { key: k.key, via: k.via } : {}
    if (s && s.c !== null && s.n === it.name) return { unit: s.c, from: 'order', suggest: null, ...link }
    const exact = k?.key
    if (exact && ctx.costs[exact] !== undefined) {
      // Without a history (the demo) the cost counts for every day.
      const steps = ctx.hist[exact]
      const then = steps ? costAt(steps, o.placedAt) : ctx.costs[exact]
      return then !== null ? { unit: then, from: 'list', suggest: null, ...link } : { unit: null, from: null, suggest: ctx.costs[exact], ...link }
    }
    const near = !exact && it.pid ? ctx.web[`${it.pid}:*`] : undefined
    return { unit: null, from: null, suggest: near && ctx.costs[near] !== undefined ? ctx.costs[near] : null, ...link }
  })
}

/** What an order's items cost the shop, and how many lines have no known cost. */
export function orderCost(o: Pick<Order, 'id' | 'items' | 'placedAt'>, ctx: CostCtx): { cost: number; missing: number; lines: LineCost[] } {
  const lines = lineCosts(o, ctx)
  let cost = 0
  let missing = 0
  lines.forEach((l, i) => {
    if (l.unit === null) missing++
    else cost += l.unit * (o.items[i].qty || 1)
  })
  return { cost: Math.round(cost * 100) / 100, missing, lines }
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

export type OrderLine = { o: Order; sale: number; profit: number | null; cost: number | null; lines: LineCost[] | null; missing: number }

type Row = OrderLine & { open: boolean; done: boolean }
function rowsOf(list: Order[], ctx: CostCtx | null): Row[] {
  return list.map((o) => {
    const open = o.status === 'new' || o.status === 'confirmed'
    const done = o.status === 'completed'
    const sale = priceOf(o)
    const c = done && ctx ? orderCost(o, ctx) : null
    const whole = c && !c.missing && o.items.length > 0
    return { o, open, done, sale, profit: whole ? r2(sale - o.shipping - c.cost) : null, cost: whole ? c.cost : null, lines: c?.lines ?? null, missing: c ? (o.items.length ? c.missing : 1) : 0 }
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
export function statsOf(list: Order[], ctx: CostCtx | null) {
  const all = zero(), website = zero(), manual = zero()
  const rows = rowsOf(list, ctx)
  for (const r of rows) { add(all, r); add(isManual(r.o) ? manual : website, r) }
  const lines: OrderLine[] = rows.filter((r) => r.done).map(({ o, sale, profit, cost, lines: l, missing }) => ({ o, sale, profit, cost, lines: l, missing }))
  lines.sort((a, b) => b.o.placedAt - a.o.placedAt)
  return { all: finish(all), website: finish(website), manual: finish(manual), lines }
}

/** Sums by any key (sales rep, category, where the order came from), biggest sales first. Empty keys count as "". */
export function sumsBy(list: Order[], ctx: CostCtx | null, key: (o: Order) => string): [string, Sums][] {
  const m = new Map<string, Sums>()
  for (const r of rowsOf(list, ctx)) {
    const k = key(r.o).trim()
    if (!m.has(k)) m.set(k, zero())
    add(m.get(k)!, r)
  }
  return [...m.entries()].map(([k, s]) => [k, finish(s)] as [string, Sums]).sort((a, b) => b[1].sales - a[1].sales || b[1].orders - a[1].orders)
}
