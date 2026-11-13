import { type User } from 'firebase/auth'
import { collection, deleteDoc, doc, getDoc, getDocFromServer, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore'

// Who may use the system (see firestore.rules):
//   members/{uid}    { email, name, role, joinedAt }    the people inside
//   requests/{uid}   { email, name, code, createdAt }   someone who typed the code and waits
//   secret/code      { code, changedAt, resetAt, lastJoin }   the system code, seen by owner and admins; a new one after every accept
//   config/access    { emails }                         the first list, from before codes existed

//   roles/{id}       { name, perms, pages }                    the roles the owner made, and what each may do

/** What a role may do. The same list is in firestore.rules, which is what really enforces it. */
export const PERMS = ['offers.create', 'offers.approve', 'designs.approve', 'fix', 'schedule', 'delete', 'people'] as const
export type Perm = (typeof PERMS)[number]
export const PERM_LABEL: Record<Perm, [string, string]> = {
  'offers.create': ['Create offers', 'Make a new post and edit its items, prices and caption.'],
  'offers.approve': ['Approve offers', 'Approve or send back offers made by other people.'],
  'designs.approve': ['Approve designs', 'Approve, redo or skip posters in Review.'],
  fix: ['Fix problems', 'Retry, change photos and ignore errors in Fix.'],
  schedule: ['Schedule', 'Set, move and cancel times in the Planner.'],
  delete: ['Delete posts', 'Delete posts that are not on the schedule.'],
  people: ['Manage people', 'See the system code, accept and remove people.'],
}
/** 'owner', or the id of a role in `roles`. */
export type Role = string
/** The pages a role can be shown or not. Home and Settings are always there. */
export const PAGES = ['offers', 'review', 'fix', 'calendar', 'posted', 'database'] as const
export type Page = (typeof PAGES)[number]
export const PAGE_LABEL: Record<Page, string> = { offers: 'Offers', review: 'Review', fix: 'Fix', calendar: 'Planner', posted: 'Posted', database: 'Database' }
/**
 * The kinds of posts a set of pages may read. Every post carries a `zone` the engine keeps up to date
 * (offer, design, fix, approved, posted). The database rules hold the same table. Null means everything.
 */
export function zonesFor(pages: Page[]): string[] | null {
  if (PAGES.every((p) => pages.includes(p))) return null
  const has = (...list: Page[]) => list.some((p) => pages.includes(p))
  return [has('offers') && 'offer', has('review', 'database') && 'design', has('review', 'fix', 'database') && 'fix', has('calendar', 'database') && 'approved', has('calendar', 'posted', 'database') && 'posted'].filter((z): z is string => Boolean(z))
}
/** `pages` is what the role sees in the menu. A page also needs its permission, so this can only hide. */
export type RoleDef = { id: string; name: string; perms: Perm[]; pages: Page[] }
/** The two roles every system starts with. The owner can change what they may do. */
export const BUILT_IN: RoleDef[] = [
  { id: 'admin', name: 'Admin', perms: [...PERMS], pages: [...PAGES] },
  { id: 'member', name: 'Member', perms: PERMS.filter((p) => p !== 'people'), pages: [...PAGES] },
]
export type Member = { uid: string; email: string; name: string; role: Role; joinedAt: number }
export type JoinRequest = { uid: string; email: string; name: string; createdAt: number }
/** Where a signed-in person stands. 'legacy' means the database still runs the old access list. */
export type Access = 'checking' | 'legacy' | 'in' | 'outside' | 'waiting'
/** Where the person stands, and with which role once inside. */
export type Standing = { access: Access; role: Role; roleName: string; perms: Perm[]; pages: Page[] }

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

const out = (access: Access): Standing => ({ access, role: '', roleName: '', perms: [], pages: [] })
const asRole = (id: string, data: { name?: string; perms?: string[]; pages?: string[] } | undefined): RoleDef | null =>
  // A role saved before pages existed sees every page.
  data ? { id, name: data.name ?? id, perms: PERMS.filter((p) => data.perms?.includes(p)), pages: PAGES.filter((p) => !Array.isArray(data.pages) || data.pages.includes(p)) } : null

/** What a role may do. A built-in role the owner never saved works as it always did. */
async function standing(db: Firestore, role: Role): Promise<Standing> {
  if (role === 'owner') return { access: 'in', role, roleName: 'Owner', perms: [...PERMS], pages: [...PAGES] }
  const fallback = BUILT_IN.find((r) => r.id === role) ?? { id: role, name: role, perms: [], pages: [...PAGES] }
  const snap = await getDoc(doc(db, 'roles', role)).catch(() => null)
  const def = (snap?.exists() ? asRole(role, snap.data()) : null) ?? fallback
  return { access: 'in', role, roleName: def.name, perms: def.perms, pages: def.pages }
}

const profile = (user: User, role: Role) => ({ email: user.email ?? '', name: user.displayName ?? '', role, joinedAt: Date.now() })

/**
 * Finds out where the person stands, and lets the people of the first list in: the owner is its
 * first email, the others become members. Everyone else has to ask with the code.
 */
export async function findAccess(db: Firestore, user: User): Promise<Standing> {
  const mine = doc(db, 'members', user.uid)
  try {
    const snap = await getDocFromServer(mine)
    if (snap.exists()) return standing(db, snap.data().role as Role)
  } catch (e) {
    // Old rules know nothing about members: carry on as before.
    if (denied(e)) return out('legacy')
    // Offline: trust what this device last saw.
    const cached = await getDoc(mine).catch(() => null)
    return cached?.exists() ? standing(db, cached.data().role as Role) : out('checking')
  }
  for (const role of ['owner', 'member'] as const) {
    try {
      await setDoc(mine, profile(user, role))
      if (role === 'owner') await setDoc(doc(db, 'secret', 'code'), { code: newCode(), changedAt: Date.now() }).catch(() => {})
      return standing(db, role)
    } catch (e) {
      if (!denied(e)) throw e
    }
  }
  const asked = await getDocFromServer(doc(db, 'requests', user.uid)).catch(() => null)
  return out(asked?.exists() && Date.now() - millis(asked.data().createdAt) < REQUEST_DAYS * 86400000 ? 'waiting' : 'outside')
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

export type Team = { code: string; members: Member[]; requests: JoinRequest[]; roles: RoleDef[] }

/** Everything the Members section shows. Read once when it opens, not listened to. */
export async function loadTeam(db: Firestore): Promise<Team> {
  const [code, members, requests, saved] = await Promise.all([getDoc(doc(db, 'secret', 'code')), getDocs(collection(db, 'members')), getDocs(collection(db, 'requests')), getDocs(collection(db, 'roles')).catch(() => null)])
  const roles = (saved?.docs ?? []).map((d) => asRole(d.id, d.data())!).filter(Boolean)
  for (const r of [...BUILT_IN].reverse()) if (!roles.some((x) => x.id === r.id)) roles.unshift(r)
  const rank = (role: Role) => (role === 'owner' ? -1 : roles.findIndex((r) => r.id === role))
  const order = { get: rank }
  return {
    roles,
    code: (code.data()?.code as string | undefined) ?? '',
    members: members.docs.map((d) => ({ ...(d.data() as Omit<Member, 'uid'>), uid: d.id })).sort((a, b) => order.get(a.role) - order.get(b.role) || a.email.localeCompare(b.email)),
    requests: requests.docs
      .map((d) => ({ uid: d.id, email: d.data().email as string, name: d.data().name as string, createdAt: millis(d.data().createdAt) }))
      .filter((r) => Date.now() - r.createdAt < REQUEST_DAYS * 86400000)
      .sort((a, b) => a.createdAt - b.createdAt),
  }
}

export async function accept(db: Firestore, r: JoinRequest) {
  const run = (rotate: boolean) => {
    const batch = writeBatch(db)
    batch.set(doc(db, 'members', r.uid), { email: r.email, name: r.name, role: 'member', joinedAt: Date.now() })
    batch.delete(doc(db, 'requests', r.uid))
    // The code is used up: the next person needs the new one. The database insists on this.
    if (rotate) batch.set(doc(db, 'secret', 'code'), { code: newCode(), changedAt: Date.now(), lastJoin: r.uid }, { merge: true })
    return batch.commit()
  }
  // A database still on the earlier rules knows nothing about changing the code here.
  await run(true).catch((e) => (denied(e) ? run(false) : Promise.reject(e)))
}

export const decline = (db: Firestore, uid: string) => deleteDoc(doc(db, 'requests', uid))

/** Removes a person, and takes them off the first list so they cannot walk back in. */
export async function removeMember(db: Firestore, m: Member) {
  const list = doc(db, 'config', 'access')
  const emails = ((await getDoc(list).catch(() => null))?.data()?.emails as string[] | undefined) ?? []
  if (emails.includes(m.email) && emails[0] !== m.email) await updateDoc(list, { emails: emails.filter((e) => e !== m.email) })
  await deleteDoc(doc(db, 'members', m.uid))
}

/** Gives a person a role. The database accepts only a role that exists. */
export const setRole = (db: Firestore, uid: string, role: Role) => updateDoc(doc(db, 'members', uid), { role })

export const saveRole = (db: Firestore, r: RoleDef) =>
  setDoc(doc(db, 'roles', r.id), { name: r.name.trim(), perms: r.perms, pages: r.pages })
    // Rules published before pages existed refuse the field. A role that hides nothing can still be saved without it.
    .catch((e) => (denied(e) && r.pages.length === PAGES.length ? setDoc(doc(db, 'roles', r.id), { name: r.name.trim(), perms: r.perms }) : Promise.reject(e)))
export const deleteRole = (db: Firestore, id: string) => deleteDoc(doc(db, 'roles', id))
/** An id for a new role: short, and never one of the reserved names. */
export const newRoleId = () => `r${Date.now().toString(36)}`

/** A new code. Requests made with the old one can no longer be accepted. */
export async function resetCode(db: Firestore): Promise<string> {
  const code = newCode()
  await setDoc(doc(db, 'secret', 'code'), { code, changedAt: Date.now(), resetAt: serverTimestamp() })
  return code
}
