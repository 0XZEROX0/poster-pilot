import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Auth } from 'firebase/auth'

// The knock to the engine: one knock for a burst of changes, at most 15 s after the first, and retries.
const auth = { currentUser: { getIdToken: async () => 'token' } } as unknown as Auth
type Call = { run: string; mode?: string }

async function load(answer: (i: number, mode?: string) => Promise<Response>) {
  vi.resetModules()
  vi.stubEnv('VITE_ENGINE_NUDGE_URL', 'https://engine.test/webhook/static-os-nudge')
  const calls: Call[] = []
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    calls.push({ run: new URLSearchParams(init.body as URLSearchParams).get('run') ?? '', mode: init.mode })
    return answer(calls.length - 1, init.mode)
  })
  const mod = await import('../src/data/nudge')
  return { ...mod, calls }
}
const ok = () => Promise.resolve(new Response('', { status: 200 }))
const flush = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms) }

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('nudgeEngine', () => {
  it('sends one knock 3 s after the last of several changes', async () => {
    const m = await load(ok)
    m.nudgeEngine(auth, ['app'])
    await flush(2000)
    m.nudgeEngine(auth, ['lists', 'website'])
    await flush(2900)
    expect(m.calls).toHaveLength(0)
    await flush(200)
    expect(m.calls).toHaveLength(1)
    expect(m.calls[0].run.split(',').sort()).toEqual(['app', 'lists', 'website'])
  })

  it('never holds changes longer than 15 s after the first', async () => {
    const m = await load(ok)
    for (let i = 0; i < 10; i++) { m.nudgeEngine(auth, ['app']); await flush(2000) }
    expect(m.calls.length).toBeGreaterThanOrEqual(1)
    expect(m.calls.length).toBeLessThanOrEqual(2)
  })

  it('tries again when the engine does not answer, then gives up', async () => {
    const m = await load(() => Promise.reject(new TypeError('offline')))
    m.nudgeEngine(auth, ['app'])
    await flush(3100)
    await flush(3100)
    await flush(10100)
    await flush(30100)
    // 4 knocks, each tried with and without reading the answer
    expect(m.calls).toHaveLength(8)
    await flush(60000)
    expect(m.calls).toHaveLength(8)
  })

  it('counts a knock that reached the engine without a readable answer as sent', async () => {
    const m = await load((_i, mode) => (mode === 'no-cors' ? ok() : Promise.reject(new TypeError('cors'))))
    m.nudgeEngine(auth, ['app'])
    await flush(3100)
    expect(m.calls.map((c) => c.mode)).toEqual([undefined, 'no-cors'])
    await flush(60000)
    expect(m.calls).toHaveLength(2)
  })
})
