import type { Auth } from 'firebase/auth'

// After a change that the engine has to carry out (a new post, an approved offer, a Redo, a delete, a price
// list save, a competitor price check...), the app knocks on the engine's door so the right workflow starts at
// once instead of at its next timed check. The knock says which workflows to start (`run`, see EngineJob) and
// carries the person's sign-in token: the engine checks it with Google and that the person is a member, and
// otherwise ignores the call. If the knock does not arrive (engine computer off, no connection), nothing is lost:
// every workflow still picks the change up on its own schedule.
const URL = import.meta.env.VITE_ENGINE_NUDGE_URL as string | undefined
const WAIT_MS = 800

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
 */
export type EngineJob = 'app' | 'lists' | 'poster' | 'queue' | 'changes' | 'captions' | 'status' | 'instagram' | 'move' | 'market' | 'photos' | 'website' | 'pull'

let timer: ReturnType<typeof setTimeout> | undefined
const waiting = new Set<EngineJob>()

/** True when this build of the app can reach the engine. */
export const engineReachable = (): boolean => !!URL

async function send(auth: Auth, jobs: EngineJob[]): Promise<boolean> {
  if (!URL || !jobs.length) return false
  const user = auth.currentUser
  if (!user) return false
  const token = await user.getIdToken()
  // A form-encoded POST is a "simple" request, so the browser sends it without asking the server first.
  // With no-cors the answer cannot be read, so "sent" is the best the app can know.
  await fetch(URL, { method: 'POST', mode: 'no-cors', keepalive: true, body: new URLSearchParams({ token, run: jobs.join(',') }) })
  return true
}

/** Asks the engine to start these workflows now (default: carry out post changes). Several calls in a row send one knock. Never throws. */
export function nudgeEngine(auth: Auth | null | undefined, jobs: EngineJob[] = ['app']): void {
  if (!URL || !auth) return
  for (const j of jobs) waiting.add(j)
  clearTimeout(timer)
  timer = setTimeout(() => {
    const now = [...waiting]
    waiting.clear()
    send(auth, now).catch(() => {
      // The schedule is the fallback; nothing to tell the person.
    })
  }, WAIT_MS)
}

/** "Run now" from Settings: sends the knock straight away. Resolves to false when it could not be sent. */
export async function runEngineNow(auth: Auth | null | undefined, jobs: EngineJob[]): Promise<boolean> {
  if (!auth) return false
  try {
    return await send(auth, jobs)
  } catch {
    return false
  }
}
