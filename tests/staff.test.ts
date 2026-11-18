import { describe, expect, it } from 'vitest'
import { annualUsed, leaveDates, tenure, toLeave, toStaff, type Leave } from '../src/data/staff'

const L = (over: Partial<Leave>): Leave => ({ id: 'x', uid: 'a', name: 'A', from: '2026-12-01', to: '2026-12-01', kind: 'annual', why: '', state: 'ok', at: 1, ...over })

describe('HR records', () => {
  it('lists every day of a leave, across months', () => {
    expect(leaveDates({ from: '2026-11-29', to: '2026-12-02' })).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'])
    expect(leaveDates({ from: '2026-12-02', to: '2026-12-01' })).toEqual([])
    expect(leaveDates({ from: '2026-01-01', to: '2026-12-31' })).toHaveLength(60)
  })
  it('counts only accepted annual days in that year', () => {
    const list = [
      L({ from: '2026-12-30', to: '2027-01-02' }),
      L({ id: 'b', state: 'pending', from: '2026-05-01', to: '2026-05-03' }),
      L({ id: 'c', kind: 'sick', from: '2026-05-01', to: '2026-05-03' }),
      L({ id: 'd', uid: 'b', from: '2026-05-01', to: '2026-05-03' }),
      L({ id: 'e', state: 'cancelled', from: '2026-06-01', to: '2026-06-01' }),
    ]
    expect(annualUsed(list, 'a', '2026')).toBe(2)
    expect(annualUsed(list, 'a', '2027')).toBe(2)
    expect(annualUsed(list, 'b', '2026')).toBe(3)
  })
  it('works out how long someone has been with the shop', () => {
    expect(tenure('2024-03-15', '2026-11-18')).toEqual({ y: 2, m: 8 })
    expect(tenure('2024-03-19', '2026-11-18')).toEqual({ y: 2, m: 7 })
    expect(tenure('2026-12-01', '2026-11-18')).toBeNull()
    expect(tenure('', '2026-11-18')).toBeNull()
  })
  it('reads stored documents safely', () => {
    expect(toLeave('z', { uid: 'a', from: '2026-12-01', to: '2026-12-01', kind: 'holiday', state: 'weird' })).toMatchObject({ kind: 'other', state: 'pending', why: '' })
    expect(toStaff('Mona', undefined)).toMatchObject({ name: 'Mona', annualDays: 21, notes: [] })
    expect(toStaff('Mona', { salary: 'x', notes: [{ kind: 'bad', text: 'hi', at: 5 }] })).toMatchObject({ salary: 0, notes: [{ kind: 'note', text: 'hi', at: 5 }] })
  })
})

import { overallOf, prevQuarter, quarterMonths, quarterOf, withReview, type Review } from '../src/data/staff'
describe('Quarterly reviews', () => {
  it('works out quarters', () => {
    expect(quarterOf('2026-11-19')).toBe('2026-Q4')
    expect(quarterOf('2026-03-31')).toBe('2026-Q1')
    expect(quarterMonths('2026-Q2')).toEqual(['2026-04', '2026-05', '2026-06'])
    expect(prevQuarter('2026-Q1')).toBe('2025-Q4')
    expect(prevQuarter('2026-Q3')).toBe('2026-Q2')
  })
  it('averages only the scores given', () => {
    expect(overallOf({ attendance: 4, work: 5 })).toBe(4.5)
    expect(overallOf({ attendance: 4, work: 5, team: 4 })).toBe(4.3)
    expect(overallOf({ attendance: 9 })).toBe(0)
    expect(overallOf({})).toBe(0)
  })
  it('keeps one review per quarter, newest first', () => {
    const R = (q: string, overall: number): Review => ({ q, overall, at: 1, by: '', byName: '', scores: {}, good: '', improve: '', goals: '' })
    expect(withReview([R('2026-Q2', 3), R('2026-Q3', 3)], R('2026-Q3', 5)).map((r) => [r.q, r.overall])).toEqual([['2026-Q3', 5], ['2026-Q2', 3]])
  })
})
