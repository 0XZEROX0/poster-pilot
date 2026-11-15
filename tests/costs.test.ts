import { describe, expect, it } from 'vitest'
import { buildCost, costKey, costsOf, profitOf, profitText } from '../src/data/costMath'

describe('costs', () => {
  it('reads a costs document into one map by category and product', () => {
    const map = {}
    costsOf('cpu', { items: { a1: { cost: 7300 }, a2: { cost: null }, a3: {} } }, map)
    expect(map).toEqual({ 'cpu/a1': 7300 })
  })
  it('adds up what the picked parts cost, times quantity, and counts parts without a cost', () => {
    const map = { [costKey('cpu', 'a')]: 7000, [costKey('ram', 'b')]: 1500 }
    const lines = [
      { name: 'CPU', cat: 'cpu', pid: 'a', qty: 1 },
      { name: 'RAM', cat: 'ram', pid: 'b', qty: 2 },
      { name: 'Case', cat: 'case', pid: 'c', qty: 1 },
      { name: '', cat: 'ssd', pid: 'd', qty: 1 },
      { name: 'Hand typed', qty: 1 },
    ]
    expect(buildCost(lines, map)).toEqual({ cost: 10000, missing: 2 })
  })
  it('gives profit and margin, or nothing when a number is missing', () => {
    expect(profitOf(10000, 8000)).toEqual({ profit: 2000, percent: 20 })
    expect(profitOf(null, 8000)).toBeNull()
    expect(profitOf(1000, null)).toBeNull()
    expect(profitText(profitOf(9000, 9500))).toBe('-500 (-5.6%)')
  })
})
