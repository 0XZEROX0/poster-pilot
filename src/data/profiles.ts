import { type User } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'
import { useSyncExternalStore } from 'react'
import { firestore } from './firebase'

// Everyone's picture, so a face shows next to a name across the app:
//   profiles/{uid}   { name, photo, custom?, nameCustom?, at }
// `photo` is the Google account picture's address, or a small picture the person chose (a data address
// of a few KB, kept in the document itself so no paid file storage is needed). `custom` is true while
// the person's own picture is on: signing in again then leaves it alone. Every member reads the
// list once per visit; only the person writes their own (see firestore.rules).

export type Profile = { name: string; photo: string; custom: boolean; nameCustom: boolean }

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

const asProfile = (d: Record<string, unknown> | undefined): Profile => ({ name: String(d?.name ?? ''), photo: String(d?.photo ?? ''), custom: d?.custom === true, nameCustom: d?.nameCustom === true })

/** The name a person goes by in the app: the one they chose, else their Google name, else what was saved with the record. */
export const nameOf = (uid: string | undefined, fallback = '') => (uid ? profiles.get(uid)?.name : '') || fallback

// The signed-in person's chosen name is also kept on this device, so it is used from the very first write.
const KEY = 'posterpilot.myName'
const remembered = (uid: string): string => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as { uid?: string; name?: string } | null
    return v?.uid === uid ? v.name ?? '' : ''
  } catch {
    return ''
  }
}
const remember = (uid: string, name: string) => {
  try {
    if (name) localStorage.setItem(KEY, JSON.stringify({ uid, name }))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked: the name still comes from the database.
  }
}

/** The name to write next to anything this person does. */
export function myNameFor(user: Pick<User, 'uid' | 'displayName' | 'email'> | null | undefined): string {
  if (!user) return ''
  const p = profiles.get(user.uid)
  if (p?.nameCustom && p.name) return p.name
  return remembered(user.uid) || user.displayName || user.email || ''
}

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

const googleName = (user: User) => user.displayName || user.email || ''
/** Only addresses the database rules take: a secure web address or a small JPEG. */
const safePhoto = (photo: string) => (/^https:\/\/\S+$/.test(photo) || photo.startsWith('data:image/jpeg;base64,') ? photo : '')
const save = async (user: User, p: Profile) => {
  if (firestore) await setDoc(doc(firestore, 'profiles', user.uid), { ...p, photo: safePhoto(p.photo), at: Date.now() })
  put(user.uid, p)
  remember(user.uid, p.nameCustom ? p.name : '')
}
const current = (user: User): Profile => profiles.get(user.uid) ?? { name: googleName(user), photo: user.photoURL ?? '', custom: false, nameCustom: false }

/**
 * On sign-in: keeps the Google picture and name up to date, but never over a picture or a name the
 * person chose themselves. Those stay whatever happens: signing out, another device, a new Google name.
 */
export async function syncMyProfile(user: User) {
  if (!firestore) return
  const ref = doc(firestore, 'profiles', user.uid)
  const google = user.photoURL ?? ''
  try {
    const was = await getDoc(ref)
    const old = asProfile(was.data())
    const next: Profile = { name: old.nameCustom && old.name ? old.name : googleName(user), photo: old.custom ? old.photo : google, custom: old.custom, nameCustom: old.nameCustom && Boolean(old.name) }
    put(user.uid, next)
    remember(user.uid, next.nameCustom ? next.name : '')
    if (was.exists() && old.name === next.name && old.photo === next.photo && old.nameCustom === next.nameCustom) return
    await setDoc(ref, { ...next, photo: safePhoto(next.photo), at: Date.now() })
  } catch {
    // Rules not published yet: the person still sees their own Google picture.
    put(user.uid, { name: remembered(user.uid) || googleName(user), photo: google, custom: false, nameCustom: Boolean(remembered(user.uid)) })
  }
}

/** Saves a picture the person picked, shrunk and cropped to a small square. */
export async function setMyPhoto(user: User, file: File) {
  const photo = await shrink(file)
  await save(user, { ...current(user), photo, custom: true })
}

/** Goes back to the Google account picture. */
export async function backToGooglePhoto(user: User) {
  await save(user, { ...current(user), photo: user.photoURL ?? '', custom: false })
}

/** Removes the picture altogether: initials show instead. */
export async function removeMyPhoto(user: User) {
  await save(user, { ...current(user), photo: '', custom: true })
}

/** The name the person wants to be called in the app. */
export async function setMyName(user: User, name: string) {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!clean) throw new Error('empty-name')
  await save(user, { ...current(user), name: clean, nameCustom: true })
}

/** Goes back to the Google account name. */
export async function backToGoogleName(user: User) {
  await save(user, { ...current(user), name: googleName(user), nameCustom: false })
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
