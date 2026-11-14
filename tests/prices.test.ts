import { describe, expect, it } from 'vitest'
import { bulkPatches, categoryOf, diff, matches, money, parseMoney, roundTo, type PriceItem } from '../src/data/prices'

const item = (over: Partial<PriceItem> = {}): PriceItem => ({ id: 'a1', name: 'Asus Prime B850M-K', in: 5500, alone: 5700, warranty: 3, company: 'Asus Prime', specs: { socket: 'AM5', memory: 'DDR5' }, ...over })

describe('prices', () => {
  it('reads what people type', () => {
    expect(parseMoney('5,500')).toBe(5500)
    expect(parseMoney(' 7450 ')).toBe(7450)
    expect(parseMoney('٥٥٠٠')).toBe(5500)
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeUndefined()
    expect(money(5500)).toBe('5,500')
    expect(money(null)).toBe('—')
  })
  it('finds products by any words, in any order', () => {
    expect(matches(item(), 'b850 asus')).toBe(true)
    expect(matches(item(), 'am5')).toBe(true)
    expect(matches(item(), 'b650')).toBe(false)
    expect(matches(item(), '')).toBe(true)
  })
  it('lists only what changed', () => {
    expect(diff(item(), { alone: 5700, in: 5600 })).toEqual([{ f: 'in', from: '5,500', to: '5,600' }])
    expect(diff(item(), { specs: { socket: 'AM5', memory: 'DDR4' } })).toEqual([{ f: 'specs.memory', from: 'DDR5', to: 'DDR4' }])
    expect(diff(null, { name: 'New' })).toEqual([{ f: 'name', from: '', to: 'New' }])
  })
  it('changes a whole category by a percent, rounded', () => {
    expect(roundTo(5665, 50)).toBe(5650)
    const out = bulkPatches([item(), item({ id: 'a2', in: null, alone: 1000 })], 3, 'both', 50)
    expect(out.map((x) => x.patch)).toEqual([{ in: 5650, alone: 5850 }, { alone: 1050 }])
    expect(bulkPatches([item()], 0.1, 'both', 100)).toEqual([])
  })
  it('keeps the sheet order and puts new products last', () => {
    const c = categoryOf('mb', { name: 'Motherboard', order: 2, items: { z: { name: 'New one', at: 5 }, b: { name: 'Second', n: 2 }, a: { name: 'First', n: 1, in: 10, alone: 'x' } } })
    expect(c.items.map((i) => i.name)).toEqual(['First', 'Second', 'New one'])
    expect(c.items[0].alone).toBeNull()
  })
})
