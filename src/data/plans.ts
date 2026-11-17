import { getAuth } from 'firebase/auth'
import { myNameFor } from './profiles'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { firestore } from './firebase'
import { addDays } from './logic'

// Brainstorm: a draft plan of which approved post could go out on which day. One document per week,
//   plans/{the Saturday the week starts on}   { days: { 'YYYY-MM-DD': [postId, …] }, at, by, byName }
// It is only a plan. Nothing here sets a post's date or time, and nothing is scheduled on Facebook or Instagram.

/** Each day of the week (YYYY-MM-DD) and the posts planned for it, in order. */
export type WeekPlan = Record<string, string[]>

/** In Egypt the week starts on Saturday. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay() // Sunday 0 … Saturday 6
  return addDays(date, -((day + 1) % 7))
}

export const weekDays = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i))

/** The weeks that have at least one day in the month (YYYY-MM), each by its Saturday. */
export function weeksOfMonth(month: string): string[] {
  const first = `${month}-01`
  const last = addDays(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10), -1)
  const list: string[] = []
  for (let s = weekStart(first); s <= last; s = addDays(s, 7)) list.push(s)
  return list
}

/** Puts a post on a day (at the end, or before another post), taking it off any other day of the week first. */
export function placeIn(plan: WeekPlan, id: string, day: string, before?: string): WeekPlan {
  const next: WeekPlan = {}
  for (const [d, ids] of Object.entries(plan)) {
    const rest = ids.filter((x) => x !== id)
    if (rest.length) next[d] = rest
  }
  const list = [...(next[day] ?? [])]
  const at = before ? list.indexOf(before) : -1
  list.splice(at < 0 ? list.length : at, 0, id)
  next[day] = list
  return next
}

export function takeOut(plan: WeekPlan, id: string): WeekPlan {
  const next: WeekPlan = {}
  for (const [d, ids] of Object.entries(plan)) {
    const rest = ids.filter((x) => x !== id)
    if (rest.length) next[d] = rest
  }
  return next
}

/** Only the days of this week, only text ids, no empty days. */
export function cleanPlan(start: string, raw: unknown): WeekPlan {
  const days = new Set(weekDays(start))
  const plan: WeekPlan = {}
  if (!raw || typeof raw !== 'object') return plan
  for (const [d, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (!days.has(d) || !Array.isArray(ids)) continue
    const list = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 60))]
    if (list.length) plan[d] = list
  }
  return plan
}

export type PlanInfo = { plan: WeekPlan; byName: string; at: number }

// ---------- Demo mode: kept in this browser ----------
const LOCAL_KEY = 'posterpilot.plans'
const localListeners = new Set<() => void>()
function localAll(): Record<string, PlanInfo> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as Record<string, PlanInfo>
  } catch {
    return {}
  }
}

export const plans = {
  /** The plan of one week, as it changes. */
  watch(start: string, onData: (info: PlanInfo) => void): () => void {
    if (!firestore) {
      const send = () => { const p = localAll()[start]; onData({ plan: cleanPlan(start, p?.plan), byName: p?.byName ?? '', at: p?.at ?? 0 }) }
      send()
      localListeners.add(send)
      return () => localListeners.delete(send)
    }
    return onSnapshot(
      doc(firestore, 'plans', start),
      (snap) => {
        const d = snap.data()
        onData({ plan: cleanPlan(start, d?.days), byName: (d?.byName as string) ?? '', at: (d?.at as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now() })
      },
      () => onData({ plan: {}, byName: '', at: 0 }),
    )
  },
  async save(start: string, plan: WeekPlan): Promise<void> {
    const days = cleanPlan(start, plan)
    if (!firestore) {
      const all = localAll()
      all[start] = { plan: days, byName: '', at: Date.now() }
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(all)) } catch { /* the plan then lasts for this visit */ }
      localListeners.forEach((l) => l())
      return
    }
    const me = getAuth(firestore.app).currentUser
    if (!me) return
    await setDoc(doc(firestore, 'plans', start), { days, at: serverTimestamp(), by: me.uid, byName: myNameFor(me) })
  },
}
