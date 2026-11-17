import { initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** False until the Firebase values are filled in (.env); the app then runs in demo mode. */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId)

const app: FirebaseApp | null = firebaseConfigured ? initializeApp(config) : null

export const auth = app ? getAuth(app) : null

// Offline cache: the app opens instantly and keeps working without a connection; changes sync later.
export const firestore = app ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }) : null

// Local testing only (npm run dev with VITE_EMULATOR=1): talk to the Firebase emulators, never the real project.
// import.meta.env.DEV is false in the built app, so none of this ships.
if (import.meta.env.DEV && import.meta.env.VITE_EMULATOR && auth && firestore) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(firestore, '127.0.0.1', 8085)
  const a = auth
  ;(window as unknown as Record<string, unknown>).__testSignIn = (sub: string, email: string, name: string, picture?: string) =>
    signInWithCredential(a, GoogleAuthProvider.credential(JSON.stringify({ sub, email, name, picture, email_verified: true })))
}
