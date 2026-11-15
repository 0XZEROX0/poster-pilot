import { describe as group, expect, it } from 'vitest'
import { ACTIVITY_ACTS, actText, matches, toRow } from '../src/data/activity'
import fs from 'fs'

const ts = (ms: number) => ({ toMillis: () => ms })

group('activity rows', () => {
  it('turns a post history line into a row that can open the post', () => {
    const r = toRow('log', 'a1', { postId: 'p9', at: ts(5), by: 'u1', byName: 'Mona', act: 'offer.approved', title: 'Board B' })
    expect(r).toMatchObject({ id: 'log/a1', at: 5, who: 'Mona', kind: 'person', app: 'posters', act: 'offer.approved', what: 'Board B', postId: 'p9' })
    expect(actText(r.act)).toBe('Offer approved')
  })
  it('names the engine and the website', () => {
    expect(toRow('log', 'a', { by: 'system', act: 'fb.scheduled', at: ts(1) })).toMatchObject({ who: 'System', kind: 'system' })
    expect(toRow('log', 'a', { by: 'system', act: 'prices.checked', at: ts(1) }).app).toBe('engine')
    const w = toRow('priceLog', 'b', { by: 'website', byName: 'Website', act: 'edit', name: 'i5', cat: 'cpu', changes: [{ f: 'out', from: 'In stock', to: 'Out of stock' }], at: ts(2) })
    expect(w).toMatchObject({ who: 'Website', kind: 'website', app: 'prices', act: 'price.edit', what: 'i5', changes: [{ f: 'Stock', from: 'In stock', to: 'Out of stock' }] })
    expect(toRow('activity', 'c', { by: 'website', app: 'website', act: 'website.sent', what: 'i5', at: ts(3) })).toMatchObject({ app: 'website', kind: 'website' })
  })
  it('filters by person, kind, app, action and words', () => {
    const r = toRow('activity', 'c', { by: 'u2', byName: 'Ali', app: 'builder', act: 'quote.discount', what: 'Mona', note: '500 EGP', at: ts(3) })
    const f = { who: '', app: '', act: '', search: '' }
    expect(matches(r, f)).toBe(true)
    expect(matches(r, { ...f, who: 'u2' })).toBe(true)
    expect(matches(r, { ...f, who: 'u3' })).toBe(false)
    expect(matches(r, { ...f, who: 'kind:system' })).toBe(false)
    expect(matches(r, { ...f, app: 'prices' })).toBe(false)
    expect(matches(r, { ...f, act: 'quote.discount' })).toBe(true)
    expect(matches(r, { ...f, search: 'ali 500' })).toBe(true)
    expect(matches(r, { ...f, search: 'extra discount mona' })).toBe(true)
    expect(matches(r, { ...f, search: 'ryzen' })).toBe(false)
  })
  it('allows in the database rules every action the app writes', () => {
    const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
    for (const act of Object.values(ACTIVITY_ACTS).flat()) expect(rules).toContain(`'${act}'`)
  })
})
