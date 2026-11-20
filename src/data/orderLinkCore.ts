import type { DocumentData } from 'firebase/firestore'
import type { Item } from './orders'

// Order links: a customer chatting on WhatsApp gets a short-lived link instead of going through the website.
//
//   orderLinks/{token}   one link; the token is a long random code, which is all the customer page knows
//
// 1. Someone with access to Orders picks the items and prices (from the price list or the website, changeable), a
//    discount, store pickup or home delivery with its fee, and how long the link works (one hour at most).
// 2. The customer opens order.html#<token>, sees the items and the total and types their name, phone, email and, for
//    delivery, the address. That is the only thing the page can write (firestore.rules), once, before the link expires.
// 3. The engine (n8n "Static OS - Website orders") makes it a website order (status On hold), then it shows in Orders
//    like any website order (New), tagged with the link and who made it. Payments are recorded on it as usual.
//
// States: open (waiting for the customer) -> filled (customer sent it) -> sending (engine is on it) -> done (website
// order wooId / number) or error (webError; someone can send it again). Open links can be cancelled.

// This part has no database code, so the customer page (order.html) can use it without loading the app.

const itemsTotal = (items: Pick<Item, 'total'>[]) => Math.round(items.reduce((n, x) => n + (x.total || 0), 0) * 100) / 100

export const LINK_STATES = ['open', 'filled', 'sending', 'done', 'error', 'cancelled'] as const
export type LinkState = (typeof LINK_STATES)[number]
/** How long a link may work, in minutes. The rules refuse more than an hour (with a few minutes for clocks that are off). */
export const LINK_MINUTES = [15, 30, 60] as const

/** What the customer types on the page. `area` is one of AREAS (English name). */
export type LinkForm = { name: string; phone: string; email: string; address: string; city: string; area: string; note: string }

export type OrderLink = {
  id: string
  state: LinkState
  items: Item[]
  /** Taken off the items' total (EGP). */
  discount: number
  delivery: 'pickup' | 'delivery'
  /** Delivery fee (0 for pickup). */
  shipping: number
  /** Pickup or delivery day (YYYY-MM-DD) and time (HH:MM), both optional. */
  date: string
  time: string
  /** Items - discount + delivery, what the customer sees. */
  total: number
  /** A short line from the shop shown on the page (optional). */
  note: string
  rep: string
  category: string
  by: string
  byName: string
  createdAt: number
  expiresAt: number
  form: LinkForm | null
  filledAt: number
  wooId: number
  number: string
  webError: string
  cancelledByName: string
}

/** Egypt's governorates: what the website calls them (WooCommerce state code), in English and Arabic. */
export const AREAS: { code: string; en: string; ar: string }[] = [
  { code: 'EGC', en: 'Cairo', ar: 'القاهرة' }, { code: 'EGGZ', en: 'Giza', ar: 'الجيزة' }, { code: 'EGALX', en: 'Alexandria', ar: 'الإسكندرية' },
  { code: 'EGKB', en: 'Qalyubia', ar: 'القليوبية' }, { code: 'EGSHR', en: 'Sharqia', ar: 'الشرقية' }, { code: 'EGDK', en: 'Dakahlia', ar: 'الدقهلية' },
  { code: 'EGGH', en: 'Gharbia', ar: 'الغربية' }, { code: 'EGMNF', en: 'Monufia', ar: 'المنوفية' }, { code: 'EGBH', en: 'Beheira', ar: 'البحيرة' },
  { code: 'EGKFS', en: 'Kafr el-Sheikh', ar: 'كفر الشيخ' }, { code: 'EGDT', en: 'Damietta', ar: 'دمياط' }, { code: 'EGPTS', en: 'Port Said', ar: 'بورسعيد' },
  { code: 'EGIS', en: 'Ismailia', ar: 'الإسماعيلية' }, { code: 'EGSUZ', en: 'Suez', ar: 'السويس' }, { code: 'EGFYM', en: 'Faiyum', ar: 'الفيوم' },
  { code: 'EGBNS', en: 'Beni Suef', ar: 'بني سويف' }, { code: 'EGMN', en: 'Minya', ar: 'المنيا' }, { code: 'EGAST', en: 'Asyut', ar: 'أسيوط' },
  { code: 'EGSHG', en: 'Sohag', ar: 'سوهاج' }, { code: 'EGKN', en: 'Qena', ar: 'قنا' }, { code: 'EGLX', en: 'Luxor', ar: 'الأقصر' },
  { code: 'EGASN', en: 'Aswan', ar: 'أسوان' }, { code: 'EGBA', en: 'Red Sea', ar: 'البحر الأحمر' }, { code: 'EGMT', en: 'Matrouh', ar: 'مطروح' },
  { code: 'EGWAD', en: 'New Valley', ar: 'الوادي الجديد' }, { code: 'EGJS', en: 'South Sinai', ar: 'جنوب سيناء' }, { code: 'EGSIN', en: 'North Sinai', ar: 'شمال سيناء' },
]

