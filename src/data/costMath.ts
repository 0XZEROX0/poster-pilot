import type { DocumentData } from 'firebase/firestore'
import { money } from './prices'

// The sums behind cost and profit (see costs.ts for where cost is kept and who may read it).

/** Costs by `${category}/${productId}`. */
export type CostMap = Record<string, number>
export const costKey = (cat: string, pid: string) => `${cat}/${pid}`

/** Profit and margin of a selling price over a cost, or null when either is missing. */
export function profitOf(price: number | null | undefined, cost: number | null | undefined) {
  if (price == null || cost == null) return null
  const profit = price - cost
  return { profit, percent: price > 0 ? Math.round((profit / price) * 1000) / 10 : 0 }
}
/**
 * The lowest of a product's prices (In build, Alone, and the website's Price before and Price after), and
 * which one it is. Empty prices are left out. Profit in the price list is worked out from this one, so it
 * shows the least the shop makes on the product. `web: false` leaves the website prices out (for someone
 * who may not see them).
 */
export function lowestPrice(p: { in?: number | null; alone?: number | null; online?: number | null; onlineSale?: number | null }, web = true): { price: number; label: string } | null {
  const all: [string, number | null | undefined][] = [['In build', p.in], ['Alone', p.alone], ...(web ? ([['Price before', p.online], ['Price after', p.onlineSale]] as [string, number | null | undefined][]) : [])]
  let best: { price: number; label: string } | null = null
  for (const [label, v] of all) if (typeof v === 'number' && v > 0 && (!best || v < best.price)) best = { price: v, label }
  return best
}

export const profitText = (p: ReturnType<typeof profitOf>) => (p ? `${money(p.profit)} (${p.percent}%)` : '—')

const num = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : null)

/**
 * When each cost started, oldest first: `${category}/${productId}` -> [{ at, cost }]. A cost counts from its `at`
 * until the next one, so an order is worked out with what the product cost on the day it was placed. Costs saved
 * before this history was kept have one entry: the cost from the day it was typed in.
 */
export type CostStep = { at: number; cost: number }
export type CostHist = Record<string, CostStep[]>
const millis = (v: unknown) => (typeof v === 'number' ? v : (v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0)

export function costsOf(id: string, d: DocumentData, into: CostMap, hist?: CostHist) {
  for (const [pid, v] of Object.entries((d.items ?? {}) as Record<string, DocumentData>)) {
    const c = num(v?.cost)
    if (c === null) continue
    into[costKey(id, pid)] = c
    if (!hist) continue
    const steps: CostStep[] = Array.isArray(v?.hist)
      ? (v.hist as DocumentData[]).map((h) => ({ at: millis(h?.at), cost: num(h?.cost) as number })).filter((h) => h.cost !== null && h.cost !== undefined)
      : []
    if (!steps.length || steps[steps.length - 1].cost !== c) steps.push({ at: millis(v?.at), cost: c })
    hist[costKey(id, pid)] = steps.sort((a, b) => a.at - b.at)
  }
}

/** What a product cost at a moment, from its history; null when its first known cost came later. */
export function costAt(steps: CostStep[] | undefined, when: number): number | null {
  if (!steps?.length) return null
  let out: number | null = null
  for (const s of steps) if (s.at <= when) out = s.cost
  return out
}

/** The history after a new cost (null = emptied: the history goes too). Kept short. */
export function nextHist(steps: CostStep[] | undefined, cost: number | null, now: number): CostStep[] {
  if (cost === null) return []
  return [...(steps ?? []), { at: now, cost }].slice(-30)
}

/** What the picked parts of a build cost the shop, and how many picked parts have no cost yet. */
export function buildCost(lines: { name: string; cat?: string; pid?: string; qty: number }[], map: CostMap) {
  let cost = 0
  let missing = 0
  for (const l of lines) {
    if (!l.name) continue
    const c = l.cat && l.pid ? map[costKey(l.cat, l.pid)] : undefined
    if (c === undefined) missing++
    else cost += c * l.qty
  }
  return { cost, missing }
}
