import type { Auth } from 'firebase/auth'

// After a change that the engine has to carry out (a new post, an approved offer, a Redo, a delete...),
// the app knocks on the engine's door so it starts at once instead of at its next one-minute check.
// The engine then starts the poster workflow right away when a post needs a poster.
// The knock carries only the person's sign-in token: the engine checks it with Google and that the
// person is a member, and otherwise ignores the call. If the knock does not arrive (engine computer off,
// no connection), nothing is lost: the engine and the poster workflow still pick the change up on their schedule.
const URL = import.meta.env.VITE_ENGINE_NUDGE_URL as string | undefined
const WAIT_MS = 800

let timer: ReturnType<typeof setTimeout> | undefined

/** Asks the engine to run now. Several changes in a row send one knock. Never throws. */
export function nudgeEngine(auth: Auth | null | undefined): void {
  if (!URL || !auth) return
  clearTimeout(timer)
  timer = setTimeout(async () => {
    try {
      const user = auth.currentUser
      if (!user) return
      const token = await user.getIdToken()
      // A form-encoded POST is a "simple" request, so the browser sends it without asking the server first.
      await fetch(URL, { method: 'POST', mode: 'no-cors', keepalive: true, body: new URLSearchParams({ token }) })
    } catch {
      // The schedule is the fallback; nothing to tell the person.
    }
  }, WAIT_MS)
}
