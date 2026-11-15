import { describe, expect, it } from 'vitest'
import { emptyLine, misfit, totals, type Line } from '../src/data/builder'
import { casePsu, type PriceItem } from '../src/data/prices'

const P = (name: string, specs?: Record<string, string>): PriceItem => ({ id: name, name, in: null, alone: null, warranty: null, company: '', specs })
const L = (over: Partial<Line>): Line => ({ ...emptyLine('extra'), name: 'x', ...over })

describe('totals', () => {
  it('works like the sheet: price is alone, the build discount is alone minus in build, plus the extra', () => {
    const lines = [L({ alone: 5700, in: 5500 }), L({ alone: 11000, in: 10500, qty: 2 }), L({ name: '', alone: 999 })]
    expect(totals(lines, 100, true)).toEqual({ subtotal: 27700, saved: 1200, discount: 1300, total: 26400 })
    expect(totals(lines, 0, false)).toEqual({ subtotal: 27700, saved: 0, discount: 0, total: 27700 })
  })
  it('uses the other price when one is missing', () => {
    expect(totals([L({ alone: null, in: 400 }), L({ alone: 300, in: null })], 0, true).total).toBe(700)
  })
})

describe('misfit', () => {
  const mb = P('B850', { socket: 'AM5', memory: 'DDR5' })
  it('flags a CPU with another socket and RAM of another type', () => {
    expect(misfit('cpu', P('i5', { socket: 'LGA1700' }), [{ cat: 'mb', item: mb }])).toMatch(/LGA1700/)
    expect(misfit('cpu', P('7600X', { socket: 'am5' }), [{ cat: 'mb', item: mb }])).toBe('')
    expect(misfit('ram', P('8GB', { memory: 'DDR4' }), [{ cat: 'mb', item: mb }])).toMatch(/DDR4/)
  })
  it('checks a motherboard against the CPU and RAM already picked', () => {
    expect(misfit('mb', mb, [{ cat: 'cpu', item: P('i5', { socket: 'LGA 1700' }) }])).toMatch(/Socket/)
    expect(misfit('mb', mb, [{ cat: 'ram', item: P('16GB', { memory: 'DDR4' }) }])).toMatch(/RAM/)
  })
  it('says nothing when a spec is missing', () => {
    expect(misfit('cpu', P('x'), [{ cat: 'mb', item: mb }])).toBe('')
  })
})

describe('complete', () => {
  it('puts back one row of every standard kind, in order, keeping extra rows', async () => {
    const { complete, START_SLOTS } = await import('../src/data/builder')
    const out = complete([L({ slot: 'ssd', name: 'a' }), L({ slot: 'ssd', name: 'b' }), L({ slot: 'cpu', name: 'c' })])
    expect(out.filter((l) => l.slot === 'ssd').map((l) => l.name)).toEqual(['a', 'b'])
    expect(out.length).toBe(START_SLOTS.length + 1)
    expect(out[0].slot).toBe('mb')
    expect(out[1]).toMatchObject({ slot: 'cpu', name: 'c' })
  })
})

describe('cases that come with a power supply', () => {
  const box = (name: string, psu?: string): PriceItem => ({ id: name, name, in: 1, alone: 1, warranty: 1, company: '', specs: psu === undefined ? undefined : { psu } })
  it('reads the wattage from the name', () => {
    expect(casePsu(box('Xigmatek Osiris II 4 Fan ARGB + Valkyrie 750W ATX3.1 80+ Bronze'))).toBe('750W')
    expect(casePsu(box('AeroCool P500C ARGB + 600W 80+ '))).toBe('600W')
    expect(casePsu(box('Darkflash K430 BTF Case + GS750 ATX 3.1 80+ Bronze PSU + 4x DM20 ARGB Fans - Black'))).toBe('750W')
    expect(casePsu(box('Xigmatek Amun 3 Fan ARGB PWM + X Power 650W 80 Plus Micro Tower Case'))).toBe('650W')
  })
  it('finds none in plain cases', () => {
    for (const n of ['Xigmatek Osiris II 4 Fan ARGB', 'Darkflash DY470 ATX PC Case + 7 Fans', 'Xigmatek Cubi II 7 Fan ARGB LCD 9.18 DGT LCD Argb TypeC ', 'AeroCool P500C ARGB', 'ASUS TUF Gaming GT302 ARGB BLACK'])
      expect(casePsu(box(n))).toBe('')
  })
  it('lets the Prices page decide', () => {
    expect(casePsu(box('AeroCool P500C ARGB + 600W 80+', 'No'))).toBe('')
    expect(casePsu(box('Some case', '500W'))).toBe('500W')
  })
  it('warns about a second power supply', () => {
    const c = box('Xigmatek Blast II 4 Fan ARGB + 600W 80+')
    const psu = box('Some PSU 650W')
    expect(misfit('psu', psu, [{ cat: 'case', item: c }])).toMatch(/already comes with a 600W/)
    expect(misfit('case', c, [{ cat: 'psu', item: psu }])).toMatch(/separate PSU is not needed/)
    expect(misfit('psu', psu, [{ cat: 'case', item: box('Xigmatek Osiris II 4 Fan ARGB') }])).toBe('')
  })
})
