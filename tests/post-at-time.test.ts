import { describe, expect, it } from 'vitest'
import { minutesUntil, postsFromApp, waitsInApp } from '../src/data/logic'

// Facebook only takes a scheduled post well ahead of its time; a closer time waits in the app (2026-11-20).
describe('posting from the app when the time is too close for Facebook', () => {
  const now = { date: '2026-11-20', time: '16:50' }
  it('counts minutes until a Cairo date and time, across midnight too', () => {
    expect(minutesUntil('2026-11-20', '17:00', now)).toBe(10)
    expect(minutesUntil('2026-11-20', '16:40', now)).toBe(-10)
    expect(minutesUntil('2026-11-21', '00:10', { date: '2026-11-20', time: '23:50' })).toBe(20)
    expect(minutesUntil('', '17:00', now)).toBeNull()
  })
  it('only a time ahead but under 30 minutes is posted from the app', () => {
    expect(postsFromApp('2026-11-20', '17:00', now)).toBe(true)
    expect(postsFromApp('2026-11-20', '17:19', now)).toBe(true)
    expect(postsFromApp('2026-11-20', '17:20', now)).toBe(false)
    expect(postsFromApp('2026-11-20', '16:30', now)).toBe(false)
  })
  it('reads the engine status on Facebook or Instagram', () => {
    expect(waitsInApp({ fbStatus: 'Waiting to post at 17:00 from the app', igStatus: '' })).toBe(true)
    expect(waitsInApp({ fbStatus: '', igStatus: 'Waiting to post at 17:00 from the app' })).toBe(true)
    expect(waitsInApp({ fbStatus: 'Waiting for Post date and Post time', igStatus: '' })).toBe(false)
  })
})
