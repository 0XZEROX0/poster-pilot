import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { listPriceOf } from '../src/data/logic'
import type { Product } from '../src/data/types'

// The offer editor shows Price before from the price list. It must be the same value the engine writes (lib.js pricesFrom),
// so changing the products of an offer does not make the price jump once the engine has seen the change.
const lib = (() => {
  const m: { exports: Record<string, (...a: unknown[]) => unknown> } = { exports: {} }
  new Function('module', readFileSync(new URL('../n8n/direct/lib.js', import.meta.url), 'utf8'))(m)
  return m.exports
})()

const products: Product[] = [
  { category: 'VGA', name: 'RTX 5060 Ti  8GB', price: '21,500', company: 'MSI' },
  { category: 'CPU', name: 'Ryzen 5 7600', price: '9500', company: 'AMD' },
  { category: 'Acc', name: 'PD98 Pro', price: '1600', company: 'Metaphyuni' },
  { category: 'Acc', name: 'PD98 Pro V2', price: '2000', company: 'Metaphyuni' },
  { category: 'Acc', name: 'No price yet', price: 'Soon', company: '' },
]
const cases: [string, { category: string; name: string }[], boolean][] = [
  ['bundle sum, spaces and case', [{ category: 'VGA', name: 'rtx 5060 ti 8gb' }, { category: 'CPU', name: 'Ryzen 5 7600' }], false],
  ['versions: highest price', [{ category: 'Acc', name: 'PD98 Pro' }, { category: 'Acc', name: 'PD98 Pro V2' }], true],
  ['typed product not in the list', [{ category: '', name: 'Something new' }], false],
  ['price that is not a number', [{ category: 'Acc', name: 'No price yet' }], false],
  ['nothing', [], false],
]

describe('listPriceOf matches the engine', () => {
  for (const [name, items, variants] of cases) {
    it(name, () => {
      expect(listPriceOf(items, products, variants)).toEqual(lib.pricesFrom(items, products, variants))
    })
  }
  it('gives the numbers people expect', () => {
    expect(listPriceOf(cases[0][1], products).priceBefore).toBe('31,000')
    expect(listPriceOf(cases[1][1], products, true).priceBefore).toBe('2,000')
    expect(listPriceOf(cases[2][1], products).priceBefore).toBe('Check item')
  })
})
