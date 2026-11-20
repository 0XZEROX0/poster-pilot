import { describe as group, expect, it } from 'vitest'
import { demoReport, ignoredError, overall, spanLabel, type HealthState } from '../src/data/health'

const id = (s: string) => s
const state = (s: Partial<HealthState>): HealthState => ({ state: 'ok', report: null, checkedAt: 0, lastSeen: 0, ...s })

group('system health', () => {
  it('says how long in short words', () => {
    expect(spanLabel(20_000, id)).toBe('1 min')
    expect(spanLabel(38 * 60_000, id)).toBe('38 min')
    expect(spanLabel(144 * 60_000, id)).toBe('2 h 24 min')
    expect(spanLabel(3 * 3_600_000, id)).toBe('3 h')
    expect(spanLabel(3 * 86_400_000, id)).toBe('3 days')
  })
  it('builds a full sample report for both ranges', () => {
    const now = Date.UTC(2026, 10, 20, 8, 0)
    const day = demoReport('24h', now)
    expect(day.rows).toHaveLength(7)
    expect(day.rows.every((r) => r.cells.length === 48)).toBe(true)
    expect(day.rows[0].cells).toContain('bad')
    const week = demoReport('7d', now)
    expect(week.rows.every((r) => r.cells.length === 56)).toBe(true)
    expect(week.size).toBe(3 * 3_600_000)
  })
  it('counts only problems that exist now', () => {
    const report = demoReport('24h')
    // The sample night had an internet cut and failed runs, but all is back: the page is green.
    expect(overall(state({ report }))).toBe('good')
    const failing = { ...report, tiles: { ...report.tiles, workflows: { ...report.tiles.workflows, state: 'warn' as const, since: 2 } } }
    expect(overall(state({ report: failing }))).toBe('warn')
    const noNet = { ...report, tiles: { ...report.tiles, internet: { ...report.tiles.internet, state: 'bad' as const } } }
    expect(overall(state({ report: noNet }))).toBe('bad')
    expect(overall(state({ state: 'down' }))).toBe('bad')
    expect(overall(state({ state: 'offline' }))).toBe('none')
  })
  it('leaves out errors that are not the app\'s fault', () => {
    expect(ignoredError('ResizeObserver loop limit exceeded')).toBe(true)
    expect(ignoredError('Missing or insufficient permissions.')).toBe(true)
    expect(ignoredError('')).toBe(true)
    expect(ignoredError("Cannot read properties of undefined (reading 'price')")).toBe(false)
  })
})
