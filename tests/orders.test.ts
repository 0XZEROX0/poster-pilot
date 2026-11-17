import { describe, expect, it } from 'vitest'
import { applyStep, fromWeb, leftOf, matchesOrder, progressOf, toOrder, withoutStep, type Step } from '../src/data/orders'

const st = (kind: Step['kind'], more: Partial<Step> = {}): Step => ({ at: 1, by: 'u', byName: 'U', kind, note: '', ...more })
const base = toOrder('W1', { wooId: 1, number: '1', webStatus: 'on-hold', status: 'new', closed: false, customer: 'Karim Adel', phone: '01002223344', webTotal: 5299, shipping: 300, items: [{ name: 'Xigmatek Case', qty: 1, total: 4999 }], steps: [st('placed')] })

describe('website status mapping', () => {
  it('maps WooCommerce statuses to the app', () => {
    expect(fromWeb('on-hold')).toBe('new')
    expect(fromWeb('pending')).toBe('new')
    expect(fromWeb('processing')).toBe('confirmed')
    expect(fromWeb('completed')).toBe('completed')
    expect(fromWeb('cancelled')).toBe('cancelled')
    expect(fromWeb('refunded')).toBe('refunded')
    expect(fromWeb('some-plugin-status')).toBe('new')
  })
})

describe('order steps', () => {
  it('confirming asks the website for processing', () => {
    const o = applyStep(base, st('confirmed'))
    expect(o).toMatchObject({ status: 'confirmed', want: 'processing', closed: false })
  })
  it('completing and cancelling close the order', () => {
    expect(applyStep(base, st('delivered'))).toMatchObject({ status: 'completed', want: 'completed', closed: true })
    expect(applyStep(base, st('cancelled'))).toMatchObject({ status: 'cancelled', want: 'cancelled', closed: true })
  })
  it('does not send what the website already has', () => {
    const o = { ...base, webStatus: 'processing', status: 'new' as const }
    expect(applyStep(o, st('confirmed')).want).toBe('')
  })
  it('a note keeps a waiting send', () => {
    const o = { ...base, want: 'processing', status: 'confirmed' as const }
    expect(applyStep(o, st('note')).want).toBe('processing')
  })
  it('keeps price, payments and date', () => {
    let o = { ...base, ...applyStep(base, st('price', { amount: 5000 })) }
    expect(o.agreed).toBe(5000)
    o = { ...o, ...applyStep(o, st('paid', { amount: 300, method: 'Instapay' })) }
    expect(leftOf(o)).toBe(4700)
    o = { ...o, ...applyStep(o, st('date', { date: '2026-11-18', time: '17:00' })) }
    expect([o.date, o.time]).toEqual(['2026-11-18', '17:00'])
    expect(progressOf(o)).toEqual([true, false, false, false, false])
    o = { ...o, ...applyStep(o, st('paid', { amount: 4700, method: 'Cash' })) }
    expect(leftOf(o)).toBe(0)
    expect(progressOf(o)).toEqual([true, false, true, false, false])
  })
  it('taking out the price step goes back to the earlier price', () => {
    const o = { ...base, steps: [st('placed'), st('price', { amount: 5100 }), st('price', { amount: 5000 })], agreed: 5000 }
    expect(withoutStep(o, 2).agreed).toBe(5100)
    expect(withoutStep({ ...o, steps: o.steps.slice(0, 2), agreed: 5100 }, 1).agreed).toBe(null)
  })
})

describe('search', () => {
  it('finds by name, number, product and phone', () => {
    expect(matchesOrder(base, 'karim')).toBe(true)
    expect(matchesOrder(base, '#1')).toBe(true)
    expect(matchesOrder(base, 'xigmatek')).toBe(true)
    expect(matchesOrder(base, '2223344')).toBe(true)
    expect(matchesOrder(base, 'omar')).toBe(false)
  })
})

import { draftFields, manualOrder, type Draft } from '../src/data/orders'
import { orderCost, periodDays, cairoStart, statsOf, webIndex } from '../src/data/orderStats'

const draft = (over: Partial<Draft> = {}): Draft => ({
  source: 'whatsapp', status: 'new', agreed: null, customer: ' Sara ', phone: '0100', email: '', address: 'x', city: 'Giza', area: '', delivery: 'pickup', shipping: 200,
  payMethod: 'Cash', items: [{ name: 'RAM 16GB', qty: 2, total: 3000, pid: 0, vid: 0, cat: 'ram', ref: 'r1' }, { name: ' ', qty: 1, total: 5, pid: 0, vid: 0 }], customerNote: '', date: '', time: '', rep: 'Octo', category: 'Monitor', ...over,
})

