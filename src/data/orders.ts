import { getAuth } from 'firebase/auth'
import { myNameFor } from './profiles'
import { collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, type DocumentData } from 'firebase/firestore'
import { firestore } from './firebase'
import { addDays, cairoNow } from './logic'
import { paperDate, waNumber } from './tickets'

// Orders: the orders customers place on static-eg.com (WooCommerce), followed in the app.
//
//   orders/W<website order id>   one order, with its whole event log inside (one read per order)
//
// The engine (n8n "Static OS - Website orders") makes each document and keeps the website part up to date.
// The app only changes what happens in the shop: the status, the agreed price, the pickup or delivery date
// and time, the payments and the steps. A status changed here is put in `want` (the WooCommerce status to
// send); the engine sends it to the website and empties `want`. A status changed on the website comes back
// as a "website" step, unless the app has a change of its own still waiting to be sent (the app wins then).
//
// The page listens only to open orders. Closed ones are read once, when someone looks at them.

/** Where an order is, in the app. */
export const STATUSES = ['new', 'confirmed', 'completed', 'cancelled', 'refunded', 'failed'] as const
export type Status = (typeof STATUSES)[number]
export const STATUS_LABEL: Record<Status, string> = { new: 'New', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded', failed: 'Failed' }
export const OPEN: Status[] = ['new', 'confirmed']

/** WooCommerce status -> the app's status. */
export function fromWeb(web: string): Status {
  if (web === 'processing') return 'confirmed'
  if (web === 'completed' || web === 'cancelled' || web === 'refunded' || web === 'failed') return web
  return 'new' // pending, on-hold, checkout-draft and anything a plugin adds
}
/** The app's status -> the WooCommerce status to send. Refunded and failed only ever come from the website. */
export const TO_WEB: Partial<Record<Status, string>> = { new: 'on-hold', confirmed: 'processing', completed: 'completed', cancelled: 'cancelled' }
export const WEB_LABEL: Record<string, string> = {
  pending: 'Pending payment', 'on-hold': 'On hold', processing: 'Processing', completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded', failed: 'Failed', 'checkout-draft': 'Draft',
}

export const STEP_KINDS = ['placed', 'called', 'confirmed', 'date', 'price', 'paid', 'ready', 'out', 'delivered', 'cancelled', 'reopened', 'note', 'website'] as const
export type StepKind = (typeof STEP_KINDS)[number]
/** What a person can add. "placed" and "website" are written by the engine. */
export const ADDABLE: StepKind[] = ['called', 'confirmed', 'date', 'paid', 'price', 'ready', 'out', 'delivered', 'cancelled', 'note']

export type Step = {
  at: number
  by: string
  byName: string
  kind: StepKind
  note: string
  /** paid: the amount paid; price: the new agreed price. */
  amount?: number
  /** paid: how (Cash, Instapay, E-wallet, Card, Other). */
  method?: string
  /** date: the day and time it was set to. */
  date?: string
  time?: string
  /** website: the WooCommerce status it moved to. */
  web?: string
}

export const PAY_METHODS = ['Cash', 'Instapay', 'E-wallet', 'Card', 'Bank transfer', 'Other'] as const

export type Item = { name: string; qty: number; total: number; pid: number; vid: number }

export type Order = {
  id: string
  /** The website's order id and number (usually the same). */
  wooId: number
  number: string
  /** The last status read from or sent to the website. */
  webStatus: string
  /** A WooCommerce status the app wants sent; empty when nothing is waiting. */
  want: string
  status: Status
  closed: boolean
  placedAt: number
  customer: string
  phone: string
  email: string
  address: string
  city: string
  area: string
  delivery: 'pickup' | 'delivery'
  /** What the website charged for delivery. */
  shipping: number
  /** How the customer chose to pay on the website (Instapay, E-wallet, Cash). */
  payMethod: string
  items: Item[]
  /** The website's total (with delivery). */
  webTotal: number
  /** The price agreed with the customer; null = the website total. */
  agreed: number | null
  customerNote: string
  /** Pickup or delivery day (YYYY-MM-DD, Cairo) and time (HH:MM). The website's choice until someone sets one. */
  date: string
  time: string
  /** What the website last answered when a status was sent. */
  webError: string
  updatedAt: number
  /** Oldest first. */
  steps: Step[]
}

export const orderNo = (o: Pick<Order, 'number' | 'wooId'>) => `#${o.number || o.wooId}`
export const priceOf = (o: Pick<Order, 'agreed' | 'webTotal'>) => (o.agreed ?? o.webTotal)
export const paidOf = (o: Pick<Order, 'steps'>) => o.steps.reduce((n, s) => n + (s.kind === 'paid' && typeof s.amount === 'number' ? s.amount : 0), 0)
export const leftOf = (o: Pick<Order, 'steps' | 'agreed' | 'webTotal'>) => Math.round((priceOf(o) - paidOf(o)) * 100) / 100

/** The five marks on the progress bar, each on or off: placed, confirmed, paid in full, ready or on the way, delivered. */
export function progressOf(o: Pick<Order, 'steps' | 'status' | 'agreed' | 'webTotal'>): boolean[] {
  const has = (k: StepKind) => o.steps.some((x) => x.kind === k)
  const done = o.status === 'completed'
  return [true, done || o.status === 'confirmed' || has('confirmed'), done || (paidOf(o) > 0 && leftOf(o) <= 0), done || has('ready') || has('out'), done]
}

/** What the order is doing now, in a few words: the last shop step that says where it is. */
export function whereNow(o: Pick<Order, 'steps' | 'status'>): StepKind | null {
  if (o.status !== 'new' && o.status !== 'confirmed') return null
  let last: StepKind | null = null
  for (const s of o.steps) if (s.kind === 'ready' || s.kind === 'out' || s.kind === 'reopened') last = s.kind === 'reopened' ? null : s.kind
  return last
}

/** The status a step moves the order to, if it moves it. */
const MOVES: Partial<Record<StepKind, Status>> = { confirmed: 'confirmed', delivered: 'completed', cancelled: 'cancelled', reopened: 'confirmed' }

/** The order after a step: its status, what to send to the website, the agreed price and the date. */
export function applyStep(o: Pick<Order, 'steps' | 'status' | 'webStatus' | 'want' | 'agreed' | 'date' | 'time' | 'closed'>, step: Step) {
  const steps = [...o.steps, step]
  const status = MOVES[step.kind] ?? o.status
  const closed = !OPEN.includes(status)
  // Send the new status unless the website already has it. Moving back to where the website is cancels a waiting send.
  const target = TO_WEB[status] ?? ''
  const want = status === o.status ? o.want : target && fromWeb(o.webStatus) !== status ? target : ''
  const agreed = step.kind === 'price' && typeof step.amount === 'number' ? step.amount : o.agreed
  const date = step.kind === 'date' ? step.date ?? '' : o.date
  const time = step.kind === 'date' ? step.time ?? '' : o.time
  return { steps, status, closed, want, agreed, date, time }
}

/** After taking a step out (owner only). The status and what to send stay as they are. */
export function withoutStep(o: Pick<Order, 'steps' | 'agreed'>, index: number) {
  const steps = o.steps.filter((_, i) => i !== index)
  // The agreed price follows the last price step that is left.
  const lastPrice = [...steps].reverse().find((x) => x.kind === 'price' && typeof x.amount === 'number')
  return { steps, agreed: o.steps[index]?.kind === 'price' ? lastPrice?.amount ?? null : o.agreed }
}

export function matchesOrder(o: Order, search: string): boolean {
  const q = search.trim().toLowerCase()
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  const hay = [o.customer, o.email, o.address, o.city, o.area, o.number, String(o.wooId), ...o.items.map((x) => x.name)].join(' ').toLowerCase()
  return q.replace(/^#/, '').split(/\s+/).every((w) => hay.includes(w)) || (digits.length >= 4 && o.phone.replace(/\D/g, '').includes(digits))
}

export { waNumber, paperDate }

/** 5:00 PM style, from 17:00. */
export function timeLabel(time: string): string {
  if (!/^\d{1,2}:\d{2}$/.test(time)) return time
  const [h, m] = time.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** The message the WhatsApp button types in for the customer, in Arabic, by where the order is. */
export function waMessage(o: Order): string {
  const hi = `أهلاً ${o.customer.trim() || 'بحضرتك'}، معاك Static.`
  const ref = `طلبك رقم ${orderNo(o)} من موقع static-eg.com`
  const when = o.date ? ` يوم ${paperDate(o.date)}${o.time ? ` الساعة ${timeLabel(o.time).replace('AM', 'ص').replace('PM', 'م')}` : ''}` : ''
  const left = leftOf(o)
  const money = left > 0 ? `\nالمبلغ المتبقي: ${left.toLocaleString('en-US')} جنيه.` : ''
  if (o.status === 'completed') return `${hi}\nشكراً لك، تم تسليم ${ref}.`
  if (o.status === 'cancelled') return `${hi}\nبخصوص ${ref}: تم إلغاء الطلب.`
  const now = whereNow(o)
  if (now === 'ready') return `${hi}\n${ref} جاهز للاستلام من المحل${when}.${money}`
  if (now === 'out') return `${hi}\n${ref} خرج للتوصيل${when}.${money}`
  if (o.status === 'confirmed') return `${hi}\nتم تأكيد ${ref}.${o.delivery === 'pickup' ? ` الاستلام من المحل${when}.` : ` التوصيل${when}.`}${money}`
  return `${hi}\nبخصوص ${ref}، نود تأكيد الطلب معك.`
}

// ---------- Reading and writing ----------

const millis = (v: unknown) => (typeof v === 'number' ? v : (v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0)
const str = (v: unknown, n = 2000) => (typeof v === 'string' ? v.slice(0, n) : '')
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() && isFinite(Number(v)) ? Number(v) : 0)

export function toOrder(id: string, d: DocumentData): Order {
  const steps: Step[] = Array.isArray(d.steps)
    ? d.steps.filter((s: unknown) => s && typeof s === 'object').map((s: Record<string, unknown>) => {
      const step: Step = {
        at: typeof s.at === 'number' ? s.at : 0, by: str(s.by, 128), byName: str(s.byName, 200),
        kind: (STEP_KINDS as readonly string[]).includes(str(s.kind)) ? (s.kind as StepKind) : 'note', note: str(s.note),
      }
      if (typeof s.amount === 'number') step.amount = s.amount
      if (typeof s.method === 'string') step.method = s.method.slice(0, 40)
      if (typeof s.date === 'string') step.date = s.date.slice(0, 10)
      if (typeof s.time === 'string') step.time = s.time.slice(0, 5)
      if (typeof s.web === 'string') step.web = s.web.slice(0, 40)
      return step
    })
    : []
  const items: Item[] = Array.isArray(d.items)
    ? d.items.filter((x: unknown) => x && typeof x === 'object').map((x: Record<string, unknown>) => ({ name: str(x.name, 400), qty: num(x.qty) || 1, total: num(x.total), pid: num(x.pid), vid: num(x.vid) }))
    : []
  const status = (STATUSES as readonly string[]).includes(str(d.status)) ? (d.status as Status) : fromWeb(str(d.webStatus))
  return {
    id, wooId: num(d.wooId), number: str(d.number, 40), webStatus: str(d.webStatus, 40), want: str(d.want, 40), status, closed: d.closed === true || !OPEN.includes(status),
    placedAt: millis(d.placedAt), customer: str(d.customer, 200), phone: str(d.phone, 40), email: str(d.email, 200), address: str(d.address, 500), city: str(d.city, 120), area: str(d.area, 120),
    delivery: d.delivery === 'delivery' ? 'delivery' : 'pickup', shipping: num(d.shipping), payMethod: str(d.payMethod, 80), items, webTotal: num(d.webTotal),
    agreed: typeof d.agreed === 'number' ? d.agreed : null, customerNote: str(d.customerNote), date: str(d.date, 10), time: str(d.time, 5),
    webError: str(d.webError, 500), updatedAt: millis(d.updatedAt), steps,
  }
}

type Me = { uid: string; name: string }
function me(): Me {
  if (!firestore) return { uid: 'demo-you', name: 'You' }
  const u = getAuth(firestore.app).currentUser
  return { uid: u?.uid ?? '', name: myNameFor(u) }
}
/** A step by the person using the app. Extra fields that are empty are left out (the database refuses undefined). */
export function stepBy(kind: StepKind, note: string, extra: Partial<Pick<Step, 'amount' | 'method' | 'date' | 'time'>> = {}): Step {
  const m = me()
  const step: Step = { at: Date.now(), by: m.uid, byName: m.name, kind, note: note.trim().slice(0, 1000) }
  if (typeof extra.amount === 'number' && isFinite(extra.amount)) step.amount = Math.round(extra.amount * 100) / 100
  if (extra.method) step.method = extra.method.slice(0, 40)
  if (extra.date) step.date = extra.date.slice(0, 10)
  if (extra.time) step.time = extra.time.slice(0, 5)
  return step
}

export interface OrderBackend {
  watchOpen(onData: (list: Order[]) => void, onError: (e: Error) => void): () => void
  loadClosed(): Promise<Order[]>
  addStep(o: Order, step: Step): Promise<void>
  removeStep(o: Order, index: number): Promise<void>
  remove(o: Order): Promise<void>
}

function firestoreOrders(fs: NonNullable<typeof firestore>): OrderBackend {
  const col = collection(fs, 'orders')
  return {
    watchOpen(onData, onError) {
      return onSnapshot(query(col, where('closed', '==', false)), (snap) => onData(snap.docs.map((x) => toOrder(x.id, x.data()))), onError)
    },
    async loadClosed() {
      const snap = await getDocs(query(col, orderBy('updatedAt', 'desc'), limit(150)))
      return snap.docs.map((x) => toOrder(x.id, x.data())).filter((x) => x.closed)
    },
    async addStep(o, step) {
      await updateDoc(doc(col, o.id), { ...applyStep(o, step), updatedAt: serverTimestamp() })
    },
    async removeStep(o, index) {
      await updateDoc(doc(col, o.id), { ...withoutStep(o, index), updatedAt: serverTimestamp() })
    },
    async remove(o) {
      await deleteDoc(doc(col, o.id))
    },
  }
}

// ---------- Demo mode: kept in this browser ----------

const LOCAL_KEY = 'posterpilot.demo.orders.v1'
const localListeners = new Set<() => void>()

function demoOrders(): Order[] {
  const today = cairoNow().date
  const at = (n: number, h: number) => new Date(`${addDays(today, n)}T${String(h).padStart(2, '0')}:00:00+02:00`).getTime()
  const s = (kind: StepKind, n: number, h: number, byName: string, note = '', extra: Partial<Step> = {}): Step => ({ at: at(n, h), by: byName, byName, kind, note, ...extra })
  const base = { email: '', want: '', webError: '', customerNote: '', agreed: null, date: '', time: '', closed: false }
  const mk = (wooId: number, webStatus: string, o: Partial<Order> & Pick<Order, 'customer' | 'phone' | 'items' | 'steps'>): Order => {
    const shipping = o.shipping ?? 0
    const webTotal = o.items.reduce((n, x) => n + x.total, 0) + shipping
    const status = o.status ?? fromWeb(webStatus)
    return {
      ...base, id: `W${wooId}`, wooId, number: String(wooId), webStatus, status, placedAt: o.steps[0].at, address: '', city: 'Cairo', area: 'Cairo', delivery: 'pickup',
      shipping, payMethod: 'Cash', webTotal, updatedAt: o.steps[o.steps.length - 1].at, ...o, closed: !OPEN.includes(status),
    }
  }
  const item = (name: string, total: number, qty = 1): Item => ({ name, qty, total, pid: 0, vid: 0 })
  return [
    mk(12915, 'on-hold', { customer: 'Karim Adel', phone: '01002223344', payMethod: 'Instapay', items: [item('Xigmatek Cubi II 7 Fan ARGB Mid Tower Case', 4999)], date: addDays(today, 1), time: '17:00', steps: [s('placed', 0, 14, 'Website', 'Store pickup · Instapay')] }),
    mk(12914, 'on-hold', { customer: 'Omar Hassan', phone: '01012345678', delivery: 'delivery', shipping: 300, address: '12 Gamal Abdel Nasser St, Haram', city: 'Giza', area: 'Giza', payMethod: 'Instapay', items: [item('ID-COOLING AS-120-ARGB - White', 597, 3)], steps: [s('placed', 0, 13, 'Website', 'Home delivery · Instapay'), s('called', 0, 15, 'Mona', 'Will pay the shipping by Instapay first.')] }),
    mk(12910, 'processing', { customer: 'Mostafa Ali', phone: '01129987766', items: [item('Xigmatek Odin II 750W 80 Plus White - White', 1799)], agreed: 1750, date: today, time: '19:00', steps: [s('placed', -1, 20, 'Website', 'Store pickup · Cash'), s('called', 0, 12, 'Ahmed'), s('price', 0, 12, 'Ahmed', 'Small discount for coming today.', { amount: 1750 }), s('confirmed', 0, 12, 'Ahmed'), s('date', 0, 12, 'Ahmed', '', { date: today, time: '19:00' }), s('ready', 0, 13, 'Yousef', 'Packed, on the shelf behind the counter.')] }),
    mk(12902, 'processing', { customer: 'Nour Ibrahim', phone: '01550102030', delivery: 'delivery', shipping: 350, address: 'El Gomhoreya St', city: 'Port Said', area: 'Port Said', items: [item('Gigabyte GeForce RTX 4060 Eagle OC 8G', 6199)], date: addDays(today, 1), steps: [s('placed', -1, 16, 'Website', 'Home delivery · Cash'), s('confirmed', -1, 18, 'Mona'), s('paid', -1, 18, 'Mona', 'Shipping paid first.', { amount: 350, method: 'Instapay' }), s('out', 0, 11, 'Yousef', 'Bosta, tracking 4471209')] }),
    mk(12824, 'completed', { customer: 'Hany Fathy', phone: '01001112223', items: [item('AeroCool P500C ARGB', 2999)], steps: [s('placed', -3, 17, 'Website', 'Store pickup · Cash'), s('confirmed', -3, 18, 'Mona'), s('paid', -1, 15, 'Mona', '', { amount: 2999, method: 'Cash' }), s('delivered', -1, 15, 'Mona')] }),
  ]
}

function localAll(): Order[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (raw) return (JSON.parse(raw) as Order[]).map((x) => toOrder(x.id, x))
  } catch { /* fall through to the samples */ }
  return demoOrders()
}
function localSave(list: Order[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)) } catch { /* the demo then lasts for this visit */ }
  localListeners.forEach((l) => l())
}
let localMem: Order[] | null = null
const localGet = () => (localMem ??= localAll())
const localPut = (list: Order[]) => { localMem = list; localSave(list) }
const localChange = (id: string, patch: Partial<Order>) => localPut(localGet().map((x) => (x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x)))

function localOrders(): OrderBackend {
  return {
    watchOpen(onData) {
      const send = () => onData(localGet().filter((x) => !x.closed))
      send()
      localListeners.add(send)
      return () => localListeners.delete(send)
    },
    async loadClosed() { return localGet().filter((x) => x.closed) },
    async addStep(o, step) { localChange(o.id, applyStep(o, step)) },
    async removeStep(o, index) { localChange(o.id, withoutStep(o, index)) },
    async remove(o) { localPut(localGet().filter((x) => x.id !== o.id)) },
  }
}

export const orders: OrderBackend = firestore ? firestoreOrders(firestore) : localOrders()
