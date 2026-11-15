import { describe, expect, it } from 'vitest'
import { cleanPlan, placeIn, takeOut, weekDays, weeksOfMonth, weekStart } from '../src/data/plans'

describe('brainstorm weeks', () => {
  it('starts the week on Saturday', () => {
    expect(weekStart('2026-11-15')).toBe('2026-11-14') // Sunday -> the day before
    expect(weekStart('2026-11-14')).toBe('2026-11-14') // Saturday
    expect(weekStart('2026-11-20')).toBe('2026-11-14') // Friday
    expect(weekDays('2026-11-14')).toEqual(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'])
  })
  it('lists every week that touches the month', () => {
    expect(weeksOfMonth('2026-11')).toEqual(['2026-10-31', '2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28'])
    expect(weeksOfMonth('2026-05')[0]).toBe('2026-04-25') // May 1 2026 is a Friday
  })
})

describe('brainstorm plan', () => {
  it('moves a post to one day only, in order', () => {
    let p = placeIn({}, 'a', '2026-11-14')
    p = placeIn(p, 'b', '2026-11-14')
    p = placeIn(p, 'c', '2026-11-14', 'a')
    expect(p['2026-11-14']).toEqual(['c', 'a', 'b'])
    p = placeIn(p, 'a', '2026-11-16')
    expect(p).toEqual({ '2026-11-14': ['c', 'b'], '2026-11-16': ['a'] })
    expect(takeOut(takeOut(p, 'a'), 'x')).toEqual({ '2026-11-14': ['c', 'b'] })
  })
  it('keeps only the days of the week and text ids', () => {
    expect(cleanPlan('2026-11-14', { '2026-11-14': ['a', 'a', 3, ''], '2026-11-21': ['b'], '2026-11-15': [] })).toEqual({ '2026-11-14': ['a'] })
    expect(cleanPlan('2026-11-14', null)).toEqual({})
  })
})
