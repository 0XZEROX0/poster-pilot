import { getAuth } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, deleteField, type DocumentData } from 'firebase/firestore'
import { myNameFor } from './profiles'
import { firestore } from './firebase'
import { addDays, cairoNow } from './logic'

// HR: clocking in and out at the shop, shifts, late and early counting, penalties.
//
//   hr/settings                 { places: Place[], maxAcc, grace }      where the shop is, read once per visit
//   hr/shifts                   { people: { [uid]: Person } }           everyone's shifts, one document (one read)
//   attendance/{uid}_{YYYY-MM}  { uid, month, last, days: { [DD]: Day }, pens: Penalty[] }
//                               one document per person per month: the whole month costs one read
//
// Clock in and out use the server's time (the phone's clock is never trusted) and the phone's location;
// the database rules check again that the location is inside one of the shop's places. Late and early
// minutes are never stored: they are worked out from the shift of that day, so they cannot be typed in.

export type Place = { name: string; lat: number; lng: number; radius: number; kx: number }
export type HrSettings = { places: Place[]; maxAcc: number; grace: number }
/** Start and end, 'HH:MM' Cairo time. An end before the start ends the next day (a night shift). Null is a day off. */
export type Shift = { s: string; e: string } | null
/** A weekly pattern from a date on. days['0'] is Sunday … days['6'] is Saturday. */
export type Plan = { from: string; days: Record<string, Shift> }
export type Person = { name: string; plans: Plan[]; dates: Record<string, Shift> }
export type Shifts = Record<string, Person>
export type Punch = { lat: number; lng: number; acc: number; place: number; dev: string }
export type Day = { in?: number; out?: number; inP?: Punch; outP?: Punch; excused?: boolean; note?: string; fixBy?: string }
export const UNITS = ['EGP', 'hours', 'days'] as const
export type Unit = (typeof UNITS)[number]
export type Penalty = { at: number; by: string; byName: string; date: string; amount: number; unit: Unit; reason: string }
export type Month = { id: string; uid: string; month: string; days: Record<string, Day>; pens: Penalty[] }

export const DEFAULT_SETTINGS: HrSettings = { places: [], maxAcc: 100, grace: 10 }
/** Saturday first, the way the week is counted in Egypt. */
export const WEEK = [6, 0, 1, 2, 3, 4, 5]
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ---------- Places and distance ----------

/** Meters per degree of latitude, and of longitude at a latitude. The rules use the same numbers. */
export const M_PER_LAT = 111320
export const metersPerLng = (lat: number) => Math.round(M_PER_LAT * Math.cos((lat * Math.PI) / 180))

/** A flat-earth distance in meters, good to a few meters over a shop's radius. Same formula as in firestore.rules. */
export const distance = (p: Pick<Place, 'lat' | 'lng' | 'kx'>, lat: number, lng: number) => Math.sqrt(((lat - p.lat) * M_PER_LAT) ** 2 + ((lng - p.lng) * p.kx) ** 2)

export function nearest(places: Place[], lat: number, lng: number): { index: number; dist: number } | null {
  let best: { index: number; dist: number } | null = null
  places.forEach((p, index) => {
    const dist = distance(p, lat, lng)
    if (!best || dist < best.dist) best = { index, dist }
  })
  return best
}

export type Check = { ok: true; place: number; dist: number } | { ok: false; why: 'noPlace' | 'far' | 'vague'; dist?: number; place?: number }
/** Whether a reading from the phone may clock in: inside a place, and accurate enough. */
export function checkSpot(s: HrSettings, lat: number, lng: number, acc: number): Check {
  const n = nearest(s.places, lat, lng)
  if (!n) return { ok: false, why: 'noPlace' }
  if (acc > s.maxAcc) return { ok: false, why: 'vague', dist: n.dist, place: n.index }
  if (n.dist > s.places[n.index].radius) return { ok: false, why: 'far', dist: n.dist, place: n.index }
  return { ok: true, place: n.index, dist: n.dist }
}

// ---------- Time ----------

