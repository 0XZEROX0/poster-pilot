import { describe as group, expect, it } from 'vitest'
import { inWindow, promptFor, addMonths, cairoMs, checkSpot, clockOf, daysIn, devicesOf, distance, judgeDay, judgeMonth, metersPerLng, openDay, shiftMinutes, shiftOn, withDate, withPlan, type Month, type Person } from '../src/data/hr'

const week = (s: string, e: string, off: number[] = [5]) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), off.includes(d) ? null : { s, e }]))
const shop = { name: 'Shop', lat: 30.0626, lng: 31.3363, radius: 100, kx: metersPerLng(30.0626) }
const settings = { places: [shop], maxAcc: 100, grace: 10 }

group('HR time', () => {
  it('turns a Cairo time into the right moment in winter and in summer', () => {
    expect(new Date(cairoMs('2026-11-18', '11:00')).toISOString()).toBe('2026-11-18T09:00:00.000Z')
    expect(new Date(cairoMs('2026-07-15', '11:00')).toISOString()).toBe('2026-07-15T08:00:00.000Z')
    expect(clockOf(cairoMs('2026-11-18', '23:45'))).toBe('23:45')
  })
  it('counts months and shift lengths, night shifts included', () => {
    expect(daysIn('2026-02')).toBe(28)
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(shiftMinutes({ s: '11:00', e: '19:00' })).toBe(480)
    expect(shiftMinutes({ s: '20:00', e: '02:00' })).toBe(360)
  })
})

group('HR location', () => {
  it('measures a few meters the same way the rules do', () => {
    expect(distance(shop, shop.lat, shop.lng)).toBe(0)
    expect(Math.round(distance(shop, shop.lat + 0.0009, shop.lng))).toBe(100)
  })
  it('lets in only inside the shop, with a precise enough reading', () => {
    expect(checkSpot(settings, shop.lat + 0.0002, shop.lng, 20)).toMatchObject({ ok: true, place: 0 })
    expect(checkSpot(settings, shop.lat + 0.01, shop.lng, 20)).toMatchObject({ ok: false, why: 'far' })
    expect(checkSpot(settings, shop.lat, shop.lng, 500)).toMatchObject({ ok: false, why: 'vague' })
    expect(checkSpot({ ...settings, places: [] }, shop.lat, shop.lng, 5)).toMatchObject({ ok: false, why: 'noPlace' })
  })
})

group('HR shifts', () => {
  const base: Person = { name: 'Mona', plans: [{ from: '2026-01-01', days: week('11:00', '19:00') }], dates: {} }
  it('uses the weekly plan, Friday off, and a one-day change wins', () => {
    expect(shiftOn(base, '2026-11-18')).toEqual({ s: '11:00', e: '19:00' }) // Wednesday
    expect(shiftOn(base, '2026-11-20')).toBeNull() // Friday
    const p = withDate(base, '2026-11-18', null)
    expect(shiftOn(p, '2026-11-18')).toBeNull()
    expect(shiftOn(withDate(p, '2026-11-18', undefined), '2026-11-18')).toEqual({ s: '11:00', e: '19:00' })
  })
  it('keeps old days on the old plan when a new one starts', () => {
    const p = withPlan(base, { from: '2026-11-20', days: week('12:00', '20:00') })
    expect(shiftOn(p, '2026-11-18')?.s).toBe('11:00')
    expect(shiftOn(p, '2026-11-21')?.s).toBe('12:00')
    expect(shiftOn(undefined, '2026-11-21')).toBeNull()
  })
})