describe('orders added by hand', () => {
  it('cleans the form and works out the total', () => {
    const f = draftFields(draft())
    expect(f.customer).toBe('Sara')
    expect(f.items).toHaveLength(1)
    expect(f.shipping).toBe(0) // pickup has no delivery
    expect(f.webTotal).toBe(3000)
    expect(draftFields(draft({ delivery: 'delivery' })).webTotal).toBe(3200)
  })
  it('makes an order that is never sent to the website', () => {
    const o = manualOrder(draft({ status: 'confirmed' }), st('placed'))
    expect(o.id).toMatch(/^M[A-Za-z0-9]{8,40}$/)
    expect(o).toMatchObject({ wooId: 0, webStatus: '', want: '', status: 'confirmed', closed: false, source: 'whatsapp' })
    const full = toOrder(o.id, o)
    expect(applyStep(full, st('delivered'))).toMatchObject({ status: 'completed', want: '', closed: true })
    expect(applyStep(full, st('cancelled')).want).toBe('')
  })
})

describe('sales and profit', () => {
  const cats = [{ id: 'ram', items: [{ id: 'r1' }, { id: 'r2', web: { id: 500, ok: true } }, { id: 'r3', web: { id: 600, ok: true, variation: 601 } }, { id: 'r4', web: { id: 700, ok: false } }] }]
  const web = webIndex(cats)
  const costs = { 'ram/r1': 1200, 'ram/r2': 900, 'ram/r3': 100 }
  it('finds what website lines cost through confirmed links only', () => {
    expect(web).toEqual({ '500:0': 'ram/r2', '600:601': 'ram/r3' })
    expect(orderCost({ items: [{ name: 'a', qty: 2, total: 0, pid: 500, vid: 0 }, { name: 'b', qty: 1, total: 0, pid: 600, vid: 601 }] }, costs, web)).toEqual({ cost: 1900, missing: 0 })
    expect(orderCost({ items: [{ name: 'c', qty: 1, total: 0, pid: 700, vid: 0 }] }, costs, web)).toEqual({ cost: 0, missing: 1 })
  })
  it('adds up completed orders, keeps open and cancelled apart, and leaves out orders without cost', () => {
    const mk = (id: string, more: Record<string, unknown>) => toOrder(id, { closed: false, steps: [], items: [], ...more })
    const list = [
      mk('W1', { webStatus: 'completed', status: 'completed', webTotal: 2100, shipping: 300, items: [{ name: 'a', qty: 2, total: 1800, pid: 500, vid: 0 }] }),
      mk('W2', { webStatus: 'completed', status: 'completed', webTotal: 1000, items: [{ name: 'c', qty: 1, total: 1000, pid: 700, vid: 0 }] }),
      mk('M1', { source: 'phone', status: 'completed', webTotal: 3000, agreed: 2800, items: [{ name: 'RAM', qty: 2, total: 3000, cat: 'ram', ref: 'r1' }] }),
      mk('M2', { source: 'store', status: 'new', webTotal: 500 }),
      mk('W3', { webStatus: 'cancelled', status: 'cancelled', webTotal: 999 }),
    ]
    const s = statsOf(list, costs, web)
    expect(s.all).toMatchObject({ orders: 5, completed: 3, cancelled: 1, open: 1, openValue: 500, sales: 5900, delivery: 300, costed: 2, uncosted: 1 })
    // W1: 2100 - 300 delivery - 1800 cost = 0; M1: 2800 - 2400 = 400
    expect(s.all.profit).toBe(400)
    expect(s.manual).toMatchObject({ orders: 2, completed: 1, sales: 2800, profit: 400 })
    expect(s.website).toMatchObject({ orders: 3, completed: 2, sales: 3100 })
    expect(statsOf(list, null, web).all.uncosted).toBe(3)
  })
  it('turns periods into Cairo days', () => {
    expect(periodDays('week', '2026-11-17')).toEqual({ from: '2026-11-11', to: '2026-11-17' })
    expect(periodDays('lastmonth', '2026-03-05')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(periodDays('custom', '2026-11-17', '2026-11-10', '2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-11-10' })
    expect(new Date(cairoStart('2026-11-17')).toISOString()).toBe('2026-11-16T22:00:00.000Z')
  })
})

import { sumsBy } from '../src/data/orderStats'
describe('sales by rep', () => {
  it('groups orders by any key, biggest sales first', () => {
    const mk = (id: string, rep: string, total: number, status = 'completed') => toOrder(id, { source: 'whatsapp', status, webTotal: total, rep, steps: [], items: [] })
    const g = sumsBy([mk('M1', 'Octo', 100), mk('M2', 'JR', 500), mk('M3', 'Octo', 300), mk('M4', '', 50, 'new')], null, {}, (o) => o.rep)
    expect(g.map(([k, s]) => [k, s.sales, s.orders])).toEqual([['JR', 500, 1], ['Octo', 400, 2], ['', 0, 1]])
  })
})