/** The moment a Cairo date and time happen (Egypt changes its clock in summer, so the offset is looked up). */
export function cairoMs(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const seen = cairoNow(new Date(guess))
  const [sy, sm, sd] = seen.date.split('-').map(Number)
  const [sh, smi] = seen.time.split(':').map(Number)
  const offset = Date.UTC(sy, sm - 1, sd, sh, smi) - guess
  return guess - offset
}
/** 'HH:MM' Cairo time of a moment. */
export const clockOf = (ms: number) => cairoNow(new Date(ms)).time
export const dateOf = (ms: number) => cairoNow(new Date(ms)).date
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()
export const monthOf = (date: string) => date.slice(0, 7)
export const monthId = (uid: string, month: string) => `${uid}_${month}`
export const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
export const addMonths = (month: string, n: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}
const toMin = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
/** Length of a shift in minutes. */
export const shiftMinutes = (s: NonNullable<Shift>) => ((toMin(s.e) - toMin(s.s) + 1440) % 1440) || 1440
/** 90 → "1h 30m" */
export const hm = (min: number) => (min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`)

// ---------- Shifts ----------

/** The shift a person has on a date: a one-day change wins, else the weekly plan that was in force then. */
export function shiftOn(p: Person | undefined, date: string): Shift {
  if (!p) return null
  if (date in p.dates) return p.dates[date]
  const plan = [...p.plans].filter((x) => x.from <= date).sort((a, b) => (a.from < b.from ? 1 : -1))[0]
  return plan?.days[String(weekdayOf(date))] ?? null
}
/** A new weekly plan from a date on. Plans from before it stay, so past days keep the shift they had. */
export function withPlan(p: Person, plan: Plan): Person {
  const plans = [...p.plans.filter((x) => x.from !== plan.from), plan].sort((a, b) => (a.from < b.from ? -1 : 1))
  // Keep the plan in force a year ago and everything after it.
  const yearAgo = addDays(plan.from, -400)
  const keepFrom = plans.filter((x) => x.from <= yearAgo).pop()?.from ?? ''
  return { ...p, plans: plans.filter((x) => x.from >= keepFrom) }
}
/** Sets or clears a one-day change. Changes older than 400 days are dropped. */
export function withDate(p: Person, date: string, shift: Shift | undefined): Person {
  const dates = { ...p.dates }
  if (shift === undefined) delete dates[date]
  else dates[date] = shift
  const old = addDays(date, -400)
  for (const d of Object.keys(dates)) if (d < old) delete dates[d]
  return { ...p, dates }
}

// ---------- Counting ----------

export type DayState = 'off' | 'upcoming' | 'notIn' | 'absent' | 'working' | 'noOut' | 'done' | 'extra'
export type DayResult = { date: string; shift: Shift; day?: Day; state: DayState; late: number; early: number; worked: number }

/** How long after a shift's end a missing clock-out counts as forgotten. */
const NO_OUT_AFTER = 4 * 3600_000

/** One day of one person: what happened, and the late and early minutes (after the grace minutes). */
export function judgeDay(date: string, shift: Shift, day: Day | undefined, grace: number, now = Date.now()): DayResult {
  const base = { date, shift, day, late: 0, early: 0, worked: 0 }
  const start = shift ? cairoMs(date, shift.s) : 0
  const end = shift ? start + shiftMinutes(shift) * 60_000 : 0
  if (!day?.in) {
    if (!shift) return { ...base, state: 'off' }
    if (now < start) return { ...base, state: 'upcoming' }
    if (now < end) return { ...base, state: 'notIn' }
    return { ...base, state: day?.excused ? 'off' : 'absent' }
  }
  const worked = day.out ? Math.max(0, Math.round((day.out - day.in) / 60_000)) : 0
  if (!shift) return { ...base, state: day.out ? 'extra' : 'working', worked }
  const rawLate = Math.floor((day.in - start) / 60_000)
  const late = day.excused || rawLate <= grace ? 0 : rawLate
  const early = day.out && !day.excused ? Math.max(0, Math.ceil((end - day.out) / 60_000)) : 0
  const state: DayState = day.out ? 'done' : now > end + NO_OUT_AFTER ? 'noOut' : 'working'
  return { ...base, state, late, early, worked }
}

export type Totals = { scheduled: number; present: number; absent: number; lateDays: number; lateMin: number; earlyDays: number; earlyMin: number; noOut: number; workedMin: number; extra: number; pens: Record<Unit, number> }

/** Every day of a month for one person, up to today, with the totals. */
export function judgeMonth(month: string, person: Person | undefined, m: Month | undefined, grace: number, now = Date.now()): { days: DayResult[]; totals: Totals } {
  const today = dateOf(now)
  const days: DayResult[] = []
  const totals: Totals = { scheduled: 0, present: 0, absent: 0, lateDays: 0, lateMin: 0, earlyDays: 0, earlyMin: 0, noOut: 0, workedMin: 0, extra: 0, pens: { EGP: 0, hours: 0, days: 0 } }
  for (let d = 1; d <= daysIn(month); d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`
    if (date > today) break
    const r = judgeDay(date, shiftOn(person, date), m?.days[String(d).padStart(2, '0')], grace, now)
    days.push(r)
    if (r.shift) totals.scheduled++
    if (r.day?.in) totals.present++
    if (r.state === 'absent') totals.absent++
    if (r.state === 'noOut') totals.noOut++
    if (r.state === 'extra') totals.extra++
    if (r.late) { totals.lateDays++; totals.lateMin += r.late }
    if (r.early) { totals.earlyDays++; totals.earlyMin += r.early }
    totals.workedMin += r.worked
  }
  for (const p of m?.pens ?? []) totals.pens[p.unit] += p.amount
  return { days, totals }
}

