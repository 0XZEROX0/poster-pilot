import type { Backend } from './backend'
import { DEMO_POSTER, demoData } from './demo'
import { buildCaption, nextFreeSlot } from './logic'
import type { Data, Post } from './types'

const KEY = 'posterpilot.demo.v2'

/**
 * Demo mode: sample data kept in this browser, with a pretend engine so the buttons can be tried.
 * A new or redone poster is "built" after a few seconds, and an approved one gets the next free slot.
 * Nothing leaves the device and nothing is posted.
 */
export function createLocalBackend(): Backend {
  let data: Data = load()
  const listeners = new Set<(d: Data) => void>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

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
  const patchPost = (id: string, patch: Partial<Post>) => commit({ ...data, posts: data.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })

  /** What the real engine does after a change, a few seconds later. */
  function engine(id: string) {
    clearTimeout(timers.get(id))
    timers.set(id, setTimeout(() => {
      const p = data.posts.find((x) => x.id === id)
      if (!p) return
      if (p.feedback === 'Redo' || !p.posterUrl || !p.photoStatus) {
        patchPost(id, { posterUrl: DEMO_POSTER, photoStatus: 'OK', feedback: '', caption: p.caption || buildCaption(p, data.templates), items: p.items.map((i) => ({ ...i, nextPhoto: false })) })
      } else if (p.feedback === 'Done' && p.fbStatus !== 'Published') {
        const slot = p.postDate && p.postTime ? { date: p.postDate, time: p.postTime } : nextFreeSlot(data.posts.filter((x) => x.id !== id))
        patchPost(id, { scheduledFor: `${slot.date} ${slot.time}`, fbStatus: 'Scheduled', caption: p.caption || buildCaption(p, data.templates) })
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
      commit({ ...data, posts: [{ ...post, id, order, posterUrl: '', photoStatus: '', feedback: '', scheduledFor: '', caption: '', fbStatus: '', igStatus: '', fbPostId: '', createdAt: Date.now() }, ...data.posts] })
      engine(id)
    },
    async updatePost(id, patch) {
      const before = data.posts.find((p) => p.id === id)
      const next: Partial<Post> = { ...patch }
      // As in the sheet: a new decision or time on a scheduled post takes it off the schedule first.
      if (before && (patch.feedback !== undefined || patch.postDate !== undefined || patch.postTime !== undefined) && before.fbStatus !== 'Published') {
        next.scheduledFor = ''
        next.fbStatus = ''
      }
      if (patch.feedback === 'Redo') Object.assign(next, { photoStatus: '', posterUrl: '' })
      patchPost(id, next)
      engine(id)
    },
    async removePost(id) {
      commit({ ...data, posts: data.posts.filter((p) => p.id !== id) })
    },
    async saveTemplates(templates) {
      commit({ ...data, templates })
    },
  }
}

export function resetDemo() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
