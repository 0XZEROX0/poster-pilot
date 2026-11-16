import { describe, expect, it } from 'vitest'
import { buildCost, costKey, costsOf, lowestPrice, profitOf, profitText } from '../src/data/costMath'

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
  it('picks the lowest of the four prices, leaves empty ones out, and says which it is', () => {
    expect(lowestPrice({ in: 7800, alone: 8000, online: 8200, onlineSale: 7500 })).toEqual({ price: 7500, label: 'Price after' })
    expect(lowestPrice({ in: 7800, alone: 8000, online: null, onlineSale: undefined })).toEqual({ price: 7800, label: 'In build' })
    expect(lowestPrice({ in: null, alone: 8000, online: 7900 })).toEqual({ price: 7900, label: 'Price before' })
    expect(lowestPrice({ in: 0, alone: 8000 })).toEqual({ price: 8000, label: 'Alone' })
    expect(lowestPrice({ in: 7800, alone: 8000, onlineSale: 7500 }, false)).toEqual({ price: 7800, label: 'In build' })
    expect(lowestPrice({ in: null, alone: null })).toBeNull()
  })
})
