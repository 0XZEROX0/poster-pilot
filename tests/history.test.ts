import { describe as group, expect, it } from 'vitest'
import { APP_ACTS, cairoTime, describe, describeNew } from '../src/data/history'
import type { Post } from '../src/data/types'

const post = (over: Partial<Post> = {}): Post => ({
  id: 'p', order: 0, items: [{ category: 'MB', name: 'Board B', manualPhoto: '', nextPhoto: false }],
  company: '', priceBefore: '6,500', priceAfter: '5,899', style: 'Static', details: '', posterUrl: 'x', photoStatus: 'OK', feedback: '',
  postDate: '', postTime: '', scheduledFor: '', caption: 'cap', captionStyle: '', fbStatus: '', igStatus: '', fbPostId: '', createdAt: 0, offer: 'Approved', ...over,
})

group('history entries for app changes', () => {
  it('names offer decisions', () => {
    expect(describe(post({ offer: '' }), { offer: 'Approved', offerBy: 'A', offerNote: '' })?.act).toBe('offer.approved')
    expect(describe(post({ offer: '' }), { offer: 'Rejected', offerNote: 'too cheap' })).toEqual({ act: 'offer.rejected', note: 'too cheap' })
    expect(describe(post({ offer: 'Rejected' }), { offer: '' })?.act).toBe('offer.resubmitted')
  })
  it('names design and schedule decisions', () => {
    expect(describe(post(), { feedback: 'Done' })?.act).toBe('design.approved')
    expect(describe(post(), { feedback: 'Redo' })?.act).toBe('design.redo')
    expect(describe(post(), { feedback: 'ignore' })?.act).toBe('design.skipped')
    expect(describe(post({ feedback: 'Done' }), { feedback: 'Cancel' })?.act).toBe('schedule.cancel')
    expect(describe(post({ feedback: 'Done' }), { postDate: '2026-11-20', postTime: '17:00' })).toEqual({ act: 'schedule.set', note: '2026-11-20 17:00' })
    expect(describe(post({ feedback: 'Cancel' }), { postDate: '2026-11-20', postTime: '17:00', feedback: 'Done' })?.act).toBe('schedule.set')
  })
  it('lists what was edited, before and after', () => {
    const e = describe(post(), { priceAfter: '5,499', feedback: 'Redo' })
    expect(e?.act).toBe('design.redo')
    expect(e?.changes).toEqual([{ f: 'priceAfter', from: '5,899', to: '5,499' }])
    expect(describe(post(), { details: 'new' })).toEqual({ act: 'edited', changes: [{ f: 'details', from: '', to: 'new' }] })
    expect(describe(post(), { items: [{ category: 'MB', name: 'Board B', manualPhoto: 'http://p', nextPhoto: false }] })?.changes?.[0].f).toBe('photos')
    expect(describe(post(), { priceAfter: '5,899' })).toBeNull()
  })
  it('notes price checks and ignored problems', () => {
    expect(describe(post(), { marketAsk: 1 })?.act).toBe('prices.recheck')
    expect(describe(post(), { ignoredProblem: 'MISSING' })).toEqual({ act: 'problem.ignored', note: 'MISSING' })
  })
  it('only writes kinds the database accepts from the app', () => {
    const acts = [describe(post({ feedback: 'Done' }), { feedback: '' }), describe(post({ feedback: 'Done', postDate: 'a', postTime: 'b' }), { postDate: '', postTime: '' }), describeNew(post())].map((e) => e?.act)
    for (const a of acts) expect(APP_ACTS).toContain(a)
  })
  it('shows Cairo time', () => {
    expect(cairoTime(Date.UTC(2026, 10, 14, 12, 5, 9), 'en-GB')).toContain('14:05:09')
  })
})