const round = (n: number) => Math.round(n * 100) / 100

/** What the customer pays: items - discount (never below 0) + delivery. */
export function linkTotal(items: Pick<Item, 'total'>[], discount: number, shipping: number): number {
  return round(Math.max(0, itemsTotal(items) - Math.max(0, discount || 0)) + Math.max(0, shipping || 0))
}

/** A new link's token: 28 random letters and digits (about 166 bits), so nobody can guess another customer's link. */
export function newToken(): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(28)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => abc[b % 62]).join('')
}
export const tokenOk = (s: string) => /^[A-Za-z0-9]{24,40}$/.test(s)

/** The customer page's address for a token, next to the app (same host, order.html). */
export function linkUrl(token: string, here = typeof location !== 'undefined' ? location.href : ''): string {
  return `${new URL('order.html', here.split('#')[0]).href}#${token}`
}

/** What a link is doing now, with expiry worked out: an open link past its time is 'expired'. */
export type LinkStatus = Exclude<LinkState, 'open'> | 'open' | 'expired'
export const linkStatus = (l: Pick<OrderLink, 'state' | 'expiresAt'>, now = Date.now()): LinkStatus => (l.state === 'open' && l.expiresAt <= now ? 'expired' : l.state)
/** Minutes left on an open link (0 when it has expired). */
export const minutesLeft = (l: Pick<OrderLink, 'expiresAt'>, now = Date.now()) => Math.max(0, Math.ceil((l.expiresAt - now) / 60_000))

/** The WhatsApp message (Arabic) that goes with the link. */
export function waLinkText(l: Pick<OrderLink, 'total' | 'delivery' | 'expiresAt' | 'createdAt'>, url: string): string {
  const mins = Math.max(1, Math.round((l.expiresAt - l.createdAt) / 60_000))
  const within = mins >= 60 ? 'ساعة' : `${mins} دقيقة`
  return `أهلاً بحضرتك، ده لينك طلبك من Static:\n${url}\n\nالإجمالي: ${l.total.toLocaleString('en-US')} جنيه${l.delivery === 'delivery' ? ' شامل التوصيل' : ''}.\nمن فضلك اكتب بياناتك في اللينك خلال ${within} عشان نأكد الطلب.`
}

/** What staff fill in to make a link. */
export type LinkDraft = Pick<OrderLink, 'items' | 'discount' | 'delivery' | 'shipping' | 'date' | 'time' | 'note' | 'rep' | 'category'> & { minutes: number }