/** The devices a person clocked from this month. More than one is worth a look. */
export const devicesOf = (m: Month | undefined) => new Set(Object.values(m?.days ?? {}).flatMap((d) => [d.inP?.dev, d.outP?.dev]).filter((x): x is string => Boolean(x)))

/** The day a clock-out belongs to: today's open day, or yesterday's for a night shift. */
export function openDay(m: Month | undefined, today: string): string | null {
  for (const date of [today, addDays(today, -1)]) {
    if (monthOf(date) !== m?.month) continue
    const d = m.days[date.slice(8, 10)]
    if (d?.in && !d.out) return date
  }
  return null
}

/** This browser's own id, so the report can show when someone clocks in from a different phone. */
export function deviceId(): string {
  const KEY = 'posterpilot.device'
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return 'no-storage'
  }
}

// ---------- Reading ----------

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const str = (v: unknown, n = 300) => (typeof v === 'string' ? v.slice(0, n) : '')
const ms = (v: unknown): number | undefined => (typeof v === 'number' ? v : (v as { toMillis?: () => number } | null)?.toMillis?.())
const asShift = (v: unknown): Shift => {
  const x = v as { s?: unknown; e?: unknown } | null
  return x && typeof x.s === 'string' && typeof x.e === 'string' ? { s: x.s, e: x.e } : null
}
const asPunch = (v: unknown): Punch | undefined => {
  const p = v as Record<string, unknown> | null
  return p && typeof p === 'object' ? { lat: num(p.lat), lng: num(p.lng), acc: num(p.acc), place: num(p.place), dev: str(p.dev, 40) } : undefined
}

export function toSettings(d: DocumentData | undefined): HrSettings {
  if (!d) return DEFAULT_SETTINGS
  const places = Array.isArray(d.places) ? d.places.map((p: Record<string, unknown>) => ({ name: str(p.name, 80), lat: num(p.lat), lng: num(p.lng), radius: num(p.radius, 100), kx: num(p.kx, metersPerLng(num(p.lat))) })) : []
  return { places, maxAcc: num(d.maxAcc, DEFAULT_SETTINGS.maxAcc), grace: num(d.grace, DEFAULT_SETTINGS.grace) }
}
export function toShifts(d: DocumentData | undefined): Shifts {
  const out: Shifts = {}
  for (const [uid, v] of Object.entries((d?.people ?? {}) as Record<string, Record<string, unknown>>)) {
    const plans = Array.isArray(v.plans) ? v.plans.map((p: Record<string, unknown>) => ({ from: str(p.from, 10), days: Object.fromEntries(Object.entries((p.days ?? {}) as Record<string, unknown>).map(([k, s]) => [k, asShift(s)])) })) : []
    const dates = Object.fromEntries(Object.entries((v.dates ?? {}) as Record<string, unknown>).map(([k, s]) => [k, asShift(s)]))
    out[uid] = { name: str(v.name, 200), plans, dates }
  }
  return out
}
export function toMonth(id: string, d: DocumentData): Month {
  const days: Record<string, Day> = {}
  for (const [k, v] of Object.entries((d.days ?? {}) as Record<string, Record<string, unknown>>)) {
    days[k] = { in: ms(v.in), out: ms(v.out), inP: asPunch(v.inP), outP: asPunch(v.outP), excused: v.excused === true, note: str(v.note, 500) || undefined, fixBy: str(v.fixBy, 200) || undefined }
  }
  const pens = Array.isArray(d.pens) ? d.pens.map((p: Record<string, unknown>) => ({ at: num(p.at), by: str(p.by, 128), byName: str(p.byName, 200), date: str(p.date, 10), amount: num(p.amount), unit: (UNITS as readonly string[]).includes(str(p.unit)) ? (p.unit as Unit) : 'EGP', reason: str(p.reason, 500) })) : []
  return { id, uid: str(d.uid, 128), month: str(d.month, 7), days, pens }
}

