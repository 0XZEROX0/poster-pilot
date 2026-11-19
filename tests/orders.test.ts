import { describe, expect, it } from 'vitest'
import { applyStep, editFields, fromWeb, leftOf, matchesOrder, progressOf, toOrder, withoutStep, type Step } from '../src/data/orders'

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
import { lineCosts, orderCost, periodDays, cairoStart, statsOf, toKeep, webIndex, type CostCtx } from '../src/data/orderStats'

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
  const ctx = (over: Partial<CostCtx> = {}): CostCtx => ({ costs, hist: {}, web, saved: {}, ...over })
  const line = (name: string, more: Record<string, unknown> = {}) => ({ name, qty: 1, total: 0, pid: 0, vid: 0, ...more })
  it('finds what website lines cost through confirmed links only', () => {
    expect(web).toEqual({ '500:0': 'ram/r2', '500:*': 'ram/r2', '600:601': 'ram/r3', '600:*': 'ram/r3' })
    expect(orderCost({ id: 'W1', placedAt: 0, items: [line('a', { qty: 2, pid: 500 }), line('b', { pid: 600, vid: 601 })] }, ctx())).toMatchObject({ cost: 1900, missing: 0 })
    expect(orderCost({ id: 'W1', placedAt: 0, items: [line('c', { pid: 700 })] }, ctx())).toMatchObject({ cost: 0, missing: 1 })
  })
  it('uses the cost the product had on the day of the order, and only suggests a later one', () => {
    const hist = { 'ram/r2': [{ at: 1000, cost: 800 }, { at: 2000, cost: 900 }] }
    const o = (placedAt: number) => ({ id: 'W1', placedAt, items: [line('a', { pid: 500 })] })
    expect(lineCosts(o(1500), ctx({ hist }))).toEqual([{ unit: 800, from: 'list', suggest: null, key: 'ram/r2', via: 'own' }])
    expect(lineCosts(o(2500), ctx({ hist }))).toEqual([{ unit: 900, from: 'list', suggest: null, key: 'ram/r2', via: 'own' }])
    expect(lineCosts(o(500), ctx({ hist }))).toEqual([{ unit: null, from: null, suggest: 900, key: 'ram/r2', via: 'own' }])
    // another option of a linked website product: a suggestion only
    expect(lineCosts({ id: 'W2', placedAt: 0, items: [line('b', { pid: 600, vid: 602 })] }, ctx())).toEqual([{ unit: null, from: null, suggest: 100 }])
  })
  it('uses a product picked for the line, for the website product or for the name', () => {
    const o = { id: 'MS2', placedAt: 0, items: [line('Kingston  RAM 8GB!'), line('w', { pid: 900, vid: 0 })] }
    expect(orderCost(o, ctx())).toMatchObject({ missing: 2 })
    const links = { web: { '900:0': 'ram/r1' }, names: { 'kingston ram 8gb': 'ram/r2' } }
    expect(orderCost(o, ctx({ links }))).toMatchObject({ cost: 2100, missing: 0 })
    expect(lineCosts(o, ctx({ links }))[0]).toMatchObject({ key: 'ram/r2', via: 'all', from: 'list' })
    const saved = { MS2: [{ n: 'Kingston  RAM 8GB!', c: null, k: 'ram/r1' }] }
    expect(lineCosts(o, ctx({ links, saved }))[0]).toMatchObject({ key: 'ram/r1', unit: 1200, via: 'line' })
    // a product picked for one line corrects even the order's own (or the website's) link
    const w = { id: 'W9', placedAt: 0, items: [line('a', { pid: 500 })] }
    expect(lineCosts(w, ctx({ saved: { W9: [{ n: 'a', c: null, k: 'ram/r1' }] } }))[0]).toMatchObject({ key: 'ram/r1', unit: 1200, via: 'line' })
  })
  it('keeps the price list cost with each completed order, so a later change does not move its profit', () => {
    const hist = { 'ram/r2': [{ at: 1000, cost: 100 }] }
    const mk = (id: string, more: Record<string, unknown>) => toOrder(id, { closed: true, status: 'completed', webStatus: 'completed', steps: [], webTotal: 200, ...more })
    const o = mk('W5', { placedAt: 2000, items: [{ name: 'a', qty: 1, total: 200, pid: 500, vid: 0 }, { name: 'typed', qty: 1, total: 0, pid: 0, vid: 0 }] })
    const saved = { W5: [{ n: 'a', c: null }, { n: 'typed', c: 40 }] }
    const keep = toKeep(statsOf([o], ctx({ hist, saved })).lines, saved)
    expect(keep).toEqual([{ id: 'W5', placedAt: o.placedAt, lines: [{ n: 'a', c: 100, a: 'ram/r2' }, { n: 'typed', c: 40 }] }])
    // later the price list cost goes up to 200 (and even if the product is removed): the order still costs 100
    const kept = { W5: keep[0].lines }
    expect(lineCosts(o, ctx({ costs: { 'ram/r2': 200 }, hist: { 'ram/r2': [{ at: 5000, cost: 200 }] }, saved: kept }))[0]).toMatchObject({ unit: 100, from: 'list', kept: true })
    expect(lineCosts(o, ctx({ costs: {}, hist: {}, saved: kept }))[0]).toMatchObject({ unit: 100, kept: true })
    expect(toKeep(statsOf([o], ctx({ hist, saved: kept })).lines, kept)).toEqual([])
    // the line is matched to another product: the kept cost no longer counts
    const moved = { W5: [{ ...keep[0].lines[0], k: 'ram/r1' }, keep[0].lines[1]] }
    expect(lineCosts(o, ctx({ saved: moved }))[0]).toMatchObject({ key: 'ram/r1', unit: 1200 })
  })
  it('a cost saved on the order wins, while the line keeps its name', () => {
    const o = { id: 'MS1', placedAt: 0, items: [line('Old PC specs', { total: 20000 }), line('a', { qty: 2, pid: 500 })] }
    expect(orderCost(o, ctx())).toMatchObject({ missing: 1 })
    const saved = { MS1: [{ n: 'Old PC specs', c: 17000 }, { n: 'a', c: 850 }] }
    expect(orderCost(o, ctx({ saved }))).toMatchObject({ cost: 18700, missing: 0 })
    expect(orderCost({ ...o, items: [line('Changed', { total: 20000 }), o.items[1]] }, ctx({ saved }))).toMatchObject({ missing: 1 })
  })
  it('adds up completed orders, keeps open and cancelled apart, and leaves out orders without cost', () => {
    const mk = (id: string, more: Record<string, unknown>) => toOrder(id, { closed: false, steps: [], items: [], ...more })
    const list = [
      mk('W1', { webStatus: 'completed', status: 'completed', webTotal: 2100, shipping: 300, items: [{ name: 'a', qty: 2, total: 1800, pid: 500, vid: 0 }] }),
      mk('W2', { webStatus: 'completed', status: 'completed', webTotal: 1000, items: [{ name: 'c', qty: 1, total: 1000, pid: 700, vid: 0 }] }),
      mk('M1', { source: 'phone', status: 'completed', webTotal: 3000, agreed: 2800, items: [{ name: 'RAM', qty: 2, total: 3000, cat: 'ram', ref: 'r1' }] }),
      mk('M2', { source: 'store', status: 'new', webTotal: 500 }),
      mk('W3', { webStatus: 'cancelled', status: 'cancelled', webTotal: 999 }),
      mk('M3', { source: 'phone', status: 'completed', webTotal: 700 }),
    ]
    const s = statsOf(list, ctx())
    expect(s.all).toMatchObject({ orders: 6, completed: 4, cancelled: 1, open: 1, openValue: 500, sales: 6600, delivery: 300, costed: 2, uncosted: 2 })
    // W1: 2100 - 300 delivery - 1800 cost = 0; M1: 2800 - 2400 = 400; M3 has no items, so no cost: never all profit
    expect(s.all.profit).toBe(400)
    expect(s.manual).toMatchObject({ orders: 3, completed: 2, sales: 3500, profit: 400 })
    expect(s.website).toMatchObject({ orders: 3, completed: 2, sales: 3100 })
    expect(statsOf(list, null).all.uncosted).toBe(4)
    expect(s.lines.find((l) => l.o.id === 'W2')).toMatchObject({ profit: null, missing: 1 })
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
    const g = sumsBy([mk('M1', 'Octo', 100), mk('M2', 'JR', 500), mk('M3', 'Octo', 300), mk('M4', '', 50, 'new')], null, (o) => o.rep)
    expect(g.map(([k, s]) => [k, s.sales, s.orders])).toEqual([['JR', 500, 1], ['Octo', 400, 2], ['', 0, 1]])
  })
})

