import { describe, expect, it } from 'vitest'
import { buildCaption, hasOffer, nextFreeSlot, previewUrl, problemOf, stageOf, whenOf, duplicatesOf, matchesSearch } from '../src/data/logic'
import type { Post } from '../src/data/types'

const post = (over: Partial<Post> = {}): Post => ({
  id: 'p', order: 0, items: [{ category: 'MB', name: 'Asus Prime B650M-A II CSM', manualPhoto: '', nextPhoto: false }],
  company: 'Asus Prime', priceBefore: '6,500', priceAfter: '5,899', style: 'Static', details: '', posterUrl: 'https://x/poster.png',
  photoStatus: 'OK', feedback: '', postDate: '', postTime: '', scheduledFor: '', caption: '', captionStyle: '', fbStatus: '', igStatus: '', fbPostId: '', createdAt: 0, ...over,
})

describe('stageOf', () => {
  it('walks a post through its life', () => {
    expect(stageOf(post({ posterUrl: '', photoStatus: '' }))).toBe('building')
    expect(stageOf(post())).toBe('review')
    expect(stageOf(post({ feedback: 'Redo' }))).toBe('building')
    expect(stageOf(post({ feedback: 'Done' }))).toBe('scheduled')
    expect(stageOf(post({ feedback: 'Done', fbStatus: 'Scheduled' }))).toBe('scheduled')
    expect(stageOf(post({ feedback: 'Done', fbStatus: 'Published' }))).toBe('posted')
    expect(stageOf(post({ feedback: 'ignore' }))).toBe('skipped')
  })
  it('sends problems to Fix', () => {
    expect(stageOf(post({ photoStatus: 'MISSING' }))).toBe('fix')
    expect(problemOf(post({ photoStatus: 'MISSING' }))?.kind).toBe('photo')
    expect(problemOf(post({ photoStatus: 'BACKGROUND NOT FOUND - ADD Summer' }))?.kind).toBe('background')
    expect(problemOf(post({ photoStatus: 'AI ERROR' }))?.kind).toBe('ai')
    expect(problemOf(post({ feedback: 'Done', fbStatus: 'Time must be 15 minutes ahead' }))?.kind).toBe('facebook')
    expect(problemOf(post())).toBeNull()
  })
})

describe('buildCaption', () => {
  const templates = [
    { name: 'Default', text: '🔵 {name}\n🟠 {price} EGP\n{details}\nwww.static-eg.com' },
    { name: 'black friday', text: '🔵 {name}\n❌ قبل: {before} EGP\n✅ دلوقتي: {price} EGP' },
  ]
  it('fills the default template and drops empty lines', () => {
    expect(buildCaption(post(), templates)).toBe('🔵 Asus Prime B650M-A II CSM\n🟠 5,899 EGP\nwww.static-eg.com')
  })
  it('joins items and matches the style without caring about case', () => {
    const p = post({ captionStyle: 'Black Friday', items: [...post().items, { category: 'CPU', name: 'AMD Ryzen 5 7500F Tray', manualPhoto: '', nextPhoto: false }] })
    expect(buildCaption(p, templates)).toBe('🔵 Asus Prime B650M-A II CSM + AMD Ryzen 5 7500F Tray\n❌ قبل: 6,500 EGP\n✅ دلوقتي: 5,899 EGP')
  })
  it('drops the before line when there is no real offer', () => {
    expect(buildCaption(post({ captionStyle: 'black friday', priceAfter: '' }), templates)).toBe('🔵 Asus Prime B650M-A II CSM\n✅ دلوقتي: 6,500 EGP')
    expect(hasOffer(post({ priceBefore: '8,900', priceAfter: '9,000' }))).toBe(false)
  })
})

describe('slots', () => {
  it('reads the scheduled time first', () => {
    expect(whenOf(post({ scheduledFor: '2026-11-10 12:00', postDate: '2026-11-11', postTime: '09:00' }))).toEqual({ date: '2026-11-11', time: '09:00' })
    expect(whenOf(post({ scheduledFor: '2026-11-10 12:00', postDate: '2026-11-11', postTime: '09:00', fbStatus: 'Published' }))).toEqual({ date: '2026-11-10', time: '12:00' })
    expect(whenOf(post({ scheduledFor: '2026-11-10 12:00' }))).toEqual({ date: '2026-11-10', time: '12:00' })
    expect(whenOf(post())).toBeNull()
  })
  it('gives the next free slot of five a day from 17:00', () => {
    const now = { date: '2026-11-12', time: '10:00' }
    expect(nextFreeSlot([], now)).toEqual({ date: '2026-11-12', time: '17:00' })
    const taken = ['17:00', '17:15', '17:30', '17:45', '18:00'].map((t) => post({ scheduledFor: `2026-11-12 ${t}` }))
    expect(nextFreeSlot(taken.slice(0, 2), now)).toEqual({ date: '2026-11-12', time: '17:30' })
    expect(nextFreeSlot(taken, now)).toEqual({ date: '2026-11-13', time: '17:00' })
    expect(nextFreeSlot([], { date: '2026-11-12', time: '16:50' })).toEqual({ date: '2026-11-12', time: '17:15' })
  })
})

