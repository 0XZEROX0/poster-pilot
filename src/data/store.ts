import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth'
import { useSyncExternalStore } from 'react'
import type { Backend } from './backend'
import { auth, firebaseConfigured, firestore } from './firebase'
import { createFirestoreBackend } from './firestoreBackend'
import { createLocalBackend } from './localBackend'
import { emptyData, type Data } from './types'

export type Session = {
  /** 'demo' when Firebase is not configured; then nobody signs in. */
  mode: 'demo' | 'cloud'
  /** undefined while Firebase is still working out who is signed in. */
  user: User | null | undefined
  data: Data
  error: string
}

let state: Session = { mode: firebaseConfigured ? 'cloud' : 'demo', user: firebaseConfigured ? undefined : null, data: emptyData, error: '' }
const listeners = new Set<() => void>()
const set = (patch: Partial<Session>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export let backend: Backend
let stop = () => {}

function listen() {
  stop()
  stop = backend.subscribe(
    (data) => set({ data, error: '' }),
    (message) => set({ error: message }),
  )
}

if (firebaseConfigured && auth && firestore) {
  backend = createFirestoreBackend(firestore)
  onAuthStateChanged(auth, (user) => {
    set({ user, data: emptyData, error: '' })
    if (user) listen()
    else stop()
  })
  // Every change that reaches an open listener counts against the database's free daily reads.
  // So the app stops listening a minute after it goes to the background and picks up again when it
  // is shown. What is on screen stays, and the offline cache makes coming back cheap.
  let paused = false
  let timer: ReturnType<typeof setTimeout> | undefined
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer)
    if (document.hidden) {
      timer = setTimeout(() => {
        stop()
        stop = () => {}
        paused = true
      }, 60_000)
    } else if (paused) {
      paused = false
      if (state.user) listen()
    }
  })
} else {
  backend = createLocalBackend()
  listen()
}

export const useSession = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state)

export async function signIn() {
  if (!auth) return
  const provider = new GoogleAuthProvider()
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    // Popups are blocked in some in-app browsers: go through a full page sign-in then.
    if ((e as { code?: string }).code === 'auth/popup-blocked') await signInWithRedirect(auth, provider)
    else if ((e as { code?: string }).code !== 'auth/popup-closed-by-user') set({ error: (e as Error).message })
  }
}

export const signOutNow = () => (auth ? signOut(auth) : Promise.resolve())

/** Demo mode only: start again from the sample data. */
export function restartDemo() {
  if (state.mode !== 'demo') return
  backend = createLocalBackend()
  listen()
}
