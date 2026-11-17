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