/** The link document as written by the app (createdAt is the server's time; expiresAt counts from the device's time). */
export function linkDoc(d: LinkDraft, by: { uid: string; name: string }, now = Date.now()) {
  const items = d.items.filter((x) => x.name.trim()).slice(0, 30).map((x) => {
    const it: Item = { name: x.name.trim().slice(0, 400), qty: Math.max(1, Math.round(x.qty || 1)), total: Math.max(0, round(x.total || 0)), pid: Math.max(0, Math.round(x.pid || 0)), vid: Math.max(0, Math.round(x.vid || 0)) }
    if (x.cat) it.cat = x.cat.slice(0, 80)
    if (x.ref) it.ref = x.ref.slice(0, 80)
    return it
  })
  const delivery = d.delivery === 'delivery' ? 'delivery' : 'pickup'
  const shipping = delivery === 'delivery' ? Math.max(0, round(d.shipping || 0)) : 0
  const discount = Math.min(itemsTotal(items), Math.max(0, round(d.discount || 0)))
  const minutes = Math.min(60, Math.max(5, Math.round(d.minutes || 60)))
  return {
    state: 'open' as const, items, discount, delivery, shipping, date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : '', time: /^\d{1,2}:\d{2}$/.test(d.time) ? d.time : '',
    total: linkTotal(items, discount, shipping), note: d.note.trim().slice(0, 500), rep: d.rep.trim().slice(0, 80), category: d.category.trim().slice(0, 80),
    by: by.uid, byName: by.name.slice(0, 200), expiresAt: now + minutes * 60_000,
  }
}

const millis = (v: unknown) => (typeof v === 'number' ? v : (v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0)
const str = (v: unknown, n = 500) => (typeof v === 'string' ? v.slice(0, n) : '')
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0)

export function toLink(id: string, d: DocumentData): OrderLink {
  const items: Item[] = Array.isArray(d.items)
    ? d.items.filter((x: unknown) => x && typeof x === 'object').map((x: Record<string, unknown>) => {
      const it: Item = { name: str(x.name, 400), qty: num(x.qty) || 1, total: num(x.total), pid: num(x.pid), vid: num(x.vid) }
      if (typeof x.cat === 'string' && x.cat) it.cat = x.cat
      if (typeof x.ref === 'string' && x.ref) it.ref = x.ref
      return it
    })
    : []
  const f = d.form && typeof d.form === 'object' ? (d.form as Record<string, unknown>) : null
  return {
    id, state: (LINK_STATES as readonly string[]).includes(str(d.state)) ? (d.state as LinkState) : 'open', items, discount: num(d.discount),
    delivery: d.delivery === 'delivery' ? 'delivery' : 'pickup', shipping: num(d.shipping), date: str(d.date, 10), time: str(d.time, 5), total: num(d.total),
    note: str(d.note), rep: str(d.rep, 80), category: str(d.category, 80), by: str(d.by, 128), byName: str(d.byName, 200), createdAt: millis(d.createdAt), expiresAt: millis(d.expiresAt),
    form: f ? { name: str(f.name, 120), phone: str(f.phone, 20), email: str(f.email, 120), address: str(f.address, 300), city: str(f.city, 80), area: str(f.area, 80), note: str(f.note) } : null,
    filledAt: millis(d.filledAt), wooId: num(d.wooId), number: str(d.number, 40), webError: str(d.webError), cancelledByName: str(d.cancelledByName, 200),
  }
}

/** Checks the customer's form the same way the rules do. Returns the first problem (English key), or ''. */
export function formProblem(f: LinkForm, delivery: OrderLink['delivery']): string {
  if (f.name.trim().length < 2) return 'Please write your name.'
  if (!/^\+?[0-9 ]{8,20}$/.test(f.phone.trim()) || f.phone.replace(/\D/g, '').length < 8) return 'Please write a phone number we can call.'
  if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return 'The email address does not look right.'
  if (delivery === 'delivery') {
    if (!AREAS.some((a) => a.en === f.area)) return 'Please pick your governorate.'
    if (f.city.trim().length < 2) return 'Please write your city or area.'
    if (f.address.trim().length < 5) return 'Please write the full address.'
  }
  return ''
}
/** The form as saved: trimmed, cut to the sizes the rules allow, the address left out for pickup. */
export function cleanForm(f: LinkForm, delivery: OrderLink['delivery']): LinkForm {
  const d = delivery === 'delivery'
  return {
    name: f.name.trim().slice(0, 120), phone: f.phone.trim().replace(/\s+/g, ' ').slice(0, 20), email: f.email.trim().slice(0, 120),
    address: d ? f.address.trim().slice(0, 300) : '', city: d ? f.city.trim().slice(0, 80) : '', area: d ? f.area.slice(0, 80) : '', note: f.note.trim().slice(0, 500),
  }
}

