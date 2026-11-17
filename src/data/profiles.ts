import { type User } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'
import { useSyncExternalStore } from 'react'
import { firestore } from './firebase'

// Everyone's picture, so a face shows next to a name across the app:
//   profiles/{uid}   { name, photo, custom?, at }
// `photo` is the Google account picture's address, or a small picture the person chose (a data address
// of a few KB, kept in the document itself so no paid file storage is needed). `custom` is true while
// the person's own picture is on: signing in again then leaves it alone. Every member reads the
// list once per visit; only the person writes their own (see firestore.rules).

export type Profile = { name: string; photo: string; custom: boolean }

/** Pictures are shrunk to this many pixels a side before they are saved. */
export const PHOTO_SIZE = 160

let profiles = new Map<string, Profile>()
const listeners = new Set<() => void>()
const put = (uid: string, p: Profile) => {
  profiles = new Map(profiles).set(uid, p)
  listeners.forEach((l) => l())
}

export const useProfiles = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => profiles)
export const photoOf = (uid: string | undefined) => (uid ? profiles.get(uid)?.photo ?? '' : '')

const asProfile = (d: Record<string, unknown> | undefined): Profile => ({ name: String(d?.name ?? ''), photo: String(d?.photo ?? ''), custom: d?.custom === true })

let loaded = false
/** Reads everyone's picture once. A failure (old rules) just leaves initials. */
export async function loadProfiles() {
  if (loaded || !firestore) return
  loaded = true
  try {
    const snap = await getDocs(collection(firestore, 'profiles'))
    const next = new Map(profiles)
    snap.docs.forEach((d) => next.set(d.id, asProfile(d.data())))
    profiles = next
    listeners.forEach((l) => l())
  } catch {
    loaded = false
  }
}

/** On sign-in: keeps the Google picture and name up to date, unless the person chose their own picture. */
export async function syncMyProfile(user: User) {
  if (!firestore) return
  const ref = doc(firestore, 'profiles', user.uid)
  const google = user.photoURL ?? ''
  const name = user.displayName || user.email || ''
  try {
    const was = await getDoc(ref)
    const old = asProfile(was.data())
    const photo = old.custom ? old.photo : google
    put(user.uid, { name, photo, custom: old.custom })
    if (was.exists() && old.name === name && old.photo === photo) return
    await setDoc(ref, { name, photo, custom: old.custom, at: Date.now() })
  } catch {
    // Rules not published yet: the person still sees their own Google picture.
    put(user.uid, { name, photo: google, custom: false })
  }
}

/** Saves a picture the person picked, shrunk and cropped to a small square. */
export async function setMyPhoto(user: User, file: File) {
  const photo = await shrink(file)
  const name = user.displayName || user.email || ''
  if (firestore) await setDoc(doc(firestore, 'profiles', user.uid), { name, photo, custom: true, at: Date.now() })
  put(user.uid, { name, photo, custom: true })
}

/** Goes back to the Google account picture. */
export async function backToGooglePhoto(user: User) {
  const name = user.displayName || user.email || ''
  const photo = user.photoURL ?? ''
  if (firestore) await setDoc(doc(firestore, 'profiles', user.uid), { name, photo, custom: false, at: Date.now() })
  put(user.uid, { name, photo, custom: false })
}

/** Removes the picture altogether: initials show instead. */
export async function removeMyPhoto(user: User) {
  const name = user.displayName || user.email || ''
  if (firestore) await setDoc(doc(firestore, 'profiles', user.uid), { name, photo: '', custom: true, at: Date.now() })
  put(user.uid, { name, photo: '', custom: true })
}

/** Demo mode: keep the picked picture in memory only. */
export async function setDemoPhoto(file: File) {
  put('', { name: 'You', photo: await shrink(file), custom: true })
}

/** A centred square, PHOTO_SIZE pixels a side, as a JPEG data address (usually 5 to 15 KB). */
async function shrink(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not-image')
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = PHOTO_SIZE
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82)
}
