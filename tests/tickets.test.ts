import { describe, expect, it } from 'vitest'
import { applyStep, dueDate, matchesTicket, outcomeOf, progressOf, stageOf, ticketNo, waNumber, withoutStep, workdaysLeft, type Step, type StepKind, type Ticket } from '../src/data/tickets'

const st = (kind: StepKind): Step => ({ at: 0, by: 'u', byName: 'U', kind, note: '' })

describe('maintenance working days', () => {
  it('counts 14 working days without Friday and Saturday', () => {
    expect(dueDate('2026-11-16')).toBe('2026-12-06') // Monday -> Sunday three weeks on
    expect(dueDate('2026-11-20')).toBe('2026-12-09') // received on a Friday: Sunday is day 1
    expect(dueDate('2026-11-19', 1)).toBe('2026-11-22') // Thursday + 1 working day = Sunday
  })
  it('says how many working days are left, or how late it is', () => {
    expect(workdaysLeft('2026-11-16', '2026-12-06')).toBe(14)
    expect(workdaysLeft('2026-12-06', '2026-12-06')).toBe(0)
    expect(workdaysLeft('2026-12-08', '2026-12-06')).toBe(-2)
    expect(workdaysLeft('2026-11-26', '2026-11-29')).toBe(1) // Thu -> Sun crosses the weekend
  })
})

describe('ticket stages', () => {
  it('moves with the steps', () => {
    expect(stageOf([st('opened')])).toBe('waiting')
    expect(stageOf([st('opened'), st('received')])).toBe('store')
    expect(stageOf([st('opened'), st('received'), st('sent'), st('replaced')])).toBe('warranty')
    expect(progressOf([st('opened'), st('received'), st('sent'), st('replaced')])).toBe(3)
    expect(outcomeOf([st('fixed'), st('refused')])).toBe('refused')
    expect(stageOf([st('received'), st('back'), st('delivered')])).toBe('closed')
  })
  it('starts the clock when the product is received, and stops it if that step is taken out', () => {
    const tk = { steps: [st('opened')], receivedOn: '', dueOn: '' }
    const after = applyStep(tk, st('received'), '2026-11-16')
    expect(after).toMatchObject({ receivedOn: '2026-11-16', dueOn: '2026-12-06', closed: false })
    expect(applyStep(after, st('note'), '2026-11-20').dueOn).toBe('2026-12-06')
    expect(withoutStep(after, 1)).toMatchObject({ receivedOn: '', dueOn: '' })
    expect(applyStep(after, st('delivered'), '2026-11-20').closed).toBe(true)
  })
})

describe('ticket helpers', () => {
  it('formats numbers and WhatsApp phones', () => {
    expect(ticketNo(47)).toBe('T-0047')
    expect(waNumber('0101 234 5678')).toBe('201012345678')
    expect(waNumber('+20 101 234 5678')).toBe('201012345678')
  })
  it('finds tickets by phone, number or words', () => {
    const tk = { no: 47, customer: 'Omar Hassan', phone: '0101 234 5678', product: 'Samsung Odyssey G5', serial: 'HNTX7', problem: '', provider: '', providerRef: '' } as Ticket
    expect(matchesTicket(tk, '01012345')).toBe(true)
    expect(matchesTicket(tk, 'T-0047')).toBe(true)
    expect(matchesTicket(tk, 'odyssey omar')).toBe(true)
    expect(matchesTicket(tk, 'kingston')).toBe(false)
  })
})