describe('previewUrl', () => {
  it('turns a Drive link into an image link', () => {
    expect(previewUrl('https://drive.google.com/file/d/1XhnKc3qCu8Aw/view')).toBe('https://lh3.googleusercontent.com/d/1XhnKc3qCu8Aw=w900')
    expect(previewUrl('https://static-eg.com/a.png')).toBe('https://static-eg.com/a.png')
  })
})

describe('sheet status words', () => {
  const base = { id: 'x', order: 1, items: [{ category: 'MB', name: 'Board', manualPhoto: '', nextPhoto: false }], company: '', priceBefore: '100', priceAfter: '', style: 'Static', details: '', posterUrl: 'https://drive.google.com/file/d/A/view', photoStatus: 'OK', feedback: '' as const, postDate: '', postTime: '', scheduledFor: '', caption: '', captionStyle: '', fbStatus: '', igStatus: '', fbPostId: '', createdAt: 0 }
  it('treats a row the engine is working on as building, not as a problem', () => {
    expect(stageOf({ ...base, photoStatus: 'WORKING 2026-11-13T08:00:00.000Z' })).toBe('building')
    expect(stageOf({ ...base, photoStatus: 'PHOTO FOUND' })).toBe('building')
  })
  it('treats a pending redo as building even when the old error is still shown', () => {
    expect(stageOf({ ...base, photoStatus: 'AI ERROR - SEE RUN', feedback: 'Redo', retriedAt: Date.now() })).toBe('building')
    expect(stageOf({ ...base, feedback: 'Redo next image' })).toBe('building')
  })
  it('keeps real problems in Fix', () => {
    expect(stageOf({ ...base, posterUrl: '', photoStatus: 'MISSING' })).toBe('fix')
    expect(stageOf({ ...base, feedback: 'Done', fbStatus: 'Error: 400 - bad' })).toBe('fix')
  })
})

describe('ignoring an error', () => {
  it('hides the problem until its text changes', () => {
    const p = post({ feedback: 'Done', fbStatus: 'Error: 400 - bad', ignoredProblem: 'Error: 400 - bad' })
    expect(problemOf(p)).toBeNull()
    expect(stageOf(p)).toBe('scheduled')
    expect(stageOf({ ...p, fbStatus: 'Error: 500 - other' })).toBe('fix')
  })
  it('parks a post that has no poster', () => {
    expect(stageOf(post({ posterUrl: '', photoStatus: 'MISSING', ignoredProblem: 'MISSING' }))).toBe('skipped')
  })
})

describe('search and duplicates', () => {
  const a = post({ id: 'a', items: [{ category: 'MB', name: 'Board B', manualPhoto: '', nextPhoto: false }] })
  const b = post({ id: 'b', items: [{ category: 'MB', name: 'board  b', manualPhoto: '', nextPhoto: false }, { category: 'CPU', name: 'Chip C', manualPhoto: '', nextPhoto: false }] })
  it('finds posts by words of the item name', () => {
    expect(matchesSearch(b, 'chip board')).toBe(true)
    expect(matchesSearch(a, 'chip')).toBe(false)
    expect(matchesSearch(a, '  ')).toBe(true)
  })
  it('tells an exact repeat from a shared item', () => {
    expect(duplicatesOf(['Board B'], [a, b])).toEqual({ same: [a], partly: [b] })
    expect(duplicatesOf(['Chip C', 'Board B'], [a, b])).toEqual({ same: [b], partly: [a] })
    expect(duplicatesOf(['Other'], [a, b])).toEqual({ same: [], partly: [] })
  })
})

describe('a redo that fails again', () => {
  const stuck = post({ posterUrl: '', photoStatus: 'MISSING', feedback: 'Redo' })
  it('goes back to Fix once the retry has had its time', () => {
    expect(stageOf(stuck)).toBe('fix')
    expect(stageOf({ ...stuck, retriedAt: Date.now() })).toBe('building')
    expect(stageOf({ ...stuck, photoStatus: 'WORKING 2026-11-13T09:00:00Z' })).toBe('building')
  })
  it('leaves a redo of a good poster as building', () => {
    expect(stageOf(post({ feedback: 'Redo' }))).toBe('building')
  })
})

describe('waiting and cancelled posts', () => {
  it('are not problems', () => {
    expect(stageOf(post({ feedback: 'Done', fbStatus: 'Waiting for Post date and Post time' }))).toBe('scheduled')
    expect(stageOf(post({ feedback: '', fbStatus: 'Cancelled' }))).toBe('review')
    expect(stageOf(post({ feedback: 'Cancel', fbStatus: 'Scheduled', scheduledFor: '2026-11-20 17:00' }))).toBe('review')
  })
})
