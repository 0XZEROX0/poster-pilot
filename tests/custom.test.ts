import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { describeNew } from '../src/data/history'
import { isBuilding, offerOf, placesOf, stageOf, titleOf } from '../src/data/logic'
import type { Post } from '../src/data/types'

// Text, photo and video posts (post.kind): the app's stages and the engine's zone and queue rules (n8n/direct/lib.js).

const post = (over: Partial<Post> = {}): Post => ({
  id: 'c', order: 0, items: [], company: '', priceBefore: '', priceAfter: '', style: '', details: '', posterUrl: '', photoStatus: '',
  feedback: '', postDate: '', postTime: '', scheduledFor: '', caption: 'Open today until 11 PM\nCome by', captionStyle: '', fbStatus: '', igStatus: '',
  fbPostId: '', createdAt: 0, kind: 'image', media: [{ id: 'A'.repeat(33), type: 'image' }], places: 'fb+ig', offer: '', appNew: true, ...over,
})

type Lib = {
  zoneOf: (f: Record<string, unknown>) => string
  queuesOf: (f: Record<string, unknown>) => string[]
  placesOf: (f: Record<string, unknown>) => string[]
  isFail: (s: string) => boolean
}
const lib = (() => {
  const m = { exports: {} as Lib }
  new Function('module', readFileSync(new URL('../n8n/direct/lib.js', import.meta.url), 'utf8'))(m)
  return m.exports
})()

describe('text, photo and video posts in the app', () => {
  it('skip the offer and the poster', () => {
    expect(offerOf(post())).toBe(null)
    expect(isBuilding(post())).toBe(false)
    expect(stageOf(post())).toBe('review')
    expect(stageOf(post({ feedback: 'Done' }))).toBe('scheduled')
    expect(stageOf(post({ feedback: 'ignore' }))).toBe('skipped')
  })
  it('are posted only when every place has it', () => {
    expect(stageOf(post({ feedback: 'Done', fbStatus: 'Published' }))).toBe('scheduled')
    expect(stageOf(post({ feedback: 'Done', fbStatus: 'Published', igStatus: 'Published 2026-11-17 20:00 (1789)' }))).toBe('posted')
    expect(stageOf(post({ feedback: 'Done', places: 'ig', igStatus: 'Published 2026-11-17 20:00 (1789)' }))).toBe('posted')
    expect(stageOf(post({ kind: 'text', places: undefined, feedback: 'Done', fbStatus: 'Published' }))).toBe('posted')
  })
  it('show a Facebook or Instagram error as a problem', () => {
    expect(stageOf(post({ feedback: 'Done', fbStatus: 'Facebook error: bad time' }))).toBe('fix')
    expect(stageOf(post({ feedback: 'Done', igStatus: 'Instagram error: ratio' }))).toBe('fix')
    expect(stageOf(post({ feedback: 'Done', igStatus: 'Posting - Instagram is getting it ready' }))).toBe('scheduled')
  })
  it('go to Facebook only when they are text', () => {
    expect(placesOf(post({ kind: 'text', places: 'fb+ig' }))).toEqual(['fb'])
    expect(placesOf(post({ places: undefined }))).toEqual(['fb', 'ig'])
    expect(placesOf(post({ places: 'ig' }))).toEqual(['ig'])
  })
  it('are named by the first line of the caption', () => {
    expect(titleOf(post())).toBe('Open today until 11 PM')
    expect(titleOf(post({ caption: '' }))).toBe('Photo post')
    expect(describeNew(post({ kind: 'video', caption: '' })).title).toBe('Video post')
  })
})

describe('text, photo and video posts in the engine (lib.js)', () => {
  const f = (over: Record<string, unknown> = {}) => ({ kind: 'image', media: [{ id: 'x', type: 'image' }], places: 'fb+ig', caption: 'x', feedback: '', offer: '', ...over })
  it('have their own zones', () => {
    expect(lib.zoneOf(f())).toBe('design')
    expect(lib.zoneOf(f({ feedback: 'Done' }))).toBe('approved')
    expect(lib.zoneOf(f({ feedback: 'Done', fbStatus: 'Facebook error: x' }))).toBe('fix')
    expect(lib.zoneOf(f({ feedback: 'Done', fbStatus: 'Published', igStatus: 'Published 2026-11-17 20:00 (1)' }))).toBe('posted')
    expect(lib.zoneOf(f({ feedback: 'Done', fbStatus: 'Published', takeDown: 'done' }))).toBe('posted')
  })
  it('wait in the custom queue only while there is something to send', () => {
    expect(lib.queuesOf(f())).toEqual([])
    expect(lib.queuesOf(f({ feedback: 'Done' }))).toEqual([]) // no time yet
    expect(lib.queuesOf(f({ feedback: 'Done', postDate: '2026-11-20', postTime: '18:00' }))).toEqual(['custom'])
    expect(lib.queuesOf(f({ feedback: 'Done', postNow: 'yes' }))).toEqual(['custom'])
    expect(lib.queuesOf(f({ feedback: 'Cancel' }))).toEqual(['custom'])
    expect(lib.queuesOf(f({ feedback: 'Done', postDate: '2026-11-20', postTime: '18:00', fbPostId: '1_2', fbStatus: 'Scheduled' }))).toEqual(['custom'])
    expect(lib.queuesOf(f({ feedback: 'Done', postDate: '2026-11-20', postTime: '18:00', fbStatus: 'Published', igStatus: 'Published 2026-11-20 18:00 (1)' }))).toEqual([])
    expect(lib.queuesOf(f({ feedback: 'Done', postDate: '2026-11-20', postTime: '18:00', fbStatus: 'Facebook error: x', igStatus: 'Instagram error: y' }))).toEqual([])
    expect(lib.queuesOf(f({ feedback: 'Done', postDate: '2026-11-20', postTime: '18:00', ex: { igContainer: '9' } }))).toEqual(['custom'])
    expect(lib.queuesOf(f({ feedback: 'Done', postDate: '2026-11-20', postTime: '18:00', takeDown: 'asked' }))).toEqual([])
  })
  it('leave product posts as they were', () => {
    const product = { offer: 'Approved', items: [{ name: 'Lux 750', category: 'PSU' }], feedback: '', posterUrl: '' }
    expect(lib.zoneOf(product)).toBe('design')
    expect(lib.queuesOf(product)).toEqual(['poster', 'caption'])
  })
  it('tell a problem from a status that is fine', () => {
    for (const ok of ['', 'Scheduled', 'Published', 'Cancelled', 'Waiting for Post date and Post time', 'Posting - Instagram is getting it ready']) expect(lib.isFail(ok)).toBe(false)
    expect(lib.isFail('Facebook error: the time must be at least 15 minutes from now')).toBe(true)
  })
})