// ---------- Writing ----------

type Me = { uid: string; name: string }
function me(): Me {
  if (!firestore) return { uid: 'demo-you', name: 'You' }
  const u = getAuth(firestore.app).currentUser
  return { uid: u?.uid ?? '', name: myNameFor(u) }
}
export const myUid = () => me().uid

export type DayFix = { in?: number | null; out?: number | null; excused?: boolean; note?: string }

export interface HrBackend {
  loadSettings(): Promise<HrSettings>
  saveSettings(s: HrSettings): Promise<void>
  loadShifts(): Promise<Shifts>
  savePerson(uid: string, p: Person): Promise<void>
  watchMine(month: string, on: (m: Month | undefined) => void, onError: (e: Error) => void): () => void
  watchAll(month: string, on: (list: Month[]) => void, onError: (e: Error) => void): () => void
  /** The people a manager can give shifts to. */
  loadPeople(): Promise<{ uid: string; name: string }[]>
  clockIn(date: string, punch: Punch): Promise<void>
  clockOut(date: string, punch: Punch): Promise<void>
  fixDay(uid: string, date: string, fix: DayFix): Promise<void>
  addPenalty(uid: string, month: string, p: Omit<Penalty, 'at' | 'by' | 'byName'>): Promise<void>
  removePenalty(m: Month, index: number): Promise<void>
}

function firestoreHr(fs: NonNullable<typeof firestore>): HrBackend {
  const settingsRef = doc(fs, 'hr', 'settings')
  const shiftsRef = doc(fs, 'hr', 'shifts')
  const col = collection(fs, 'attendance')
  const punch = (date: string, kind: 'in' | 'out', p: Punch) => {
    const m = me()
    const month = monthOf(date)
    const dd = date.slice(8, 10)
    const field = kind === 'in' ? { in: serverTimestamp(), inP: p } : { out: serverTimestamp(), outP: p }
    return setDoc(doc(col, monthId(m.uid, month)), { uid: m.uid, month, last: dd, days: { [dd]: field } }, { merge: true })
  }
  return {
    async loadSettings() { return toSettings((await getDoc(settingsRef)).data()) },
    async saveSettings(s) { await setDoc(settingsRef, { places: s.places, maxAcc: s.maxAcc, grace: Math.round(s.grace) }) },
    async loadShifts() { return toShifts((await getDoc(shiftsRef)).data()) },
    async savePerson(uid, p) {
      // The whole person is replaced (a merge would keep one-day changes that were taken out).
      const clean: Person = { name: p.name.slice(0, 200), plans: p.plans, dates: p.dates }
      if ((await getDoc(shiftsRef)).exists()) await updateDoc(shiftsRef, { [`people.${uid}`]: clean })
      else await setDoc(shiftsRef, { people: { [uid]: clean } })
    },
    watchMine(month, on, onError) {
      return onSnapshot(doc(col, monthId(me().uid, month)), (s) => on(s.exists() ? toMonth(s.id, s.data()) : undefined), onError)
    },
    watchAll(month, on, onError) {
      return onSnapshot(query(col, where('month', '==', month)), (snap) => on(snap.docs.map((x) => toMonth(x.id, x.data()))), onError)
    },
    async loadPeople() {
      const snap = await getDocs(collection(fs, 'members'))
      return snap.docs.map((x) => ({ uid: x.id, name: str(x.data().name, 200) || str(x.data().email, 200) }))
    },
    clockIn: (date, p) => punch(date, 'in', p),
    clockOut: (date, p) => punch(date, 'out', p),
    async fixDay(uid, date, fix) {
      const month = monthOf(date)
      const dd = date.slice(8, 10)
      const at = (v: number | null | undefined) => (v === undefined ? undefined : v === null ? deleteField() : Timestamp.fromMillis(v))
      const patch: Record<string, unknown> = { [`days.${dd}.fixBy`]: me().name }
      if (fix.in !== undefined) patch[`days.${dd}.in`] = at(fix.in)
      if (fix.out !== undefined) patch[`days.${dd}.out`] = at(fix.out)
      if (fix.excused !== undefined) patch[`days.${dd}.excused`] = fix.excused
      if (fix.note !== undefined) patch[`days.${dd}.note`] = fix.note.trim().slice(0, 500)
      const ref = doc(col, monthId(uid, month))
      if (!(await getDoc(ref)).exists()) await setDoc(ref, { uid, month, days: {} })
      await updateDoc(ref, patch)
    },
    async addPenalty(uid, month, p) {
      const m = me()
      const ref = doc(col, monthId(uid, month))
      const snap = await getDoc(ref)
      const pens = snap.exists() ? toMonth(snap.id, snap.data()).pens : []
      const pen: Penalty = { ...p, reason: p.reason.trim().slice(0, 500), at: Date.now(), by: m.uid, byName: m.name }
      if (snap.exists()) await updateDoc(ref, { pens: [...pens, pen] })
      else await setDoc(ref, { uid, month, days: {}, pens: [pen] })
    },
    async removePenalty(m, index) {
      await updateDoc(doc(col, m.id), { pens: m.pens.filter((_, i) => i !== index) })
    },
  }
}

