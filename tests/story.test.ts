import { describe, expect, it } from 'vitest'
import { describe as describeChange } from '../src/data/history'
import { storyDelayOf, storyStateOf, storyTo, storyWhenOf } from '../src/data/logic'
import type { Post } from '../src/data/types'

const post = (over: Partial<Post> = {}): Post => ({
  id: 'p', order: 0, items: [{ category: 'MB', name: 'Asus Prime B650M-A II CSM', manualPhoto: '', nextPhoto: false }],
  company: '', priceBefore: '6,500', priceAfter: '', style: 'Static', details: '', posterUrl: 'https://x/poster.png',
  photoStatus: 'OK', feedback: 'Done', postDate: '2026-11-20', postTime: '23:30', scheduledFor: '', caption: '', captionStyle: '', fbStatus: '', igStatus: '', fbPostId: '', createdAt: 0, ...over,
})

describe('stories', () => {
  it('knows where the story goes', () => {
    expect(storyTo(post({ story: 'fb+ig' }), 'fb')).toBe(true)
    expect(storyTo(post({ story: 'ig' }), 'fb')).toBe(false)
    expect(storyTo(post(), 'ig')).toBe(false)
  })
  it('works out the story time, across midnight', () => {
    expect(storyWhenOf(post())).toBeNull()
    expect(storyWhenOf(post({ story: 'fb' }))).toEqual({ date: '2026-11-20', time: '23:30' })
    expect(storyWhenOf(post({ story: 'fb', storyDelay: '60' }))).toEqual({ date: '2026-11-21', time: '00:30' })
    expect(storyWhenOf(post({ story: 'fb', postDate: '', postTime: '' }))).toBeNull()
    expect(storyDelayOf({ storyDelay: 'x' })).toBe(0)
    expect(storyDelayOf({ storyDelay: '-5' })).toBe(0)
  })
  it('reads the engine statuses', () => {
    expect(storyStateOf(post({ story: 'fb+ig' }), 'fb').state).toBe('waiting')
    expect(storyStateOf(post({ story: 'fb+ig', storyFbStatus: 'Posted' }), 'fb').state).toBe('posted')
    expect(storyStateOf(post({ story: 'fb+ig', storyIgStatus: 'Instagram error: (#9004) bad image' }), 'ig')).toEqual({ state: 'failed', text: 'Instagram error: (#9004) bad image' })
    expect(storyStateOf(post({ story: 'ig', storyFbStatus: 'Posted' }), 'fb').state).toBe('off')
  })
  it('logs a story choice as an edit (accepted by older rules)', () => {
    expect(describeChange(post(), { story: 'fb+ig', storyDelay: '30' })).toEqual({ act: 'edited', changes: [{ f: 'story', from: '-', to: 'Facebook + Instagram' }, { f: 'storyDelay', from: 'same time', to: '+30 min' }] })
    expect(describeChange(post({ story: 'fb' }), { story: 'fb' })).toBeNull()
  })
})