describe('changing an order', () => {
  const d = (over: Partial<Draft> = {}): Draft => ({ source: 'website', customer: ' Karim ', phone: '0100', email: '', address: '', city: '', area: '', delivery: 'pickup', shipping: 150, payMethod: 'Cash', items: [{ name: 'Case', qty: 1, total: 4999, pid: 7, vid: 2 }, { name: 'Fan', qty: 2, total: 600, pid: 0, vid: 0 }], customerNote: '', date: '', time: '', rep: '', category: '', status: 'new', agreed: null, ...over })
  it('marks a website order local, keeps its source and the website product of each line', () => {
    const f = editFields({ source: 'website' }, d()) as Record<string, unknown>
    expect(f.local).toBe(true)
    expect(f.push).toBe(true)
    expect('source' in f).toBe(false)
    expect((f.items as { pid: number; vid: number }[])[0]).toMatchObject({ pid: 7, vid: 2 })
    expect(f.shipping).toBe(0) // picked up: no delivery fee
    expect(f.webTotal).toBe(5599)
    expect(f.customer).toBe('Karim')
  })
  it('keeps a hand order a hand order', () => {
    const f = editFields({ source: 'whatsapp' }, d({ source: 'whatsapp', delivery: 'delivery' })) as Record<string, unknown>
    expect(f.source).toBe('whatsapp')
    expect('local' in f).toBe(false)
    expect(f.webTotal).toBe(5749)
  })
})