// ---------- Demo mode: kept in this browser ----------

const LOCAL_KEY = 'posterpilot.demo.hr.v1'
type Local = { settings: HrSettings; shifts: Shifts; months: Month[] }
const listeners = new Set<() => void>()

const SHOP: Place = { name: 'Static shop', lat: 30.0626, lng: 31.3363, radius: 120, kx: metersPerLng(30.0626) }

function demoData(): Local {
  const today = cairoNow().date
  const now = Date.now()
  const week = (s: string, e: string, off: number[]): Record<string, Shift> => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), off.includes(d) ? null : { s, e }]))
  const shifts: Shifts = {
    'demo-you': { name: 'You', plans: [{ from: '2026-01-01', days: week('11:00', '19:00', [5]) }], dates: {} },
    mona: { name: 'Mona Adel', plans: [{ from: '2026-01-01', days: week('11:00', '19:00', [5]) }], dates: {} },
    yousef: { name: 'Yousef Kamal', plans: [{ from: '2026-01-01', days: week('13:00', '21:00', [5, 6]) }], dates: {} },
    ahmed: { name: 'Ahmed Samy', plans: [{ from: '2026-01-01', days: week('14:00', '22:00', [5]) }], dates: { [addDays(today, 2)]: null } },
    karim: { name: 'Karim Fathy', plans: [{ from: '2026-01-01', days: week('20:00', '02:00', [4]) }], dates: {} },
  }
  // A few weeks of clock-ins with some late days, early leaves and one absence, drawn the same way every time.
  let seed = 7
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const months = new Map<string, Month>()
  const spot = (dev: string): Punch => ({ lat: SHOP.lat + (rnd() - 0.5) * 0.0006, lng: SHOP.lng + (rnd() - 0.5) * 0.0006, acc: Math.round(8 + rnd() * 30), place: 0, dev })
  for (const [uid, p] of Object.entries(shifts)) {
    for (let n = 34; n >= 0; n--) {
      const date = addDays(today, -n)
      const sh = shiftOn(p, date)
      if (!sh) continue
      const start = cairoMs(date, sh.s)
      const end = start + shiftMinutes(sh) * 60_000
      if (start > now) continue
      const r = rnd()
      if (r < 0.04 && n > 0) continue // absent
      const lateBy = r < 0.25 ? Math.round(12 + rnd() * 40) : Math.round(-10 + rnd() * 18)
      const inAt = start + lateBy * 60_000
      if (inAt > now) continue
      const leaveEarly = rnd() < 0.12 ? Math.round(15 + rnd() * 45) : -Math.round(rnd() * 15)
      const outAt = end - leaveEarly * 60_000
      const dev = uid === 'ahmed' && n === 3 ? 'k2p9-other' : `${uid}-phone`
      const day: Day = { in: inAt, inP: spot(dev) }
      if (outAt < now) { day.out = outAt; day.outP = spot(dev) }
      const month = monthOf(date)
      const m = months.get(`${uid}_${month}`) ?? { id: `${uid}_${month}`, uid, month, days: {}, pens: [] }
      m.days[date.slice(8, 10)] = day
      months.set(m.id, m)
    }
  }
  const cur = months.get(`yousef_${monthOf(today)}`)
  if (cur) cur.pens.push({ at: now - 86400_000 * 3, by: 'demo-you', byName: 'You', date: addDays(today, -3), amount: 0.5, unit: 'days', reason: 'Came 50 minutes late without telling anyone.' })
  // Today: you have not clocked in yet, so the button can be tried.
  const mine = months.get(`demo-you_${monthOf(today)}`)
  if (mine) delete mine.days[today.slice(8, 10)]
  return { settings: { places: [SHOP], maxAcc: 100, grace: 10 }, shifts, months: [...months.values()] }
}

