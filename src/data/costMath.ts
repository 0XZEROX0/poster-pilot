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
export const profitText = (p: ReturnType<typeof profitOf>) => (p ? `${money(p.profit)} (${p.percent}%)` : '—')

const num = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : null)

export function costsOf(id: string, d: DocumentData, into: CostMap) {
  for (const [pid, v] of Object.entries((d.items ?? {}) as Record<string, DocumentData>)) {
    const c = num(v?.cost)
    if (c !== null) into[costKey(id, pid)] = c
  }
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
