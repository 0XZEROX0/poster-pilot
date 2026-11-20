import { describe, expect, it } from 'vitest'
import { cleanForm, formProblem, linkDoc, linkStatus, linkTotal, linkUrl, minutesLeft, newToken, toLink, tokenOk, waLinkText } from '../src/data/orderLinkCore'

const item = (name: string, total: number, qty = 1) => ({ name, qty, total, pid: 0, vid: 0 })
const form = { name: 'Karim Adel', phone: '01002223344', email: '', address: '', city: '', area: '', note: '' }

describe('order link total', () => {
  it('takes the discount off the items and adds delivery', () => {
    expect(linkTotal([item('A', 1000), item('B', 500, 2)], 100, 150)).toBe(1550)
  })
  it('never goes below the delivery fee', () => {
    expect(linkTotal([item('A', 100)], 500, 50)).toBe(50)
  })
})

describe('link document', () => {
  const by = { uid: 'u1', name: 'Mona' }
  it('works for at most an hour and keeps delivery only for delivery', () => {
    const d = linkDoc({ items: [item('A', 1000)], discount: 0, delivery: 'pickup', shipping: 300, date: '', time: '', note: '', rep: '', category: '', minutes: 600 }, by, 0)
    expect(d.expiresAt).toBe(60 * 60_000)
    expect(d.shipping).toBe(0)
    expect(d.total).toBe(1000)
    expect(d.state).toBe('open')
  })
  it('caps the discount at the items, drops empty lines and bad dates', () => {
    const d = linkDoc({ items: [item('A', 1000), item('  ', 5)], discount: 5000, delivery: 'delivery', shipping: 200, date: 'tomorrow', time: '17:00', note: ' hi ', rep: 'JR', category: '', minutes: 30 }, by, 0)
    expect(d.items).toHaveLength(1)
    expect(d.discount).toBe(1000)
    expect(d.total).toBe(200)
    expect(d.date).toBe('')
    expect(d.time).toBe('17:00')
    expect(d.note).toBe('hi')
    expect(d.expiresAt).toBe(30 * 60_000)
  })
})

describe('tokens and addresses', () => {
  it('makes long random tokens', () => {
    const a = newToken(), b = newToken()
    expect(tokenOk(a)).toBe(true)
    expect(a).not.toBe(b)
    expect(tokenOk('short')).toBe(false)
    expect(tokenOk('a'.repeat(30) + '/')).toBe(false)
  })
  it('puts the customer page next to the app', () => {
    expect(linkUrl('TOKEN', 'https://x.github.io/poster-pilot/#/orders')).toBe('https://x.github.io/poster-pilot/order.html#TOKEN')
    expect(linkUrl('TOKEN', 'https://os.static-eg.com/')).toBe('https://os.static-eg.com/order.html#TOKEN')
  })
})

describe('link status', () => {
  it('shows an open link past its time as expired', () => {
    expect(linkStatus({ state: 'open', expiresAt: 1000 }, 2000)).toBe('expired')
    expect(linkStatus({ state: 'open', expiresAt: 3000 }, 2000)).toBe('open')
    expect(linkStatus({ state: 'done', expiresAt: 1000 }, 2000)).toBe('done')
    expect(minutesLeft({ expiresAt: 61_000 }, 0)).toBe(2)
  })
  it('reads a link document', () => {
    const l = toLink('tok', { state: 'weird', items: [{ name: 'A', qty: 2, total: 10, pid: 5 }], total: 10, delivery: 'x', createdAt: 5, expiresAt: { toMillis: () => 9 } })
    expect(l.state).toBe('open')
    expect(l.delivery).toBe('pickup')
    expect(l.items[0]).toEqual({ name: 'A', qty: 2, total: 10, pid: 5, vid: 0 })
    expect(l.expiresAt).toBe(9)
    expect(l.form).toBeNull()
  })
  it('writes the WhatsApp message in Arabic with the link', () => {
    const txt = waLinkText({ total: 1550, delivery: 'delivery', createdAt: 0, expiresAt: 3600_000 }, 'https://x/order.html#T')
    expect(txt).toContain('https://x/order.html#T')
    expect(txt).toContain('1,550')
    expect(txt).toContain('ساعة')
  })
})

describe('customer form', () => {
  it('needs a name and a phone; an email only when given', () => {
    expect(formProblem(form, 'pickup')).toBe('')
    expect(formProblem({ ...form, name: 'K' }, 'pickup')).toMatch(/name/)
    expect(formProblem({ ...form, phone: '12' }, 'pickup')).toMatch(/phone/)
    expect(formProblem({ ...form, email: 'nope' }, 'pickup')).toMatch(/email/)
    expect(formProblem({ ...form, email: 'k@x.com' }, 'pickup')).toBe('')
  })
  it('needs the address for delivery only', () => {
    expect(formProblem(form, 'delivery')).toMatch(/governorate/)
    expect(formProblem({ ...form, area: 'Giza', city: 'Haram', address: '12 Gamal St' }, 'delivery')).toBe('')
  })
  it('leaves the address out for pickup and trims', () => {
    expect(cleanForm({ ...form, name: '  Karim ', address: 'x street', city: 'c', area: 'Giza' }, 'pickup')).toEqual({ ...form, name: 'Karim' })
  })
})
