import { getAuth } from 'firebase/auth'
import { myNameFor } from './profiles'
import { collection, deleteField, doc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch, type DocumentData, type Firestore, type WriteBatch } from 'firebase/firestore'
import { track } from './activity'
import type { Backend } from './backend'
import { describe, describeDelete, describeNew } from './history'
import { webAskFor } from './logic'
import { engineReachable, nudgeEngine, runEngineNow, type EngineJob } from './nudge'
import { emptyData, type CaptionTemplate, type Data, type Health, type LogEntry, type Post, type Product, type Results, type VersionPhotos } from './types'

// Firestore layout (the engine, n8n, reads and writes the same documents with a service account):
//   posts/{id}          one post; see Post in types.ts
//   catalog/products    { items: Product[] }
//   catalog/styles      { names: string[] }
//   catalog/templates   { items: CaptionTemplate[] }
//   status/engine       { lastSync: number, note: string }
//   status/results      { at, need, posts: { [postId]: { fb, ig, igLink, at } } }  Facebook/Instagram numbers, twice a day
//   config/access       { emails: string[] }   who may open the app (see firestore.rules)
//   log/{id}            one line of a post's history; see LogEntry in types.ts. Never changed or removed.
//
// Every change made in the app is also listed under the post's `appEdits` map, so the engine can
// tell what the person changed and carry it out. `appDirty` is true while something is waiting, so
// the engine can ask for just those posts. The engine removes each entry when it is done.

const APP_ONLY = new Set(['ignoredProblem', 'priceIgnored', 'offerNote', 'offerBy', 'marketAsk', 'photoAsk', 'storyDesign', 'takeDown', 'takeDownAt', 'takeDownBy', 'webAdd'])

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
    batch.set(doc(collection(db, 'log')), { ...entry, postId, by: me?.uid ?? '', byName: myNameFor(me), at: serverTimestamp() })
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
      // A role with no post pages at all (for example only Prices and Builder) reads no posts.
      const source = mine === null ? collection(db, 'posts') : mine.length ? query(collection(db, 'posts'), where('zone', 'in', mine)) : null
      if (!source) {
        got.posts = true
        push({ posts: [] })
      }
      const stops = [
        !source ? () => {} : onSnapshot(source, (snap) => {
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
        // One small document, written twice a day: costs one read per change. Only for roles that see posts.
        !source ? () => {} : onSnapshot(doc(db, 'status', 'results'), (snap) => push({ results: (snap.data() as Results | undefined) ?? null }), () => push({ results: null })),
      ]
      return () => stops.forEach((stop) => stop())
    },
    async addPost(post) {
      const ref = doc(collection(db, 'posts'))
      const me = getAuth(db.app).currentUser
      await commit((b) => b.set(ref, { ...blankPost, ...post, order: -Date.now(), createdAt: Date.now(), zone: 'offer', createdBy: me?.uid ?? '', createdByName: myNameFor(me), appNew: true, appDirty: true, appEditedAt: serverTimestamp() }), ref.id, describeNew(post))
      // A new offer gets its competitor prices at once; the competitor workflow's timer is only a slow fallback.
      // A text, photo or video post has no products to check.
      nudgeEngine(getAuth(db.app), post.kind ? ['app'] : ['app', 'market'])
      return ref.id
    },
    async updatePost(id, given) {
      // With "Also add to the website" on, a new price, product, approval or time brings the website product up to date.
      const webAsk = webAskFor(known.get(id), given)
      const patch: Partial<Post> = webAsk ? { ...given, webAdd: webAsk } : given
      const edits: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(patch)) {
        edits[key] = value
        // Fields only the app uses stay out of the engine's to-do list, which saves a sync round.
        if (!APP_ONLY.has(key)) edits[`appEdits.${key}`] = value
      }
      if (typeof patch.feedback === 'string' && /^redo/i.test(patch.feedback)) edits.retriedAt = Date.now()
      if (Object.keys(edits).some((k) => k.startsWith('appEdits.'))) Object.assign(edits, { appDirty: true, appEditedAt: serverTimestamp() })
      await commit((b) => b.update(doc(db, 'posts', id), edits), id, describe(known.get(id), patch))
      // Start what this change needs at once: the engine for post changes, the competitor price check for
      // "Check prices again", the website photo reader for the photo picker.
      const jobs: EngineJob[] = []
      if (edits.appDirty) jobs.push('app')
      // A changed offer (items or price) or one sent for approval again needs a new competitor check.
      if (!known.get(id)?.kind && (patch.marketAsk || patch.items || patch.priceBefore !== undefined || patch.priceAfter !== undefined || patch.offer === '')) jobs.push('market')
      if (patch.photoAsk) jobs.push('photos')
      // "Delete from Facebook and Instagram": its own workflow, started at once.
      if (patch.takeDown === 'asked') jobs.push('takedown')
      // "Also add to the website": its own workflow, started at once.
      if (patch.webAdd === 'asked' || patch.webAdd === 'remove') jobs.push('offerweb')
      if (jobs.length) nudgeEngine(getAuth(db.app), jobs)
    },
    async removePost(id) {
      // The engine removes the document after it has cancelled anything already scheduled.
      await commit((b) => b.update(doc(db, 'posts', id), { appDeleted: true, appDirty: true, appEditedAt: serverTimestamp(), appEdits: deleteField() }), id, describeDelete(known.get(id)))
      nudgeEngine(getAuth(db.app))
    },
    async saveTemplates(templates) {
      await setDoc(doc(db, 'catalog', 'templates'), { items: templates, appEditedAt: serverTimestamp() })
      track('settings', 'templates.saved', { note: templates.map((x) => x.name).join(', ') })
      // New captions, and scheduled posts whose caption changed, are handled at once.
      nudgeEngine(getAuth(db.app), ['captions', 'changes'])
    },
    ...(engineReachable() ? {
      runNow: async (jobs: EngineJob[]) => {
        const ok = await runEngineNow(getAuth(db.app), jobs)
        if (ok) track('settings', 'engine.run', { note: jobs.join(', ') })
        return ok
      },
    } : {}),
    versionPhotos(name, onData, onError) {
      // photoAsks/{uid}: one request per person, overwritten by the next one. The engine (Website photos workflow)
      // adds `choice` and `answered` and removes `ask`. Read only while the picker is open.
      const uid = getAuth(db.app).currentUser?.uid
      if (!uid) { onError('Not signed in'); return () => {} }
      const ref = doc(db, 'photoAsks', uid)
      const asked = Date.now()
      let stop = () => {}
      let stopped = false
      setDoc(ref, { name: name.slice(0, 300), ask: asked, by: uid })
        .then(() => {
          nudgeEngine(getAuth(db.app), ['photos'])
          if (stopped) return
          stop = onSnapshot(ref, (snap) => {
            const d = snap.data()
            if (!d || d.name !== name.slice(0, 300)) return onData(null)
            onData({ name, asked, answered: Number(d.answered) || 0, choice: (d.choice as VersionPhotos['choice']) ?? null })
          }, (e) => onError(e.message))
        })
        .catch((e: Error) => onError(e.message))
      return () => { stopped = true; stop() }
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