let mem: Local | null = null
const load = (): Local => {
  if (mem) return mem
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (raw) return (mem = JSON.parse(raw) as Local)
  } catch { /* fall back to the samples */ }
  return (mem = demoData())
}
const save = (next: Local) => {
  mem = next
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)) } catch { /* the demo lasts for this visit */ }
  listeners.forEach((l) => l())
}
const changeMonth = (uid: string, month: string, f: (m: Month) => Month) => {
  const all = load()
  const id = monthId(uid, month)
  const cur = all.months.find((x) => x.id === id) ?? { id, uid, month, days: {}, pens: [] }
  save({ ...all, months: [...all.months.filter((x) => x.id !== id), f(cur)] })
}

function localHr(): HrBackend {
  const watch = <T,>(get: () => T, on: (v: T) => void) => {
    const send = () => on(get())
    send()
    listeners.add(send)
    return () => { listeners.delete(send) }
  }
  return {
    async loadSettings() { return load().settings },
    async saveSettings(s) { save({ ...load(), settings: s }) },
    async loadShifts() { return load().shifts },
    async savePerson(uid, p) { save({ ...load(), shifts: { ...load().shifts, [uid]: p } }) },
    watchMine: (month, on) => watch(() => load().months.find((x) => x.id === monthId('demo-you', month)), on),
    watchAll: (month, on) => watch(() => load().months.filter((x) => x.month === month), on),
    async loadPeople() { return Object.entries(load().shifts).map(([uid, p]) => ({ uid, name: p.name })).concat([{ uid: 'sara', name: 'Sara Nabil' }]) },
    async clockIn(date, p) { changeMonth('demo-you', monthOf(date), (m) => ({ ...m, days: { ...m.days, [date.slice(8, 10)]: { in: Date.now(), inP: p } } })) },
    async clockOut(date, p) { changeMonth('demo-you', monthOf(date), (m) => ({ ...m, days: { ...m.days, [date.slice(8, 10)]: { ...m.days[date.slice(8, 10)], out: Date.now(), outP: p } } })) },
    async fixDay(uid, date, fix) {
      changeMonth(uid, monthOf(date), (m) => {
        const dd = date.slice(8, 10)
        const d: Day = { ...m.days[dd], fixBy: 'You' }
        if (fix.in !== undefined) { if (fix.in === null) delete d.in; else d.in = fix.in }
        if (fix.out !== undefined) { if (fix.out === null) delete d.out; else d.out = fix.out }
        if (fix.excused !== undefined) d.excused = fix.excused
        if (fix.note !== undefined) d.note = fix.note
        return { ...m, days: { ...m.days, [dd]: d } }
      })
    },
    async addPenalty(uid, month, p) { changeMonth(uid, month, (m) => ({ ...m, pens: [...m.pens, { ...p, at: Date.now(), by: 'demo-you', byName: 'You' }] })) },
    async removePenalty(m, index) { changeMonth(m.uid, m.month, (x) => ({ ...x, pens: x.pens.filter((_, i) => i !== index) })) },
  }
}

export const hr: HrBackend = firestore ? firestoreHr(firestore) : localHr()
