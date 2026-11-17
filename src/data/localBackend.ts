import type { Backend } from './backend'
import { DEMO_POSTER, demoData, demoPhotoChoices, demoVersionPhotos } from './demo'
import { describe, describeDelete, describeNew } from './history'
import { buildCaption, cairoNow, storyTo } from './logic'
import type { Data, LogEntry, Post } from './types'

const KEY = 'posterpilot.demo.v2'
const LOG_KEY = 'posterpilot.demo.log'

/**
 * Demo mode: sample data kept in this browser, with a pretend engine so the buttons can be tried.
 * A new or redone poster is "built" after a few seconds, and an approved one gets the next free slot.
 * Nothing leaves the device and nothing is posted.
 */
export function createLocalBackend(): Backend {
  let data: Data = load()
  const listeners = new Set<(d: Data) => void>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let log: LogEntry[] = loadLog()
  const logListeners = new Set<() => void>()

  function loadLog(): LogEntry[] {
    try {
      return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') as LogEntry[]
    } catch {
      return []
    }
  }
  /** Demo history: the person is 'You', the pretend engine is the system. */
  function note(postId: string, entry: Omit<LogEntry, 'id' | 'postId' | 'at' | 'by' | 'byName'> | null, by = 'demo-you', byName = 'You') {
    if (!entry) return
    log = [...log, { ...entry, id: `l${Date.now()}${Math.random().toString(36).slice(2, 6)}`, postId, at: Date.now(), by, byName }].slice(-500)
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(log))
    } catch {
      // The history then lasts until the page is closed.
    }
    logListeners.forEach((l) => l())
  }
  const system = (postId: string, act: string, extra: Partial<LogEntry> = {}) => note(postId, { act, ...extra }, 'system', '')

  function load(): Data {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return { ...demoData(), ...(JSON.parse(raw) as Partial<Data>), loaded: true }
    } catch {
      // Private mode or a damaged copy: start again from the sample.
    }
    return demoData()
  }
  function commit(next: Data) {
    data = next
    try {
      localStorage.setItem(KEY, JSON.stringify({ posts: data.posts, templates: data.templates }))
    } catch {
      // Storage is full or blocked: the demo still works until the page is closed.
    }
    listeners.forEach((l) => l(data))
  }
  /** The demo's story statuses: each place the story goes gets `state` unless it was posted already. */
  const demoStory = (p: Post, state: 'Waiting' | 'Posted'): Partial<Post> => {
    const out: Partial<Post> = {}
    if (storyTo(p, 'fb') && p.storyFbStatus !== 'Posted') out.storyFbStatus = state
    if (storyTo(p, 'ig') && p.storyIgStatus !== 'Posted') out.storyIgStatus = state
    return out
  }
  const patchPost = (id: string, patch: Partial<Post>) => commit({ ...data, posts: data.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })

  /** What the real engine does after a change, a few seconds later. */
  function engine(id: string) {
    clearTimeout(timers.get(id))
    timers.set(id, setTimeout(() => {
      const p = data.posts.find((x) => x.id === id)
      if (!p) return
      // No poster is made for an offer nobody approved yet.
      if (p.offer === '' || p.offer === 'Rejected') return
      if (p.takeDown === 'asked') {
        // Delete from Facebook and Instagram: gone from both.
        const now = cairoNow()
        patchPost(id, { takeDown: 'done', takeDownNote: `Facebook: removed. Instagram: removed. ${now.date} ${now.time}`, igStatus: `Removed from Instagram ${now.date} ${now.time}` })
        system(id, 'fb.removed')
        system(id, 'ig.removed')
        return
      }
      if (!p.kind && (p.feedback === 'Redo' || !p.posterUrl || !p.photoStatus)) {
        patchPost(id, { posterUrl: DEMO_POSTER, photoStatus: 'OK', feedback: '', caption: p.caption || buildCaption(p, data.templates), items: p.items.map((i) => ({ ...i, nextPhoto: false })) })
        system(id, 'poster.built')
      } else if (p.feedback === 'Done' && p.postNow === 'yes' && !p.fbPostId) {
        // Post now: published at once, at the real minute.
        const now = cairoNow()
        patchPost(id, { postNow: '', postDate: now.date, postTime: now.time, scheduledFor: `${now.date} ${now.time}`, fbStatus: 'Published', igStatus: 'Published', fbPostId: 'demo', caption: p.caption || buildCaption(p, data.templates), ...demoStory(p, 'Posted') })
        system(id, 'fb.published')
      } else if (p.feedback === 'Done' && p.fbStatus !== 'Published') {
        // Nothing is scheduled without a date and a time.
        if (p.postDate && p.postTime) {
          patchPost(id, { scheduledFor: `${p.postDate} ${p.postTime}`, fbStatus: 'Scheduled', caption: p.caption || buildCaption(p, data.templates), ...demoStory(p, 'Waiting') })
          system(id, 'fb.scheduled', { note: `${p.postDate} ${p.postTime}` })
        }
        else patchPost(id, { fbStatus: 'Waiting for Post date and Post time' })
      } else if (p.fbStatus === 'Published' && p.story) {
        // A story asked for after the post went out goes out at once.
        patchPost(id, demoStory(p, 'Posted'))
      } else if (p.feedback === 'Cancel') {
        patchPost(id, { feedback: 'Done', postDate: '', postTime: '', scheduledFor: '', fbStatus: 'Waiting for Post date and Post time', fbPostId: '' })
        system(id, 'fb.cancelled')
      }
    }, 2500))
  }

  return {
    subscribe(onData) {
      listeners.add(onData)
      onData(data)
      return () => listeners.delete(onData)
    },
    async addPost(post) {
      const id = `local-${Date.now()}`
      const order = Math.min(0, ...data.posts.map((p) => p.order)) - 1
      note(id, describeNew(post))
      // A text, photo or video post keeps its caption and has no offer to approve.
      commit({ ...data, posts: [{ ...post, id, order, posterUrl: '', photoStatus: '', feedback: '', scheduledFor: '', caption: post.kind ? post.caption ?? '' : '', fbStatus: '', igStatus: '', fbPostId: '', createdAt: Date.now(), ...(post.kind ? {} : { offer: '' as const }), createdBy: 'demo-maker', createdByName: 'Demo maker' }, ...data.posts] })
      engine(id)
      return id
    },
    async updatePost(id, patch) {
      const before = data.posts.find((p) => p.id === id)
      note(id, describe(before, patch))
      const next: Partial<Post> = { ...patch }
      // As in the sheet: a new decision or time on a scheduled post takes it off the schedule first.
      if (before && (patch.feedback !== undefined || patch.postDate !== undefined || patch.postTime !== undefined) && before.fbStatus !== 'Published') {
        next.scheduledFor = ''
        next.fbStatus = ''
      }
      if (patch.feedback === 'Redo') Object.assign(next, { photoStatus: '', posterUrl: '' })
      patchPost(id, next)
      if (patch.photoAsk) setTimeout(() => {
        const p = data.posts.find((x) => x.id === id)
        if (p) patchPost(id, { photoAsk: undefined, photoChoices: demoPhotoChoices(p, patch.photoAsk ?? 0) })
      }, 1500)
      else engine(id)
    },
    versionPhotos(name, onData) {
      onData({ name, asked: Date.now(), answered: 0, choice: null })
      const id = setTimeout(() => onData({ name, asked: Date.now(), answered: Date.now(), choice: demoVersionPhotos(name) }), 1500)
      return () => clearTimeout(id)
    },
    async removePost(id) {
      note(id, describeDelete(data.posts.find((p) => p.id === id)))
      commit({ ...data, posts: data.posts.filter((p) => p.id !== id) })
    },
    async saveTemplates(templates) {
      commit({ ...data, templates })
    },
    watchLog(postId, onLog) {
      const send = () => onLog(log.filter((e) => e.postId === postId))
      logListeners.add(send)
      send()
      return () => logListeners.delete(send)
    },
    async deletedLog() {
      return log.filter((e) => e.act === 'deleted')
    },
  }
}

export function resetDemo() {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(LOG_KEY)
  } catch {
    // Nothing to clear.
  }
}
