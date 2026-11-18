import { collection, doc, getDoc, onSnapshot, query, setDoc, updateDoc, where, type DocumentData } from 'firebase/firestore'
import { firestore } from './firebase'
import { addDays, cairoNow } from './logic'
import { myself } from './hr'

// HR records: each employee's file, and leave requests.
//
//   staff/{uid}   { name, title, phone, nationalId, address, startDate, salary, emergency, annualDays, notes: Note[] }
//                 the employee file: only HR reads and writes it (salary and ID numbers are private)
//   leaves/{id}   { uid, name, from, to, kind, why, state, at, byName?, decidedAt?, answer? }
//                 a day-off request: the employee asks, HR accepts or declines. Accepted days become days off in the shifts.

export type NoteKind = 'note' | 'warning' | 'praise'
export const NOTE_KINDS: NoteKind[] = ['note', 'warning', 'praise']
export type Note = { at: number; by: string; byName: string; kind: NoteKind; text: string }
export type Staff = { name: string; title: string; phone: string; nationalId: string; address: string; startDate: string; salary: number; emergency: string; annualDays: number; notes: Note[] }
export const EMPTY_STAFF: Omit<Staff, 'name'> = { title: '', phone: '', nationalId: '', address: '', startDate: '', salary: 0, emergency: '', annualDays: 21, notes: [] }

export type LeaveKind = 'annual' | 'sick' | 'unpaid' | 'other'
export const LEAVE_KINDS: LeaveKind[] = ['annual', 'sick', 'unpaid', 'other']
export type LeaveState = 'pending' | 'ok' | 'no' | 'cancelled'
export type Leave = { id: string; uid: string; name: string; from: string; to: string; kind: LeaveKind; why: string; state: LeaveState; at: number; byName?: string; decidedAt?: number; answer?: string }

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function toStaff(name: string, d: DocumentData | undefined): Staff {
  if (!d) return { name, ...EMPTY_STAFF }
  const notes = Array.isArray(d.notes) ? d.notes.map((n: Record<string, unknown>) => ({ at: num(n.at), by: str(n.by, 128), byName: str(n.byName), kind: (NOTE_KINDS as string[]).includes(str(n.kind)) ? (n.kind as NoteKind) : 'note', text: str(n.text, 1000) })) : []
  return { name: str(d.name) || name, title: str(d.title), phone: str(d.phone, 40), nationalId: str(d.nationalId, 40), address: str(d.address, 300), startDate: str(d.startDate, 10), salary: num(d.salary), emergency: str(d.emergency, 200), annualDays: typeof d.annualDays === 'number' ? d.annualDays : 21, notes }
}
export function toLeave(id: string, d: DocumentData): Leave {
  return {
    id, uid: str(d.uid, 128), name: str(d.name), from: str(d.from, 10), to: str(d.to, 10),
    kind: (LEAVE_KINDS as string[]).includes(str(d.kind)) ? (d.kind as LeaveKind) : 'other',
    why: str(d.why, 500), state: (['pending', 'ok', 'no', 'cancelled'] as string[]).includes(str(d.state)) ? (d.state as LeaveState) : 'pending',
    at: num(d.at), byName: str(d.byName) || undefined, decidedAt: num(d.decidedAt) || undefined, answer: str(d.answer, 500) || undefined,
  }
}

/** Every date a leave covers, at most 60. */
export function leaveDates(l: Pick<Leave, 'from' | 'to'>): string[] {
  const out: string[] = []
  for (let d = l.from; d <= l.to && out.length < 60; d = addDays(d, 1)) out.push(d)
  return out
}
/** Accepted annual-leave days a person took in a year. */
export function annualUsed(list: Leave[], uid: string, year: string): number {
  return list.filter((l) => l.uid === uid && l.state === 'ok' && l.kind === 'annual').flatMap(leaveDates).filter((d) => d.startsWith(year)).length
}
/** Whole years and months since a start date, for the file ("2 y 3 m"). */
export function tenure(start: string, today = cairoNow().date): { y: number; m: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start > today) return null
  const [y1, m1, d1] = start.split('-').map(Number)
  const [y2, m2, d2] = today.split('-').map(Number)
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
  if (months < 0) months = 0
  return { y: Math.floor(months / 12), m: months % 12 }
}

export type StaffBackend = {
  loadStaff(uid: string, name: string): Promise<Staff>
  saveStaff(uid: string, s: Staff): Promise<void>
  addNote(uid: string, name: string, kind: NoteKind, text: string): Promise<Note>
  /** The signed-in person's own requests. */
  watchMyLeaves(on: (l: Leave[]) => void, onError: (e: unknown) => void): () => void
  /** HR: every request from a date on (a year is a handful of documents). */
  watchLeaves(fromDate: string, on: (l: Leave[]) => void, onError: (e: unknown) => void): () => void
  askLeave(l: Pick<Leave, 'from' | 'to' | 'kind' | 'why'>): Promise<void>
  cancelLeave(id: string): Promise<void>
  /** HR: accept, decline, or cancel an accepted request. */
  decideLeave(id: string, state: 'ok' | 'no' | 'cancelled', answer: string): Promise<void>
}

const sortLeaves = (l: Leave[]) => l.sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : b.at - a.at))

