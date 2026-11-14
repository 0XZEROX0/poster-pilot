import { getAuth } from 'firebase/auth'
import { collection, deleteField, doc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch, type DocumentData, type Firestore, type WriteBatch } from 'firebase/firestore'
import type { Backend } from './backend'
import { describe, describeDelete, describeNew } from './history'
import { emptyData, type CaptionTemplate, type Data, type Health, type LogEntry, type Post, type Product } from './types'

// Firestore layout (the engine, n8n, reads and writes the same documents with a service account):
//   posts/{id}          one post; see Post in types.ts
//   catalog/products    { items: Product[] }
//   catalog/styles      { names: string[] }
//   catalog/templates   { items: CaptionTemplate[] }
//   status/engine       { lastSync: number, note: string }
//   config/access       { emails: string[] }   who may open the app (see firestore.rules)
//   log/{id}            one line of a post's history; see LogEntry in types.ts. Never changed or removed.
//
// Every change made in the app is also listed under the post's `appEdits` map, so the engine can
// tell what the person changed and carry it out. `appDirty` is true while something is waiting, so
// the engine can ask for just those posts. The engine removes each entry when it is done.

const APP_ONLY = new Set(['ignoredProblem', 'offerNote', 'offerBy', 'marketAsk'])

const blankPost: Omit<Post, 'id'> = {
  order: 0, items: [], company: '', priceBefore: '', priceAfter: '', style: '', details: '', posterUrl: '', photoStatus: '', feedback: '',
  postDate: '', postTime: '', scheduledFor: '', caption: '', captionStyle: '', fbStatus: '', igStatus: '', fbPostId: '', createdAt: 0,
}

/** `zones` says which kinds of posts the person's role may read; null means all of them. */
export function createFirestoreBackend(db: Firestore, zones: () => string[] | null = () => null): Backend {
  // The posts as last seen, so a history entry can say what a field was before.
  let known = new Map<string, Post>()
  /**
   * Saves a change together with its history entry, in one step: both are saved, or neither.
   * If the database still has rules from before the history existed, the entry is refused; then the
   * change is saved on its own, so nothing stops working before the new rules are published.
   */
  const commit = async (write: (batch: WriteBatch) => void, postId: string, entry: Record<string, unknown> | null) => {
    const batch = writeBatch(db)
    write(batch)
    if (!entry) return batch.commit()
    const me = getAuth(db.app).currentUser
    batch.set(doc(collection(db, 'log')), { ...entry, postId, by: me?.uid ?? '', byName: me?.displayName || me?.email || '', at: serverTimestamp() })
    try {
      await batch.commit()
    } catch (e) {
      if ((e as { code?: string }).code !== 'permission-denied') throw e
      const alone = writeBatch(db)
      write(alone)
      await alone.commit()
    }
  }
  const toEntry = (id: string, d: DocumentData): LogEntry => ({ ...(d as Omit<LogEntry, 'id' | 'at'>), id, at: d.at?.toMillis?.() ?? Date.now() })
  return {
    subscribe(onData, onError) {
      let data: Data = emptyData
      const got = { posts: false, catalog: false }
      const push = (patch: Partial<Data>) => {
        data = { ...data, ...patch, loaded: got.posts && got.catalog }
        onData(data)
      }
      const fail = (e: Error) => onError(e.message)
      const mine = zones()
      // A limited role asks only for its own kinds of posts; the rules refuse anything wider.
      const source = mine === null ? collection(db, 'posts') : query(collection(db, 'posts'), where('zone', 'in', mine.length ? mine : ['-']))
      const stops = [
        onSnapshot(source, (snap) => {
          got.posts = true
          const posts = snap.docs
            .map((d) => ({ ...blankPost, ...d.data(), id: d.id }) as Post & { appDeleted?: boolean })
            .filter((p) => !p.appDeleted)
            .sort((a, b) => a.order - b.order || b.createdAt - a.createdAt)
          known = new Map(posts.map((p) => [p.id, p]))
          push({ posts })
        }, fail),
        onSnapshot(collection(db, 'catalog'), (snap) => {
          got.catalog = true
          const get = (id: string) => snap.docs.find((d) => d.id === id)?.data()
          push({
            products: (get('products')?.items as Product[] | undefined) ?? [],
            styles: (get('styles')?.names as string[] | undefined) ?? [],
            templates: (get('templates')?.items as CaptionTemplate[] | undefined) ?? [],
          })
        }, fail),
        onSnapshot(doc(db, 'status', 'engine'), (snap) => push({ health: (snap.data() as Health | undefined) ?? null }), fail),
      ]
      return () => stops.forEach((stop) => stop())
    },
    async addPost(post) {
      const ref = doc(collection(db, 'posts'))
      const me = getAuth(db.app).currentUser
      await commit((b) => b.set(ref, { ...blankPost, ...post, order: -Date.now(), createdAt: Date.now(), zone: 'offer', createdBy: me?.uid ?? '', createdByName: me?.displayName || me?.email || '', appNew: true, appDirty: true, appEditedAt: serverTimestamp() }), ref.id, describeNew(post))
    },
    async updatePost(id, patch) {
      const edits: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(patch)) {
        edits[key] = value
        // Fields only the app uses stay out of the engine's to-do list, which saves a sync round.
        if (!APP_ONLY.has(key)) edits[`appEdits.${key}`] = value
      }
      if (typeof patch.feedback === 'string' && /^redo/i.test(patch.feedback)) edits.retriedAt = Date.now()
      if (Object.keys(edits).some((k) => k.startsWith('appEdits.'))) Object.assign(edits, { appDirty: true, appEditedAt: serverTimestamp() })
      await commit((b) => b.update(doc(db, 'posts', id), edits), id, describe(known.get(id), patch))
    },
    async removePost(id) {
      // The engine removes the document after it has cancelled anything already scheduled.
      await commit((b) => b.update(doc(db, 'posts', id), { appDeleted: true, appDirty: true, appEditedAt: serverTimestamp(), appEdits: deleteField() }), id, describeDelete(known.get(id)))
    },
    async saveTemplates(templates) {
      await setDoc(doc(db, 'catalog', 'templates'), { items: templates, appEditedAt: serverTimestamp() })
    },
    watchLog(postId, onLog, onError) {
      // Read only while the history is open: a few reads per post, nothing in the background.
      return onSnapshot(query(collection(db, 'log'), where('postId', '==', postId), limit(300)),
        (snap) => onLog(snap.docs.map((d) => toEntry(d.id, d.data({ serverTimestamps: 'estimate' })))), (e) => onError(e.message))
    },
    async deletedLog() {
      const snap = await getDocs(query(collection(db, 'log'), where('act', 'in', ['deleted', 'removed', 'cleared']), limit(300)))
      return snap.docs.map((d) => toEntry(d.id, d.data()))
    },
  }
}
