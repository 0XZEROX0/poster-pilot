import { getAuth } from 'firebase/auth'
import { useSyncExternalStore } from 'react'
import { firestore } from './firebase'

// System health: how the server, its internet, n8n, the workflows, the website, Facebook/Instagram and the app are doing.
// Everything comes from the engine's health link (n8n "Static OS - Health"), never from the database, so watching it
// costs no Firestore reads. The link only answers signed-in members.
//
// While the app is open (and the tab is visible) it asks every few minutes. If the engine does not answer while this
// phone or computer is online, the server is offline: power, internet, or the link. That is how an outage shows even
// though nothing on the server can report it.
const NUDGE = import.meta.env.VITE_ENGINE_NUDGE_URL as string | undefined
export const HEALTH_URL = NUDGE ? NUDGE.replace(/static-os-nudge\/?$/, 'static-os-health') : ''
const EVERY_MS = 5 * 60_000
const RETRY_MS = 60_000
const KEY_SEEN = 'posterpilot.health.seen'
const KEY_ERRORS = 'posterpilot.health.errors'

export type Level = 'good' | 'warn' | 'bad' | 'none'
export type HealthRow = { key: string; label: string; cells: Level[]; uptime: number | null }
export type HealthEvent = { at: number; to: number; level: Level; title: string; detail: string; kind?: string; count?: number; node?: string; people?: number }
export type HealthTiles = {
  internet: { state: Level; since?: number; lastOut?: { from: number; to: number } | null }
  server: { state: Level; at?: number; up?: number; disk?: number; note?: string; restarted?: number }
  n8n: { state: Level; lastCheck?: number }
  workflows: { state: Level; failed24?: number; since?: number; lastAt?: number; lastOutTo?: number; explained?: number }
  website: { state: Level; at?: number }
  meta: { state: Level; at?: number }
  app: { state: Level; today?: number }
}
export type HealthReport = { ok: true; at: number; range: '24h' | '7d'; size: number; start: number; rows: HealthRow[]; tiles: HealthTiles; events: HealthEvent[]; since: number }

/**
 * - ok: the engine answered (report holds the details)
 * - down: the engine did not answer while this device is online, so the server side is offline
 * - offline: this device has no internet, so nothing can be said about the server
 * - refused: the engine answered but would not give the report (signed out, not a member)
 * - checking: the first answer has not come yet
 */
export type HealthState = { state: 'ok' | 'down' | 'offline' | 'refused' | 'checking'; report: HealthReport | null; checkedAt: number; lastSeen: number }