group('HR counting', () => {
  const at = (date: string, time: string) => cairoMs(date, time)
  const sh = { s: '11:00', e: '19:00' }
  const d = '2026-11-18'
  it('counts late only after the grace minutes, then all of it', () => {
    expect(judgeDay(d, sh, { in: at(d, '11:08'), out: at(d, '19:00') }, 10).late).toBe(0)
    expect(judgeDay(d, sh, { in: at(d, '11:25'), out: at(d, '19:00') }, 10)).toMatchObject({ late: 25, early: 0, state: 'done', worked: 455 })
  })
  it('counts leaving early, and an excused day counts nothing', () => {
    expect(judgeDay(d, sh, { in: at(d, '11:00'), out: at(d, '18:20') }, 10).early).toBe(40)
    expect(judgeDay(d, sh, { in: at(d, '12:00'), out: at(d, '18:00'), excused: true }, 10)).toMatchObject({ late: 0, early: 0 })
  })
  it('tells absent, not in yet, working and a forgotten clock-out apart', () => {
    expect(judgeDay(d, sh, undefined, 10, at(d, '10:00')).state).toBe('upcoming')
    expect(judgeDay(d, sh, undefined, 10, at(d, '12:00')).state).toBe('notIn')
    expect(judgeDay(d, sh, undefined, 10, at(d, '20:00')).state).toBe('absent')
    expect(judgeDay(d, sh, { in: at(d, '11:00') }, 10, at(d, '15:00')).state).toBe('working')
    expect(judgeDay(d, sh, { in: at(d, '11:00') }, 10, at(d, '23:30')).state).toBe('noOut')
    expect(judgeDay(d, null, undefined, 10).state).toBe('off')
    expect(judgeDay(d, null, { in: at(d, '11:00'), out: at(d, '15:00') }, 10).state).toBe('extra')
  })
  it('handles a night shift that ends after midnight', () => {
    const night = { s: '20:00', e: '02:00' }
    expect(judgeDay(d, night, { in: at(d, '20:30'), out: at('2026-11-19', '01:30') }, 10)).toMatchObject({ late: 30, early: 30, worked: 300 })
  })
  it('adds up a month, penalties included', () => {
    const p: Person = { name: 'A', plans: [{ from: '2026-01-01', days: week('11:00', '19:00') }], dates: {} }
    const m: Month = { id: 'a_2026-11', uid: 'a', month: '2026-11', pens: [{ at: 1, by: 'o', byName: 'O', date: '2026-11-03', amount: 100, unit: 'EGP', reason: '' }], days: {
      '01': { in: at('2026-11-01', '11:30'), out: at('2026-11-01', '19:00') },
      '02': { in: at('2026-11-02', '11:00'), out: at('2026-11-02', '18:00') },
    } }
    const { totals, days } = judgeMonth('2026-11', p, m, 10, at('2026-11-04', '22:00'))
    expect(days).toHaveLength(4)
    expect(totals).toMatchObject({ scheduled: 4, present: 2, absent: 2, lateDays: 1, lateMin: 30, earlyDays: 1, earlyMin: 60, pens: { EGP: 100, hours: 0, days: 0 } })
  })
  it('finds the open day for clocking out, yesterday for a night shift', () => {
    const m: Month = { id: 'a_2026-11', uid: 'a', month: '2026-11', pens: [], days: { 17: { in: 1 }, 18: { in: 2, out: 3 } } }
    expect(openDay(m, '2026-11-18')).toBe('2026-11-17')
    expect(openDay({ ...m, days: { 18: { in: 2 } } }, '2026-11-18')).toBe('2026-11-18')
    expect(openDay(undefined, '2026-11-18')).toBeNull()
  })
  it('notices clocking in from more than one phone', () => {
    const p = { lat: 1, lng: 1, acc: 5, place: 0 }
    const m: Month = { id: 'x', uid: 'a', month: '2026-11', pens: [], days: { '01': { in: 1, inP: { ...p, dev: 'a' } }, '02': { in: 1, inP: { ...p, dev: 'b' } } } }
    expect(devicesOf(m).size).toBe(2)
  })
})

group('HR clock hours and the ask on opening', () => {
  it('knows when a window is open, also across midnight', () => {
    expect(inWindow('', '', '03:00')).toBe(true)
    expect(inWindow('10:00', '15:00', '09:59')).toBe(false)
    expect(inWindow('10:00', '15:00', '15:00')).toBe(true)
    expect(inWindow('18:00', '02:30', '23:10')).toBe(true)
    expect(inWindow('18:00', '02:30', '01:00')).toBe(true)
    expect(inWindow('18:00', '02:30', '12:00')).toBe(false)
    expect(inWindow('10:00', '', '22:00')).toBe(true)
  })
  it('asks to clock in on a shift day inside the hours, and to clock out later', () => {
    const s = { ...settings, inFrom: '10:00', inTo: '15:00', outFrom: '18:00', outTo: '02:30' }
    const p: Person = { name: 'A', plans: [{ from: '2026-01-01', days: week('11:00', '19:00') }], dates: {} }
    const d = '2026-11-18'
    const at = (time: string) => cairoMs(d, time)
    expect(promptFor(s, p, undefined, at('09:00'))).toBeNull()
    expect(promptFor(s, p, undefined, at('10:30'))).toBe('in')
    expect(promptFor(s, undefined, undefined, at('10:30'))).toBeNull()
    expect(promptFor(s, p, undefined, cairoMs('2026-11-20', '10:30'))).toBeNull() // Friday off
    const m: Month = { id: 'x', uid: 'a', month: '2026-11', pens: [], days: { 18: { in: at('10:40') } } }
    expect(promptFor(s, p, m, at('12:00'))).toBeNull()
    expect(promptFor(s, p, m, at('19:00'))).toBe('out')
    expect(promptFor({ ...s, inFrom: '', inTo: '' }, p, undefined, at('10:30'))).toBeNull()
  })
})
