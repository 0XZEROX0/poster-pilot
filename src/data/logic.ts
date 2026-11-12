import type { CaptionTemplate, Post } from './types'

/** Where a post is in its life. Each post is in exactly one stage. */
export type Stage = 'building' | 'fix' | 'review' | 'scheduled' | 'posted' | 'skipped'

const FB_FINE = new Set(['', 'Scheduled', 'Published'])

/** A problem the person has to act on, or null. */
export function problemOf(p: Post): { kind: 'photo' | 'background' | 'ai' | 'facebook' | 'instagram'; text: string } | null {
  const s = p.photoStatus.trim()
  if (s && s !== 'OK') {
    const up = s.toUpperCase()
    if (up.startsWith('MISSING')) return { kind: 'photo', text: s }
    if (up.startsWith('BACKGROUND')) return { kind: 'background', text: s }
    return { kind: 'ai', text: s }
  }
  if (!FB_FINE.has(p.fbStatus.trim())) return { kind: 'facebook', text: p.fbStatus }
  const ig = p.igStatus.trim()
  if (ig && /error|fail/i.test(ig)) return { kind: 'instagram', text: ig }
  return null
}

export function stageOf(p: Post): Stage {
  if (p.fbStatus.trim() === 'Published') return 'posted'
  if (problemOf(p)) return 'fix'
  if (p.feedback === 'Redo' || !p.posterUrl || !p.photoStatus) return 'building'
  if (p.feedback === 'ignore') return 'skipped'
  if (p.feedback === 'Done') return 'scheduled'
  return 'review'
}

export const titleOf = (p: Post) => p.items.map((i) => i.name.trim()).filter(Boolean).join(' + ')

/** The price shown on the poster: the offer price when there is one. */
export const priceOf = (p: Pick<Post, 'priceBefore' | 'priceAfter'>) => p.priceAfter.trim() || p.priceBefore.trim()

export const hasOffer = (p: Pick<Post, 'priceBefore' | 'priceAfter'>) =>
  Boolean(p.priceAfter.trim()) && toNumber(p.priceAfter) < toNumber(p.priceBefore)

export const toNumber = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0

export const formatPrice = (s: string) => {
  const n = toNumber(s)
  return n ? n.toLocaleString('en-US') : s.trim()
}

/**
 * Fills a caption template the way the engine does: {name} {price} {before} {category} {company}
 * {details}. A line whose placeholder has no value is dropped.
 */
export function buildCaption(p: Pick<Post, 'items' | 'company' | 'priceBefore' | 'priceAfter' | 'details' | 'captionStyle'>, templates: CaptionTemplate[]): string {
  const wanted = p.captionStyle.trim().toLowerCase()
  const tpl = templates.find((t) => t.name.trim().toLowerCase() === wanted) ?? templates.find((t) => t.name.trim().toLowerCase() === 'default') ?? templates[0]
  if (!tpl) return ''
  const values: Record<string, string> = {
    name: p.items.map((i) => i.name.trim()).filter(Boolean).join(' + '),
    price: formatPrice(priceOf(p)),
    before: hasOffer(p) ? formatPrice(p.priceBefore) : '',
    category: [...new Set(p.items.map((i) => i.category.trim()).filter(Boolean))].join(' + '),
    company: p.company.trim(),
    details: p.details.trim(),
  }
  return tpl.text
    .split('\n')
    .filter((line) => {
      const used = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
      return used.every((k) => !(k in values) || values[k])
    })
    .map((line) => line.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m)))
    .join('\n')
    .trim()
}

/** Today's date in Cairo, where the store and its posting schedule live. */
export function cairoNow(now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** When a post goes out: the engine's time when scheduled, else the time the person asked for. */
export function whenOf(p: Post): { date: string; time: string } | null {
  const m = p.scheduledFor.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/)
  if (m) return { date: m[1], time: m[2] }
  if (p.postDate && p.postTime) return { date: p.postDate, time: p.postTime }
  return null
}

/** The engine's automatic slots: 17:00 Cairo, then every 15 minutes, 5 a day. */
export const SLOT_START = '17:00'
export const SLOT_STEP_MIN = 15
export const SLOTS_PER_DAY = 5

export function nextFreeSlot(posts: Post[], now = cairoNow()): { date: string; time: string } {
  const taken = new Set(posts.map(whenOf).filter(Boolean).map((w) => `${w!.date} ${w!.time}`))
  const [h, m] = SLOT_START.split(':').map(Number)
  for (let day = 0; day < 120; day++) {
    const date = addDays(now.date, day)
    for (let k = 0; k < SLOTS_PER_DAY; k++) {
      const mins = h * 60 + m + k * SLOT_STEP_MIN
      const time = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
      // Facebook needs at least 15 minutes of notice.
      if (day === 0 && time <= addMinutes(now.time, 15)) continue
      if (!taken.has(`${date} ${time}`)) return { date, time }
    }
  }
  return { date: addDays(now.date, 1), time: SLOT_START }
}

export function addMinutes(time: string, n: number): string {
  const [h, m] = time.split(':').map(Number)
  const mins = Math.min(h * 60 + m + n, 23 * 60 + 59)
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

/** A Drive "view" link as a small image the browser can show; other links are returned unchanged. */
export function previewUrl(link: string, width = 900): string {
  const m = link.match(/drive\.google\.com\/file\/d\/([\w-]+)/) ?? link.match(/[?&]id=([\w-]+)/)
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w${width}` : link
}
