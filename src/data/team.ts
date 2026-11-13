import { type User } from 'firebase/auth'
import { collection, deleteDoc, doc, getDoc, getDocFromServer, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore'

// Who may use the system (see firestore.rules):
//   members/{uid}    { email, name, role, joinedAt }    the people inside
//   requests/{uid}   { email, name, code, createdAt }   someone who typed the code and waits
//   secret/code      { code, changedAt }                the system code, seen by owner and admins
//   config/access    { emails }                         the first list, from before codes existed

export type Role = 'owner' | 'admin' | 'member'
export type Member = { uid: string; email: string; name: string; role: Role; joinedAt: number }
export type JoinRequest = { uid: string; email: string; name: string; createdAt: number }
/** Where a signed-in person stands. 'legacy' means the database still runs the old access list. */
export type Access = 'checking' | 'legacy' | Role | 'outside' | 'waiting'

/** A request nobody answered for this long no longer counts. */
export const REQUEST_DAYS = 7

const denied = (e: unknown) => (e as { code?: string }).code === 'permission-denied'
const millis = (v: unknown) => (typeof v === 'number' ? v : (v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0)

/** A new system code: easy to copy and paste, far too long to guess. */
export function newCode(): string {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const letters = [...bytes].map((b) => abc[b % abc.length]).join('')
  return `STATIC-${letters.match(/.{4}/g)!.join('-')}`
}

const profile = (user: User, role: Role) => ({ email: user.email ?? '', name: user.displayName ?? '', role, joinedAt: Date.now() })

/**
 * Finds out where the person stands, and lets the people of the first list in: the owner is its
 * first email, the others become members. Everyone else has to ask with the code.
 */
export async function findAccess(db: Firestore, user: User): Promise<Access> {
  const mine = doc(db, 'members', user.uid)
  try {
    const snap = await getDocFromServer(mine)
    if (snap.exists()) return snap.data().role as Role
  } catch (e) {
    // Old rules know nothing about members: carry on as before.
    if (denied(e)) return 'legacy'
    // Offline: trust what this device last saw.
    const cached = await getDoc(mine).catch(() => null)
    return cached?.exists() ? (cached.data().role as Role) : 'checking'
  }
  for (const role of ['owner', 'member'] as const) {
    try {
      await setDoc(mine, profile(user, role))
      if (role === 'owner') await setDoc(doc(db, 'secret', 'code'), { code: newCode(), changedAt: Date.now() }).catch(() => {})
      return role
    } catch (e) {
      if (!denied(e)) throw e
    }
  }
  const asked = await getDocFromServer(doc(db, 'requests', user.uid)).catch(() => null)
  return asked?.exists() && Date.now() - millis(asked.data().createdAt) < REQUEST_DAYS * 86400000 ? 'waiting' : 'outside'
}

/** Asks to join with the system code. Returns false when the code is not the right one. */
export async function askToJoin(db: Firestore, user: User, code: string): Promise<boolean> {
  try {
    await setDoc(doc(db, 'requests', user.uid), { email: user.email ?? '', name: user.displayName ?? '', code: code.trim().toUpperCase(), createdAt: serverTimestamp() })
    return true
  } catch (e) {
    if (denied(e)) return false
    throw e
  }
}

export const cancelRequest = (db: Firestore, uid: string) => deleteDoc(doc(db, 'requests', uid))

/** Tells a waiting person the moment they are let in. */
export const watchMembership = (db: Firestore, uid: string, onRole: (role: Role) => void) =>
  onSnapshot(doc(db, 'members', uid), (snap) => snap.exists() && onRole(snap.data().role as Role), () => {})

export type Team = { code: string; members: Member[]; requests: JoinRequest[] }

/** Everything the Members section shows. Read once when it opens, not listened to. */
export async function loadTeam(db: Firestore): Promise<Team> {
  const [code, members, requests] = await Promise.all([getDoc(doc(db, 'secret', 'code')), getDocs(collection(db, 'members')), getDocs(collection(db, 'requests'))])
  const order: Record<Role, number> = { owner: 0, admin: 1, member: 2 }
  return {
    code: (code.data()?.code as string | undefined) ?? '',
    members: members.docs.map((d) => ({ ...(d.data() as Omit<Member, 'uid'>), uid: d.id })).sort((a, b) => order[a.role] - order[b.role] || a.email.localeCompare(b.email)),
    requests: requests.docs
      .map((d) => ({ uid: d.id, email: d.data().email as string, name: d.data().name as string, createdAt: millis(d.data().createdAt) }))
      .filter((r) => Date.now() - r.createdAt < REQUEST_DAYS * 86400000)
      .sort((a, b) => a.createdAt - b.createdAt),
  }
}

export async function accept(db: Firestore, r: JoinRequest) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'members', r.uid), { email: r.email, name: r.name, role: 'member', joinedAt: Date.now() })
  batch.delete(doc(db, 'requests', r.uid))
  await batch.commit()
}

export const decline = (db: Firestore, uid: string) => deleteDoc(doc(db, 'requests', uid))

/** Removes a person, and takes them off the first list so they cannot walk back in. */
export async function removeMember(db: Firestore, m: Member) {
  const list = doc(db, 'config', 'access')
  const emails = ((await getDoc(list).catch(() => null))?.data()?.emails as string[] | undefined) ?? []
  if (emails.includes(m.email) && emails[0] !== m.email) await updateDoc(list, { emails: emails.filter((e) => e !== m.email) })
  await deleteDoc(doc(db, 'members', m.uid))
}

export const setRole = (db: Firestore, uid: string, role: 'admin' | 'member') => updateDoc(doc(db, 'members', uid), { role })

/** A new code. Requests made with the old one can no longer be accepted. */
export async function resetCode(db: Firestore): Promise<string> {
  const code = newCode()
  await setDoc(doc(db, 'secret', 'code'), { code, changedAt: Date.now() })
  return code
}
