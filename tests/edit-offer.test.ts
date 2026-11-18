import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { closestProduct, listPriceOf, priceIssues } from '../src/data/logic'
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

describe('missing Price before', () => {
  const list: Product[] = [
    { category: 'Monitor', name: 'Dell SE2425HG 24" FHD IPS 200Hz 1MS', price: '5,000', company: 'Dell' },
    { category: 'MB', name: 'ASUS TUF GAMING X870-PLUS WIFI', price: '16,000', company: 'Asus' },
    { category: 'Acc', name: 'Metaphyuni Metapanda Hand Wrist', price: '', company: '' },
    { category: 'Acc', name: 'Metaphyuni Metapanda PD98 Pro V2', price: '2,000', company: '' },
  ]
  const post = (items: { category: string; name: string }[], priceBefore: string) => ({
    id: 'x', order: 1, items: items.map((i) => ({ ...i, manualPhoto: '', nextPhoto: false })), company: '', priceBefore, priceAfter: '', style: '', details: '',
    posterUrl: '', photoStatus: '', feedback: '', postDate: '', postTime: '', scheduledFor: '', caption: '', captionStyle: '', fbStatus: '', igStatus: '', fbPostId: '', createdAt: 0, offer: '',
  }) as import('../src/data/types').Post
  it('suggests the renamed list product', () => {
    expect(closestProduct('Dell SE2425HG 24″ FHD IPS 200Hz 1MS', 'Monitor', list)?.price).toBe('5,000')
    expect(closestProduct('ASUS TUF GAMING X870-Plus Wi Fi', 'MB', list)?.price).toBe('16,000')
    expect(closestProduct('Something else entirely', 'MB', list)).toBeNull()
  })
  it('finds the item and why', () => {
    const r = priceIssues(post([{ category: 'Monitor', name: 'Dell SE2425HG 24″ FHD IPS 200Hz 1MS' }, { category: 'Acc', name: 'Metaphyuni Metapanda Hand Wrist' }], 'Check item'), list)
    expect(r.missing).toBe(true)
    expect(r.items.map((i) => [i.index, i.reason, i.suggestion?.name ?? null])).toEqual([[0, 'not-in-list', 'Dell SE2425HG 24" FHD IPS 200Hz 1MS'], [1, 'no-price', null]])
  })
  it('a priced post is fine, an empty price is not', () => {
    expect(priceIssues(post([{ category: 'MB', name: 'ASUS TUF GAMING X870-PLUS WIFI' }], '16,000'), list).missing).toBe(false)
    expect(priceIssues(post([{ category: 'MB', name: 'ASUS TUF GAMING X870-PLUS WIFI' }], ''), list)).toEqual({ missing: true, items: [] })
  })
})
