import { getAuth } from 'firebase/auth'
import { collection, deleteField, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore'
import type { Backend } from './backend'
import { emptyData, type CaptionTemplate, type Data, type Health, type Post, type Product } from './types'

// Firestore layout (the engine, n8n, reads and writes the same documents with a service account):
//   posts/{id}          one post; see Post in types.ts
//   catalog/products    { items: Product[] }
//   catalog/styles      { names: string[] }
//   catalog/templates   { items: CaptionTemplate[] }
//   status/engine       { lastSync: number, note: string }
//   config/access       { emails: string[] }   who may open the app (see firestore.rules)
//
// Every change made in the app is also listed under the post's `appEdits` map, so the engine can
// tell what the person changed and carry it out. `appDirty` is true while something is waiting, so
// the engine can ask for just those posts. The engine removes each entry when it is done.

const APP_ONLY = new Set(['ignoredProblem'])

const blankPost: Omit<Post, 'id'> = {
  order: 0, items: [], company: '', priceBefore: '', priceAfter: '', style: '', details: '', posterUrl: '', photoStatus: '', feedback: '',
  postDate: '', postTime: '', scheduledFor: '', caption: '', captionStyle: '', fbStatus: '', igStatus: '', fbPostId: '', createdAt: 0,
}

export function createFirestoreBackend(db: Firestore): Backend {
  return {
    subscribe(onData, onError) {
      let data: Data = emptyData
      const got = { posts: false, catalog: false }
      const push = (patch: Partial<Data>) => {
        data = { ...data, ...patch, loaded: got.posts && got.catalog }
        onData(data)
      }
      const fail = (e: Error) => onError(e.message)
      const stops = [
        onSnapshot(collection(db, 'posts'), (snap) => {
          got.posts = true
          const posts = snap.docs
            .map((d) => ({ ...blankPost, ...d.data(), id: d.id }) as Post & { appDeleted?: boolean })
            .filter((p) => !p.appDeleted)
            .sort((a, b) => a.order - b.order || b.createdAt - a.createdAt)
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
      await setDoc(ref, { ...blankPost, ...post, order: -Date.now(), createdAt: Date.now(), createdBy: me?.uid ?? '', createdByName: me?.displayName || me?.email || '', appNew: true, appDirty: true, appEditedAt: serverTimestamp() })
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
      await updateDoc(doc(db, 'posts', id), edits)
    },
    async removePost(id) {
      // The engine removes the document after it has cancelled anything already scheduled.
      await updateDoc(doc(db, 'posts', id), { appDeleted: true, appDirty: true, appEditedAt: serverTimestamp(), appEdits: deleteField() })
    },
    async saveTemplates(templates) {
      await setDoc(doc(db, 'catalog', 'templates'), { items: templates, appEditedAt: serverTimestamp() })
    },
  }
}
