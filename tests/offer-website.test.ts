import { describe, expect, it } from 'vitest'
import { describe as describeChange } from '../src/data/history'
import { webAskFor, webOn, webStateOf } from '../src/data/logic'
import type { Post } from '../src/data/types'

describe('Also add to the website', () => {
  it('is on for every state but off, remove and removed', () => {
    expect(webOn({})).toBe(false)
    expect(webOn({ webAdd: '' })).toBe(false)
    expect(webOn({ webAdd: 'remove' })).toBe(false)
    expect(webOn({ webAdd: 'removed' })).toBe(false)
    for (const s of ['asked', 'working', 'waiting', 'scheduled', 'live', 'failed'] as const) expect(webOn({ webAdd: s })).toBe(true)
  })
  it('asks again when a change the website product follows is saved', () => {
    expect(webAskFor({ webAdd: 'live' }, { priceAfter: '9,999' })).toBe('asked')
    expect(webAskFor({ webAdd: 'scheduled' }, { postDate: '2026-11-25', postTime: '18:00' })).toBe('asked')
    expect(webAskFor({ webAdd: 'waiting' }, { feedback: 'Done' })).toBe('asked')
    expect(webAskFor({ webAdd: 'scheduled' }, { postNow: 'yes' })).toBe('asked')
  })
  it('leaves it alone otherwise', () => {
    expect(webAskFor(undefined, { priceAfter: '1' })).toBeUndefined()
    expect(webAskFor({ webAdd: '' }, { priceAfter: '1' })).toBeUndefined()
    expect(webAskFor({ webAdd: 'removed' }, { priceAfter: '1' })).toBeUndefined()
    expect(webAskFor({ webAdd: 'asked' }, { priceAfter: '1' })).toBeUndefined()
    expect(webAskFor({ webAdd: 'live' }, { caption: 'x' })).toBeUndefined()
    expect(webAskFor({ webAdd: 'live' }, { webAdd: 'remove' })).toBeUndefined()
    expect(webAskFor({ webAdd: 'live', kind: 'image' }, { postDate: '2026-11-25' })).toBeUndefined()
  })
  it('says where it stands', () => {
    expect(webStateOf({ webAdd: 'live' })?.tone).toBe('good')
    expect(webStateOf({ webAdd: 'failed' })?.tone).toBe('bad')
    expect(webStateOf({})).toBeNull()
  })
  it('logs turning it on and off', () => {
    const before = { id: 'p', items: [], webAdd: '' } as unknown as Post
    expect(describeChange(before, { webAdd: 'asked' })?.act).toBe('website.add')
    expect(describeChange({ ...before, webAdd: 'live' }, { webAdd: 'remove' })?.act).toBe('website.remove')
    expect(describeChange({ ...before, webAdd: 'live' }, { webAdd: 'asked', priceAfter: '1' })?.act).toBe('edited')
  })
})
