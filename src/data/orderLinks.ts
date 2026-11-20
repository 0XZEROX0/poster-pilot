import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { firestore } from './firebase'
import { linkDoc, newToken, toLink, type LinkDraft, type OrderLink } from './orderLinkCore'
import { myNameFor } from './profiles'
import { waNumber } from './tickets'

export * from './orderLinkCore'

/** wa.me address that opens a chat with this phone and the message typed in (no phone: WhatsApp asks who to send it to). */
export const waLinkHref = (phone: string, text: string) => `https://wa.me/${phone.trim() ? waNumber(phone) : ''}?text=${encodeURIComponent(text)}`

// ---------- Staff side (signed in) ----------

export interface LinkBackend {
  /** Links made in the last two days, newest first. */
  watchRecent(onData: (list: OrderLink[]) => void, onError: (e: Error) => void): () => void
  create(d: LinkDraft): Promise<OrderLink>
  cancel(l: OrderLink): Promise<void>
  /** A link the website refused (or that got stuck) goes back to the engine. */
  retry(l: OrderLink): Promise<void>
}

function me() {
  const u = firestore ? getAuth(firestore.app).currentUser : null
  return { uid: u?.uid ?? 'demo-you', name: u ? myNameFor(u) : 'You' }
}

function firestoreLinks(fs: NonNullable<typeof firestore>): LinkBackend {
  const col = collection(fs, 'orderLinks')
  return {
    watchRecent(onData, onError) {
      const since = Timestamp.fromMillis(Date.now() - 2 * 86400_000)
      return onSnapshot(query(col, where('createdAt', '>', since), orderBy('createdAt', 'desc'), limit(40)), (snap) => onData(snap.docs.map((x) => toLink(x.id, x.data({ serverTimestamps: 'estimate' })))), onError)
    },
    async create(d) {
      const id = newToken()
      const now = Date.now()
      const data = linkDoc(d, me(), now)
      await setDoc(doc(col, id), { ...data, expiresAt: Timestamp.fromMillis(data.expiresAt), createdAt: serverTimestamp() })
      return toLink(id, { ...data, createdAt: now })
    },
    async cancel(l) {
      await updateDoc(doc(col, l.id), { state: 'cancelled', cancelledByName: me().name.slice(0, 200) })
    },
    async retry(l) {
      await updateDoc(doc(col, l.id), { state: 'filled', webError: '' })
    },
  }
}

// Demo mode: kept in memory for this visit.
let demo: OrderLink[] = []
const demoListeners = new Set<(l: OrderLink[]) => void>()
const demoPut = (list: OrderLink[]) => { demo = list; demoListeners.forEach((f) => f(demo)) }
function demoLinks(): LinkBackend {
  return {
    watchRecent(onData) { onData(demo); demoListeners.add(onData); return () => { demoListeners.delete(onData) } },
    async create(d) {
      const now = Date.now()
      const l = toLink(newToken(), { ...linkDoc(d, me(), now), createdAt: now })
      demoPut([l, ...demo])
      return l
    },
    async cancel(l) { demoPut(demo.map((x) => (x.id === l.id ? { ...x, state: 'cancelled', cancelledByName: 'You' } : x))) },
    async retry(l) { demoPut(demo.map((x) => (x.id === l.id ? { ...x, state: 'filled', webError: '' } : x))) },
  }
}

export const orderLinks: LinkBackend = firestore ? firestoreLinks(firestore) : demoLinks()