function firestoreStaff(fs: NonNullable<typeof firestore>): StaffBackend {
  const leaves = collection(fs, 'leaves')
  return {
    async loadStaff(uid, name) { return toStaff(name, (await getDoc(doc(fs, 'staff', uid))).data()) },
    async saveStaff(uid, s) {
      await setDoc(doc(fs, 'staff', uid), { name: s.name.slice(0, 200), title: s.title.trim().slice(0, 200), phone: s.phone.trim().slice(0, 40), nationalId: s.nationalId.trim().slice(0, 40), address: s.address.trim().slice(0, 300), startDate: s.startDate, salary: Math.max(0, Number(s.salary) || 0), emergency: s.emergency.trim().slice(0, 200), annualDays: Math.max(0, Math.round(Number(s.annualDays) || 0)), notes: s.notes.slice(-200) })
    },
    async addNote(uid, name, kind, text) {
      const m = myself()
      const note: Note = { at: Date.now(), by: m.uid, byName: m.name, kind, text: text.trim().slice(0, 1000) }
      const cur = toStaff(name, (await getDoc(doc(fs, 'staff', uid))).data())
      await this.saveStaff(uid, { ...cur, notes: [...cur.notes, note] })
      return note
    },
    watchMyLeaves(on, onError) {
      return onSnapshot(query(leaves, where('uid', '==', myself().uid)), (s) => on(sortLeaves(s.docs.map((x) => toLeave(x.id, x.data())))), onError)
    },
    watchLeaves(fromDate, on, onError) {
      return onSnapshot(query(leaves, where('to', '>=', fromDate)), (s) => on(sortLeaves(s.docs.map((x) => toLeave(x.id, x.data())))), onError)
    },
    async askLeave(l) {
      const m = myself()
      await setDoc(doc(leaves), { uid: m.uid, name: m.name.slice(0, 200), from: l.from, to: l.to, kind: l.kind, why: l.why.trim().slice(0, 500), state: 'pending', at: Date.now() })
    },
    async cancelLeave(id) { await updateDoc(doc(leaves, id), { state: 'cancelled' }) },
    async decideLeave(id, state, answer) {
      await updateDoc(doc(leaves, id), { state, byName: myself().name.slice(0, 200), decidedAt: Date.now(), answer: answer.trim().slice(0, 500) })
    },
  }
}

// ---------- Demo (no Firebase) ----------

type Local = { staff: Record<string, Staff>; leaves: Leave[] }
const KEY = 'posterpilot.demo.staff.v1'
let mem: Local | null = null
const listeners = new Set<() => void>()
function demo(): Local {
  const today = cairoNow().date
  return {
    staff: {
      mona: { name: 'Mona Adel', title: 'Sales', phone: '0100 000 0000', nationalId: '', address: 'Nasr City', startDate: '2024-03-01', salary: 9000, emergency: 'Her brother · 0111 000 0000', annualDays: 21, notes: [{ at: Date.now() - 86400_000 * 9, by: 'demo-you', byName: 'You', kind: 'praise', text: 'Closed the biggest PC build order this month.' }] },
    },
    leaves: [
      { id: 'l1', uid: 'yousef', name: 'Yousef Kamal', from: addDays(today, 6), to: addDays(today, 7), kind: 'annual', why: 'Family wedding in Alexandria.', state: 'pending', at: Date.now() - 3600_000 },
      { id: 'l2', uid: 'mona', name: 'Mona Adel', from: addDays(today, -12), to: addDays(today, -11), kind: 'sick', why: 'Flu.', state: 'ok', at: Date.now() - 86400_000 * 13, byName: 'You', decidedAt: Date.now() - 86400_000 * 13 },
      { id: 'l3', uid: 'demo-you', name: 'You', from: addDays(today, 10), to: addDays(today, 10), kind: 'annual', why: 'Doctor appointment.', state: 'pending', at: Date.now() - 7200_000 },
    ],
  }
}
const load = (): Local => {
  if (mem) return mem
  try { const raw = localStorage.getItem(KEY); if (raw) return (mem = JSON.parse(raw) as Local) } catch { /* samples */ }
  return (mem = demo())
}
const save = (next: Local) => {
  mem = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* this visit only */ }
  listeners.forEach((l) => l())
}
function localStaff(): StaffBackend {
  const watch = (get: () => Leave[], on: (l: Leave[]) => void) => { const send = () => on(sortLeaves([...get()])); send(); listeners.add(send); return () => { listeners.delete(send) } }
  return {
    async loadStaff(uid, name) { return load().staff[uid] ?? { name, ...EMPTY_STAFF } },
    async saveStaff(uid, s) { save({ ...load(), staff: { ...load().staff, [uid]: s } }) },
    async addNote(uid, name, kind, text) {
      const note: Note = { at: Date.now(), by: 'demo-you', byName: 'You', kind, text: text.trim() }
      const cur = load().staff[uid] ?? { name, ...EMPTY_STAFF }
      save({ ...load(), staff: { ...load().staff, [uid]: { ...cur, notes: [...cur.notes, note] } } })
      return note
    },
    watchMyLeaves: (on) => watch(() => load().leaves.filter((l) => l.uid === 'demo-you'), on),
    watchLeaves: (fromDate, on) => watch(() => load().leaves.filter((l) => l.to >= fromDate), on),
    async askLeave(l) { save({ ...load(), leaves: [...load().leaves, { ...l, id: Math.random().toString(36).slice(2), uid: 'demo-you', name: 'You', state: 'pending', at: Date.now() }] }) },
    async cancelLeave(id) { save({ ...load(), leaves: load().leaves.map((l) => (l.id === id ? { ...l, state: 'cancelled' } : l)) }) },
    async decideLeave(id, state, answer) { save({ ...load(), leaves: load().leaves.map((l) => (l.id === id ? { ...l, state, byName: 'You', decidedAt: Date.now(), answer } : l)) }) },
  }
}

export const staff: StaffBackend = firestore ? firestoreStaff(firestore) : localStaff()