import { monthOf, monthsBetween, savedOf } from '../src/data/orderCosts'
describe('costs saved on orders', () => {
  it('files orders by their Cairo month and lists the months of a period', () => {
    expect(monthOf(Date.parse('2026-10-31T23:30:00Z'))).toBe('2026-11')
    expect(monthsBetween('2025-11-20', '2026-02-03')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(monthsBetween('2026-11-01', '2026-11-17')).toEqual(['2026-11'])
  })
  it('reads a month document', () => {
    const out = {}
    const logs = {}
    savedOf({ orders: { MS1: { lines: [{ n: 'PC', c: 100 }, { n: 'x', c: null }, { n: 'y' }], log: [{ at: 5, byName: 'A', note: 'n2' }, { at: 2, byName: 'B', note: 'n1' }] }, bad: {} } }, out, logs)
    expect(out).toEqual({ MS1: [{ n: 'PC', c: 100 }, { n: 'x', c: null }, { n: 'y', c: null }] })
    expect(logs).toEqual({ MS1: [{ at: 2, byName: 'B', note: 'n1' }, { at: 5, byName: 'A', note: 'n2' }] })
  })
})

import { bestMatches, nameScore, plainName } from '../src/data/nameMatch'
describe('matching order lines to price list names', () => {
  const list = [
    { name: 'Lenovo Legion R24e 24" FHD IPS 180Hz' }, { name: 'Lenovo Legion 27Q-10 27" 2K IPS 240Hz' }, { name: 'MSI MAG 275QF 27" 2K' }, { name: 'Jedel WKL-102 Keyboard' },
  ]
  it('finds the same product under another name', () => {
    expect(plainName('AMD Ryzen™ 7 5800X ')).toBe('amd ryzen 7 5800x')
    expect(bestMatches('Lenovo Legion R24e 23.8-inch IPS FHD 180Hz Gaming Monitor', list)[0].item.name).toBe(list[0].name)
    expect(bestMatches('MSI MAG 275QF E21 27" 2K Rapid IPS 210Hz 0.5ms', list)[0].item.name).toBe(list[2].name)
    expect(bestMatches('Jedel WKL-102 Gaming Keyboard', list)[0].item.name).toBe(list[3].name)
    expect(bestMatches('Thermal paste', list)).toEqual([])
    expect(bestMatches('Lenovo Legion 27Q-10 27" 2K IPS 240Hz 0.5ms', [{ name: 'Lenovo Legion 27Q-11 27" 2K 300Hz' }, list[1]])[0].item).toBe(list[1])
    expect(nameScore('a', '')).toBe(0)
  })
})

import { readFileSync } from 'node:fs'
import { NEW_ORDER_KEYS, newOrderDoc } from '../src/data/orders'

describe('a new hand order matches the database rules', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
  const listed = (fn: string) => [...(rules.match(new RegExp(`function ${fn}\\(\\) \\{\\s*return \\[([^\\]]*)\\]`))?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
  it('writes only the fields the create rule allows, and all it requires', () => {
    const allowed = [...listed('manualOrderKeys'), 'rep', 'category']
    expect([...NEW_ORDER_KEYS].sort()).toEqual(allowed.sort())
    const d: Draft = { source: 'whatsapp', customer: 'Sara', phone: '010', email: '', address: '', city: '', area: '', delivery: 'pickup', shipping: 0, payMethod: 'Cash', items: [{ name: 'Fan', qty: 1, total: 100, pid: 0, vid: 0 }], customerNote: '', date: '', time: '', status: 'new', agreed: null, rep: '', category: '' }
    const [, data] = newOrderDoc(manualOrder(d, { at: 1, by: 'u', byName: 'U', kind: 'placed', note: '' }))
    const keys = [...Object.keys(data), 'placedAt', 'updatedAt']
    expect(keys.every((k) => allowed.includes(k))).toBe(true)
    expect(listed('manualOrderKeys').every((k) => keys.includes(k))).toBe(true)
  })
})

import { periodSummary } from '../src/data/orders'
describe('periodSummary', () => {
  const mk = (id: string, status: string, total: number) => toOrder(id, { status, closed: status !== 'new' && status !== 'confirmed', webTotal: total, steps: [], items: [] })
  it('counts each status and keeps cancelled money out of the total', () => {
    const s = periodSummary([mk('a', 'new', 100), mk('b', 'completed', 300), mk('c', 'completed', 200), mk('d', 'cancelled', 50), mk('e', 'refunded', 70), mk('f', 'confirmed', 10)])
    expect(s.all).toEqual({ n: 6, sum: 610 })
    expect(s.completed).toEqual({ n: 2, sum: 500 })
    expect(s.cancelled).toEqual({ n: 2, sum: 120 })
    expect(s.new.n).toBe(1)
    expect(s.confirmed.n).toBe(1)
  })
})
