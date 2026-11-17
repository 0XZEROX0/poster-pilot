import type { Auth } from 'firebase/auth'
import { useSyncExternalStore } from 'react'

// After a change that the engine has to carry out (a new post, an approved offer, a Redo, a delete, a price
// list save, a competitor price check...), the app knocks on the engine's door so the right workflow starts at
// once instead of at its next timed check. The knock says which workflows to start (`run`, see EngineJob) and
// carries the person's sign-in token: the engine checks it with Google and that the person is a member, and
// otherwise ignores the call.
//
// Several changes in a row send one knock: the app waits until nothing new has come for SETTLE_MS, but never
// longer than MAX_WAIT_MS after the first change, so a long run of edits is not held back.
// The engine answers each knock ("received"). If it does not, the app knocks again a few times (RETRY_MS).
// If the knock still does not arrive (engine computer off, no connection), nothing is lost: every workflow
// still picks the change up at its next timed check. The app shows how the last knock went (useEngineSignal).
const URL = import.meta.env.VITE_ENGINE_NUDGE_URL as string | undefined
const SETTLE_MS = 3000
const MAX_WAIT_MS = 15000
const RETRY_MS = [3000, 10000, 30000]

/**
 * What the engine can start:
 * - app: carry out post changes (and from there the poster and scheduling parts they need)
 * - lists: product list and prices of open posts from the price list
 * - poster: build posters
 * - queue, changes, captions, status, instagram: the parts of the Facebook/Instagram scheduler
 * - move: move published posters in Drive
 * - market: competitor prices
 * - photos: website photos for the photo picker
 * - website: send price list changes to the website; pull: read changes made on the website
 * - orders: send order status changes to the website and read new orders
 * - takedown: delete published posts from Facebook and Instagram (posts with takeDown 'asked')
 */
export type EngineJob = 'app' | 'lists' | 'poster' | 'queue' | 'changes' | 'captions' | 'status' | 'instagram' | 'move' | 'market' | 'photos' | 'website' | 'pull' | 'takedown' | 'orders'

/**
 * How the last knock went:
 * - heard: the engine answered that it received it
 * - sent: it went out but the answer could not be read (the engine was reached, most likely fine)
 * - trying: it did not arrive yet; the app tries again in a few seconds
 * - failed: it did not arrive after a few tries; the change waits for the engine's next timed check
 */
export type EngineSignal = { state: 'heard' | 'sent' | 'trying' | 'failed'; at: number }

let signal: EngineSignal | null = null
const listeners = new Set<() => void>()
function setSignal(state: EngineSignal['state']): void {
  signal = { state, at: Date.now() }
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
const current = () => signal

/** How the last knock to the engine went (null until the app has knocked once). */
export function useEngineSignal(): EngineSignal | null {
  return useSyncExternalStore(subscribe, current, current)
}

let timer: ReturnType<typeof setTimeout> | undefined
let firstAt = 0
let tries = 0
const waiting = new Set<EngineJob>()

/** True when this build of the app can reach the engine. */
export const engineReachable = (): boolean => !!URL

/** Sends one knock. Resolves to 'heard', 'sent' (reached, answer unreadable) or 'failed'. Never throws. */
async function send(auth: Auth, jobs: EngineJob[]): Promise<'heard' | 'sent' | 'failed'> {
  if (!URL || !jobs.length) return 'failed'
  const user = auth.currentUser
  if (!user) return 'failed'
  let token: string
  try {
    token = await user.getIdToken()
  } catch {
    return 'failed'
  }
  // A form-encoded POST is a "simple" request, so the browser sends it without asking the server first.
  // The engine allows this app's address (CORS), so the app can read that the engine answered.
  const body = () => new URLSearchParams({ token, run: jobs.join(',') })
  try {
    const res = await fetch(URL, { method: 'POST', keepalive: true, body: body() })
    return res.ok ? 'heard' : 'failed'
  } catch {
    // Either the engine was not reached, or it answered without allowing this address (then the answer
    // cannot be read). Knock once more without reading the answer to tell the two apart.
    try {
      await fetch(URL, { method: 'POST', mode: 'no-cors', keepalive: true, body: body() })
      return 'sent'
    } catch {
      return 'failed'
    }
  }
}

function schedule(auth: Auth, ms: number): void {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const now = [...waiting]
    waiting.clear()
    firstAt = 0
    void send(auth, now).then((res) => {
      if (res !== 'failed') {
        tries = 0
        setSignal(res)
        // Jobs that came in while this knock was on its way go in the next one.
        if (waiting.size) schedule(auth, SETTLE_MS)
        return
      }
      // Not received: put the jobs back (with anything that came meanwhile) and try again a bit later.
      for (const j of now) waiting.add(j)
      if (tries < RETRY_MS.length) {
        setSignal('trying')
        schedule(auth, RETRY_MS[tries++])
      } else {
        tries = 0
        waiting.clear()
        setSignal('failed')
      }
    })
  }, ms)
}

/** Asks the engine to start these workflows now (default: carry out post changes). Several calls in a row send one knock. Never throws. */
export function nudgeEngine(auth: Auth | null | undefined, jobs: EngineJob[] = ['app']): void {
  if (!URL || !auth) return
  for (const j of jobs) waiting.add(j)
  if (tries > 0) return // a retry is already planned; the new jobs go with it
  const now = Date.now()
  if (!firstAt) firstAt = now
  schedule(auth, Math.max(0, Math.min(SETTLE_MS, firstAt + MAX_WAIT_MS - now)))
}

/** "Run now" from Settings: sends the knock straight away. Resolves to false when it could not be sent. */
export async function runEngineNow(auth: Auth | null | undefined, jobs: EngineJob[]): Promise<boolean> {
  if (!auth) return false
  const res = await send(auth, jobs)
  setSignal(res)
  return res !== 'failed'
}