const readSeen = (): number => {
  try { return Number(localStorage.getItem(KEY_SEEN)) || 0 } catch { return 0 }
}
let current: HealthState = { state: 'checking', report: null, checkedAt: 0, lastSeen: readSeen() }
const listeners = new Set<() => void>()
const put = (patch: Partial<HealthState>) => {
  current = { ...current, ...patch }
  if (patch.lastSeen) try { localStorage.setItem(KEY_SEEN, String(patch.lastSeen)) } catch { /* only kept for this visit */ }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
export const useHealth = (): HealthState => useSyncExternalStore(subscribe, () => current, () => current)

async function token(): Promise<string> {
  if (!firestore) return ''
  try { return (await getAuth(firestore.app).currentUser?.getIdToken()) ?? '' } catch { return '' }
}

/** True when this device can reach the internet at all (a tiny Google page, answer not read). */
async function deviceOnline(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  try {
    await fetch('https://www.gstatic.com/generate_204', { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(8000) })
    return true
  } catch {
    return false
  }
}

async function post(fields: Record<string, string>, ms = 20000): Promise<Response> {
  // A form-encoded POST is a "simple" request, so the browser sends it without asking the server first.
  return fetch(HEALTH_URL, { method: 'POST', body: new URLSearchParams(fields), cache: 'no-store', signal: AbortSignal.timeout(ms) })
}

let range: '24h' | '7d' = '24h'
let busy = false

/** Asks the engine for the report now. Never throws. */
export async function checkHealth(nextRange?: '24h' | '7d'): Promise<void> {
  if (nextRange) range = nextRange
  if (!firestore) {
    // Demo mode: sample numbers. ?health=down shows how an outage looks.
    if (new URLSearchParams(location.search).get('health') === 'down') return put({ state: 'down', report: demoReport(range, Date.now() - 38 * 60_000), checkedAt: Date.now(), lastSeen: Date.now() - 38 * 60_000 })
    return put({ state: 'ok', report: demoReport(range), checkedAt: Date.now(), lastSeen: Date.now() })
  }
  if (!HEALTH_URL || busy) return
  const tok = await token()
  if (!tok) return
  busy = true
  try {
    const res = await post({ token: tok, op: 'get', range })
    if (res.status === 403) return put({ state: 'refused', checkedAt: Date.now() })
    const report = (await res.json()) as HealthReport
    if (!report?.ok) throw new Error('bad answer')
    put({ state: 'ok', report, checkedAt: Date.now(), lastSeen: Date.now() })
    void flushErrors(tok)
  } catch {
    put({ state: (await deviceOnline()) ? 'down' : 'offline', checkedAt: Date.now() })
  } finally {
    busy = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
let watching = 0
function plan() {
  clearTimeout(timer)
  if (!watching) return
  timer = setTimeout(async () => {
    if (document.visibilityState === 'visible') await checkHealth()
    plan()
  }, current.state === 'down' || current.state === 'offline' ? RETRY_MS : EVERY_MS)
}
const onVisible = () => {
  if (document.visibilityState !== 'visible' || !watching) return
  if (Date.now() - current.checkedAt > 60_000) void checkHealth().then(plan)
}

/** Starts watching (the app does this once someone who may see System health is in). Returns the stop. */
export function watchHealth(): () => void {
  if (!HEALTH_URL && firestore) return () => {}
  watching++
  if (watching === 1) {
    document.addEventListener('visibilitychange', onVisible)
    void checkHealth().then(plan)
  }
  return () => {
    watching--
    if (!watching) {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }
}

// ---- errors the app runs into, for the "App errors" part of the page ----
type AppError = { at: number; where: string; msg: string; page: string }

const readErrors = (): AppError[] => {
  try { return JSON.parse(localStorage.getItem(KEY_ERRORS) || '[]') as AppError[] } catch { return [] }
}
const writeErrors = (list: AppError[]) => {
  try { localStorage.setItem(KEY_ERRORS, JSON.stringify(list.slice(-50))) } catch { /* lost with the page */ }
}
let lastKey = ''
let lastAt = 0
let flushTimer: ReturnType<typeof setTimeout> | undefined

/** Messages that are not the app's fault and would only add noise. */
export const ignoredError = (msg: string): boolean =>
  !msg ||
  /ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:|AbortError|The user aborted|Load failed$|Failed to fetch$|NetworkError when attempting|network-request-failed|permission-denied|Missing or insufficient permissions/i.test(msg)

/**
 * Keeps an error the app ran into (a crash, a save that failed) and sends it to the engine with the next health check,
 * or within a few seconds. The same message is kept once per minute at most. Never throws.
 */
export function reportAppError(where: string, err: unknown): void {
  try {
    const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)
    const msg = String(raw || '').replace(/\s+/g, ' ').slice(0, 300)
    if (ignoredError(msg)) return
    const key = `${where}|${msg}`
    if (key === lastKey && Date.now() - lastAt < 60_000) return
    lastKey = key
    lastAt = Date.now()
    writeErrors([...readErrors(), { at: Date.now(), where: where.slice(0, 60), msg, page: location.hash.replace(/^#\//, '').split('/')[0] || 'home' }])
    clearTimeout(flushTimer)
    flushTimer = setTimeout(() => { void token().then((tok) => (tok ? flushErrors(tok) : undefined)) }, 5000)
  } catch {
    // Reporting must never break the app.
  }
}

async function flushErrors(tok: string): Promise<void> {
  const list = readErrors()
  if (!list.length || !HEALTH_URL) return
  const batch = list.slice(0, 20)
  try {
    const res = await post({ token: tok, op: 'report', errors: JSON.stringify(batch) }, 15000)
    if (res.ok) writeErrors(readErrors().slice(batch.length))
  } catch {
    // Kept; sent with the next check.
  }
}

/** Catches crashes anywhere in the app (called once at start). */
export function catchAppErrors(): void {
  window.addEventListener('error', (e) => reportAppError('Crash', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportAppError('Crash', e.reason))
}

// ---- small helpers for the page ----
/** "2 h 26 min", "38 min", "3 days". */
export function spanLabel(ms: number, t: (s: string) => string): string {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `${min} ${t('min')}`
  const h = Math.floor(min / 60)
  if (h < 48) return min % 60 ? `${h} ${t('h')} ${min % 60} ${t('min')}` : `${h} ${t('h')}`
  return `${Math.round(h / 24)} ${t('days')}`
}

/** The overall word for the page: everything fine, something to look at, or something down. */
export function overall(h: HealthState): Level {
  if (h.state === 'down') return 'bad'
  if (h.state !== 'ok' || !h.report) return 'none'
  // Only what is wrong now counts: failed runs or app errors that are already over (an internet cut that came back,
  // a crash yesterday) show on the timeline and in What happened, not as a problem now.
  const T = h.report.tiles
  const now = [T.internet.state, T.server.state, T.website.state, T.meta.state, T.n8n.state, (T.workflows.since ?? 0) > 0 ? T.workflows.state : 'good']
  return now.includes('bad') ? 'bad' : now.includes('warn') ? 'warn' : 'good'
}

/** Sample report for demo mode: a night when the server lost its internet for about two and a half hours. */
export function demoReport(r: '24h' | '7d' = '24h', now = Date.now()): HealthReport {
  const size = r === '7d' ? 3 * 3_600_000 : 1_800_000
  const count = r === '7d' ? 56 : 48
  const start = Math.floor((now - count * size) / size) * size + size - size
  const from = now - 8 * 3_600_000
  const to = from + 2.4 * 3_600_000
  const cut = (i: number) => start + (i + 1) * size > from && start + i * size < to
  const cells = (fn: (i: number) => Level) => Array.from({ length: count }, (_, i) => fn(i))
  const rows: HealthRow[] = [
    { key: 'internet', label: 'Internet', cells: cells((i) => (cut(i) ? 'bad' : 'good')), uptime: 0 },
    { key: 'server', label: 'Server PC', cells: cells(() => 'good'), uptime: 0 },
    { key: 'n8n', label: 'n8n engine', cells: cells(() => 'good'), uptime: 0 },
    { key: 'workflows', label: 'Workflows', cells: cells((i) => (cut(i) ? 'bad' : i === Math.floor(count * 0.3) ? 'warn' : 'good')), uptime: 0 },
    { key: 'website', label: 'Website', cells: cells((i) => (cut(i) ? 'warn' : 'good')), uptime: 0 },
    { key: 'meta', label: 'Facebook/IG', cells: cells(() => 'good'), uptime: 0 },
    { key: 'app', label: 'App', cells: cells((i) => (i === Math.floor(count * 0.6) ? 'warn' : 'good')), uptime: 0 },
  ]
  for (const row of rows) row.uptime = Math.round((row.cells.filter((c) => c === 'good').length / count) * 1000) / 10
  const appAt = start + Math.floor(count * 0.6) * size + 600_000
  return {
    ok: true, at: now, range: r, size, start, rows, since: start,
    tiles: {
      internet: { state: 'good', since: 0, lastOut: { from, to } },
      server: { state: 'good', at: now - 120_000, up: 3 * 86_400 + 5 * 3600, disk: 61, note: '' },
      n8n: { state: 'good', lastCheck: now - 60_000 },
      workflows: { state: 'warn', failed24: 116, since: 0, lastAt: to - 300_000, lastOutTo: to, explained: 115 },
      website: { state: 'good', at: now - 400_000 },
      meta: { state: 'good', at: now - 400_000 },
      app: { state: 'warn', today: 1 },
    },
    events: [
      { at: appAt, to: appAt, level: 'warn', kind: 'app', title: 'App error · Save', detail: 'Saving the quote took too long. It was saved on the next try.', count: 1, people: 1 },
      { at: from, to, level: 'bad', title: 'Internet down at the server', detail: 'The server could not reach the internet. n8n kept running, but 115 workflow runs failed because of it. It came back on its own.' },
      { at: start + Math.floor(count * 0.3) * size + 300_000, to: start + Math.floor(count * 0.3) * size + 300_000, level: 'warn', kind: 'workflow', title: 'Static OS - Website sync', node: 'Send to website', detail: 'The website answered 502 Bad Gateway.', count: 1 },
    ],
  }
}
