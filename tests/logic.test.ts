import { describe, expect, it } from 'vitest'
import { buildCaption, hasOffer, nextFreeSlot, previewUrl, problemOf, stageOf, whenOf } from '../src/data/logic'
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
    expect(whenOf(post({ scheduledFor: '2026-11-10 12:00', postDate: '2026-11-11', postTime: '09:00' }))).toEqual({ date: '2026-11-10', time: '12:00' })
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
