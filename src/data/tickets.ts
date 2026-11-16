import { getAuth } from 'firebase/auth'
import { collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, updateDoc, where, type DocumentData } from 'firebase/firestore'
import { firestore } from './firebase'
import { addDays, cairoNow } from './logic'

// Maintenance: warranty and repair tickets for products customers bought.
//
//   tickets/{T<no>}    one ticket, with its whole event log inside (one read per ticket, not one per step)
//                      { no, customer, phone, product, productId, serial, problem, items, provider, providerRef,
//                        receivedOn, dueOn, closed, createdAt, createdBy, createdByName, updatedAt, steps: Step[] }
//   counters/tickets   { n }  the last ticket number; raised by one in the same write that creates a ticket
//
// The page listens only to open tickets. Closed ones are read once, when someone looks at them.

/** The most a repair or replacement may take, in working days (Sunday to Thursday). */
export const TICKET_DAYS = 14

export const STEP_KINDS = ['opened', 'received', 'sent', 'update', 'fixed', 'replaced', 'refused', 'back', 'told', 'delivered', 'note'] as const
export type StepKind = (typeof STEP_KINDS)[number]
/** What a person can add (opened is written when the ticket is made). */
export const ADDABLE: StepKind[] = ['received', 'sent', 'update', 'fixed', 'replaced', 'refused', 'back', 'told', 'delivered', 'note']

export type Step = { at: number; by: string; byName: string; kind: StepKind; note: string }

export type Ticket = {
  id: string
  no: number
  customer: string
  phone: string
  product: string
  /** The product in the price list, when it was picked from there. */
  productId: string
  serial: string
  problem: string
  /** What the customer left with the product (cable, box, stand). */
  items: string
  /** Who has it for warranty, and their reference number. */
  provider: string
  providerRef: string
  /** Cairo dates (YYYY-MM-DD). Empty until the product is received in the store. */
  receivedOn: string
  dueOn: string
  closed: boolean
  createdAt: number
  createdBy: string
  createdByName: string
  updatedAt: number
  /** Oldest first. */
  steps: Step[]
}

export type TicketFields = Pick<Ticket, 'customer' | 'phone' | 'product' | 'productId' | 'serial' | 'problem' | 'items' | 'provider' | 'providerRef'>

export const ticketNo = (no: number) => `T-${String(no).padStart(4, '0')}`

// ---------- Working days ----------

/** Friday and Saturday are the weekend. */
export const isWorkday = (date: string) => {
  const w = new Date(`${date}T12:00:00Z`).getUTCDay()
  return w !== 5 && w !== 6
}

/** The last day the product may take: `days` working days after the day it was received. */
export function dueDate(received: string, days = TICKET_DAYS): string {
  let d = received
  for (let n = 0; n < days; ) {
    d = addDays(d, 1)
    if (isWorkday(d)) n++
  }
  return d
}

/** Working days left until the due date (0 on the due day itself), or minus the working days it is late. */
export function workdaysLeft(today: string, due: string): number {
  let n = 0
  if (today <= due) {
    for (let d = today; d < due; ) { d = addDays(d, 1); if (isWorkday(d)) n++ }
    return n
  }
  for (let d = due; d < today; ) { d = addDays(d, 1); if (isWorkday(d)) n++ }
  return -n
}

// ---------- Where a ticket is ----------

export type Stage = 'waiting' | 'store' | 'warranty' | 'ready' | 'closed'
export const STAGES: Stage[] = ['waiting', 'store', 'warranty', 'ready', 'closed']
export const STAGE_LABEL: Record<Stage, string> = { waiting: 'Not received yet', store: 'At the store', warranty: 'At warranty', ready: 'Ready for pickup', closed: 'Closed' }

const MOVES: Partial<Record<StepKind, Stage>> = { received: 'store', sent: 'warranty', back: 'ready', delivered: 'closed' }

export function stageOf(steps: Step[]): Stage {
  let s: Stage = 'waiting'
  for (const x of steps) s = MOVES[x.kind] ?? s
  return s
}

/** What the warranty provider decided, last word wins. */
export function outcomeOf(steps: Step[]): 'fixed' | 'replaced' | 'refused' | null {
  let o: 'fixed' | 'replaced' | 'refused' | null = null
  for (const x of steps) if (x.kind === 'fixed' || x.kind === 'replaced' || x.kind === 'refused') o = x.kind
  return o
}

/** How many of the five marks on the progress bar are done: received, sent, decision, back, delivered. */
export function progressOf(steps: Step[]): number {
  const has = (k: StepKind) => steps.some((x) => x.kind === k)
  const stage = stageOf(steps)
  if (stage === 'closed') return 5
  if (stage === 'ready') return 4
  if (outcomeOf(steps) && has('sent')) return 3
  if (stage === 'warranty') return 2
  return stage === 'store' || has('received') ? 1 : 0
}

/** The ticket after a step: where it is, and when the clock starts. */
export function applyStep(tk: Pick<Ticket, 'steps' | 'receivedOn' | 'dueOn'>, step: Step, today: string) {
  const steps = [...tk.steps, step]
  const receivedOn = tk.receivedOn || (step.kind === 'received' ? today : '')
  return { steps, receivedOn, dueOn: receivedOn ? tk.dueOn || dueDate(receivedOn) : '', closed: stageOf(steps) === 'closed' }
}

/** After taking a step out (owner only): the clock stops again if no "received" is left. */
export function withoutStep(tk: Pick<Ticket, 'steps' | 'receivedOn' | 'dueOn'>, index: number) {
  const steps = tk.steps.filter((_, i) => i !== index)
  const still = steps.some((x) => x.kind === 'received')
  return { steps, receivedOn: still ? tk.receivedOn : '', dueOn: still ? tk.dueOn : '', closed: stageOf(steps) === 'closed' }
}

export function matchesTicket(tk: Ticket, search: string): boolean {
  const q = search.trim().toLowerCase()
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  const hay = [tk.customer, tk.product, tk.serial, tk.problem, tk.provider, tk.providerRef, ticketNo(tk.no), String(tk.no)].join(' ').toLowerCase()
  return q.split(/\s+/).every((w) => hay.includes(w)) || (digits.length >= 3 && tk.phone.replace(/\D/g, '').includes(digits))
}

/** An Egyptian mobile (01xxxxxxxxx) as WhatsApp wants it (201xxxxxxxxx). */
export function waNumber(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith('0') && d.length === 11) return `2${d}`
  return d
}

/** 16/11/2026 */
export const paperDate = (date: string) => (date ? `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}/${date.slice(0, 4)}` : '')

/** The message the WhatsApp button types in for the customer, in Arabic, by where the ticket is. */
export function waMessage(tk: Ticket): string {
  const hi = `أهلاً ${tk.customer.trim() || 'بحضرتك'}، معاك Static.`
  const ref = `طلب الصيانة رقم ${ticketNo(tk.no)} (${tk.product})`
  const stage = stageOf(tk.steps)
  const outcome = outcomeOf(tk.steps)
  if (stage === 'waiting') return `${hi}\nتم فتح ${ref}. برجاء إحضار المنتج إلى المحل.`
  if (stage === 'store') return `${hi}\nاستلمنا ${ref}. المدة بحد أقصى ${TICKET_DAYS} يوم عمل لا تشمل يومي الجمعة والسبت، حتى ${paperDate(tk.dueOn)}.`
  if (stage === 'warranty') {
    const news = outcome === 'replaced' ? 'تمت الموافقة على الاستبدال.' : outcome === 'fixed' ? 'تم إصلاح المنتج.' : outcome === 'refused' ? 'للأسف رفض مركز الضمان الطلب، برجاء التواصل معنا.' : 'المنتج الآن عند مركز الضمان، وسنبلغك فور وصول أي جديد.'
    return `${hi}\nبخصوص ${ref}: ${news}`
  }
  if (stage === 'ready') return `${hi}\n${ref} جاهز للاستلام من المحل. برجاء إحضار إيصال الاستلام.`
  return `${hi}\nشكراً لك، تم تسليم ${ref}.`
}

// ---------- Reading and writing ----------

const millis = (v: unknown) => (typeof v === 'number' ? v : (v as { toMillis?: () => number } | null)?.toMillis?.() ?? Date.now())
const str = (v: unknown, n = 2000) => (typeof v === 'string' ? v.slice(0, n) : '')

export function toTicket(id: string, d: DocumentData): Ticket {
  const steps = Array.isArray(d.steps)
    ? d.steps.filter((s: unknown) => s && typeof s === 'object').map((s: Record<string, unknown>) => ({
      at: typeof s.at === 'number' ? s.at : 0, by: str(s.by, 128), byName: str(s.byName, 200),
      kind: (STEP_KINDS as readonly string[]).includes(str(s.kind)) ? (s.kind as StepKind) : 'note', note: str(s.note),
    }))
    : []
  return {
    id, no: typeof d.no === 'number' ? d.no : 0, customer: str(d.customer), phone: str(d.phone), product: str(d.product), productId: str(d.productId),
    serial: str(d.serial), problem: str(d.problem), items: str(d.items), provider: str(d.provider), providerRef: str(d.providerRef),
    receivedOn: str(d.receivedOn), dueOn: str(d.dueOn), closed: d.closed === true, createdAt: millis(d.createdAt), createdBy: str(d.createdBy),
    createdByName: str(d.createdByName), updatedAt: millis(d.updatedAt), steps,
  }
}

/** Trims every field to what the database accepts. */
export function cleanFields(f: TicketFields): TicketFields {
  const cut = (s: string, n: number) => s.trim().slice(0, n)
  return {
    customer: cut(f.customer, 120), phone: cut(f.phone, 40), product: cut(f.product, 300), productId: cut(f.productId, 40), serial: cut(f.serial, 120),
    problem: cut(f.problem, 2000), items: cut(f.items, 500), provider: cut(f.provider, 120), providerRef: cut(f.providerRef, 120),
  }
}

type Me = { uid: string; name: string }
function me(): Me {
  if (!firestore) return { uid: 'demo-you', name: 'You' }
  const u = getAuth(firestore.app).currentUser
  return { uid: u?.uid ?? '', name: u?.displayName || u?.email || '' }
}
export const stepBy = (kind: StepKind, note: string): Step => {
  const m = me()
  return { at: Date.now(), by: m.uid, byName: m.name, kind, note: note.trim().slice(0, 1000) }
}

export interface TicketBackend {
  watchOpen(onData: (list: Ticket[]) => void, onError: (e: Error) => void): () => void
  loadClosed(): Promise<Ticket[]>
  create(fields: TicketFields, received: boolean, note: string): Promise<Ticket>
  edit(tk: Ticket, fields: TicketFields): Promise<void>
  addStep(tk: Ticket, step: Step, extra?: Partial<Pick<Ticket, 'provider' | 'providerRef'>>): Promise<void>
  removeStep(tk: Ticket, index: number): Promise<void>
  remove(tk: Ticket): Promise<void>
}

function firestoreTickets(fs: NonNullable<typeof firestore>): TicketBackend {
  const col = collection(fs, 'tickets')
  return {
    watchOpen(onData, onError) {
      return onSnapshot(query(col, where('closed', '==', false)), (snap) => onData(snap.docs.map((x) => toTicket(x.id, x.data()))), onError)
    },
    async loadClosed() {
      // Newest first, without a special index: the latest changed tickets, keeping the closed ones.
      const snap = await getDocs(query(col, orderBy('updatedAt', 'desc'), limit(120)))
      return snap.docs.map((x) => toTicket(x.id, x.data())).filter((x) => x.closed)
    },
    async create(fields, received, note) {
      const m = me()
      const today = cairoNow().date
      const first: Step[] = [{ at: Date.now(), by: m.uid, byName: m.name, kind: 'opened', note: note.trim().slice(0, 1000) }]
      if (received) first.push({ at: Date.now() + 1, by: m.uid, byName: m.name, kind: 'received', note: '' })
      const counter = doc(fs, 'counters', 'tickets')
      const no = await runTransaction(fs, async (tx) => {
        const c = await tx.get(counter)
        const n = ((c.data()?.n as number | undefined) ?? 0) + 1
        tx.set(counter, { n })
        tx.set(doc(col, `T${n}`), {
          no: n, ...cleanFields(fields), receivedOn: received ? today : '', dueOn: received ? dueDate(today) : '', closed: false,
          createdAt: serverTimestamp(), createdBy: m.uid, createdByName: m.name, updatedAt: serverTimestamp(), steps: first,
        })
        return n
      })
      return { id: `T${no}`, no, ...cleanFields(fields), receivedOn: received ? today : '', dueOn: received ? dueDate(today) : '', closed: false, createdAt: Date.now(), createdBy: m.uid, createdByName: m.name, updatedAt: Date.now(), steps: first }
    },
    async edit(tk, fields) {
      await updateDoc(doc(col, tk.id), { ...cleanFields(fields), updatedAt: serverTimestamp() })
    },
    async addStep(tk, step, extra = {}) {
      await updateDoc(doc(col, tk.id), { ...applyStep(tk, step, cairoNow().date), ...extra, updatedAt: serverTimestamp() })
    },
    async removeStep(tk, index) {
      await updateDoc(doc(col, tk.id), { ...withoutStep(tk, index), updatedAt: serverTimestamp() })
    },
    async remove(tk) {
      await deleteDoc(doc(col, tk.id))
    },
  }
}

// ---------- Demo mode: kept in this browser ----------

const LOCAL_KEY = 'posterpilot.demo.tickets.v1'
const localListeners = new Set<() => void>()

function demoTickets(): Ticket[] {
  const today = cairoNow().date
  const day = (n: number) => addDays(today, n)
  const at = (n: number, h: number) => new Date(`${day(n)}T${String(h).padStart(2, '0')}:00:00+02:00`).getTime()
  const s = (kind: StepKind, n: number, h: number, byName: string, note = ''): Step => ({ at: at(n, h), by: byName, byName, kind, note })
  const base = { productId: '', items: '', provider: '', providerRef: '', createdBy: 'demo', closed: false }
  const mk = (no: number, t: Omit<Ticket, 'id' | 'no' | 'createdAt' | 'updatedAt' | 'createdByName' | 'receivedOn' | 'dueOn' | 'closed' | 'createdBy' | 'productId' | 'items' | 'provider' | 'providerRef'> & Partial<Ticket>): Ticket => {
    const received = t.steps.find((x) => x.kind === 'received')
    const receivedOn = received ? new Date(received.at + 2 * 3600_000).toISOString().slice(0, 10) : ''
    return { ...base, id: `T${no}`, no, createdAt: t.steps[0].at, updatedAt: t.steps[t.steps.length - 1].at, createdByName: t.steps[0].byName, receivedOn, dueOn: receivedOn ? dueDate(receivedOn) : '', ...t, closed: stageOf(t.steps) === 'closed' }
  }
  return [
    mk(41, { customer: 'Karim Adel', phone: '01002223344', product: 'Logitech G Pro X Superlight', serial: '2245LZ0A1B2', problem: 'Left click double clicks.', provider: 'Elnour', steps: [s('opened', -24, 13, 'Mona'), s('received', -24, 13, 'Mona'), s('sent', -22, 12, 'Yousef', 'Elnour, Abbas El Akkad')] }),
    mk(47, { customer: 'Omar Hassan', phone: '01012345678', product: 'Samsung Odyssey G5 27" 165Hz', serial: 'HNTX700123K', problem: 'Dead pixel near the centre, a bright green dot.', items: 'Monitor, power cable, stand (no box)', provider: 'Samsung (Raya)', providerRef: 'RY-55821', steps: [s('opened', -6, 15, 'Mona', 'Customer messaged on WhatsApp.'), s('received', -6, 18, 'Mona', 'Dead pixel visible on a white screen.'), s('sent', -5, 12, 'Yousef', 'Samsung (Raya), Dokki · ref RY-55821'), s('replaced', -2, 14, 'Yousef', 'Samsung confirmed the dead pixel. A new unit will be sent.')] }),
    mk(48, { customer: 'Mostafa Ali', phone: '01129987766', product: 'Gigabyte GeForce RTX 4060 Eagle OC 8G', serial: 'SN23419980123', problem: 'Artifacts in games after 10 minutes.', provider: 'Gigabyte (Elnour)', steps: [s('opened', -5, 12, 'Ahmed'), s('received', -5, 12, 'Ahmed'), s('sent', -4, 13, 'Yousef'), s('fixed', -1, 16, 'Yousef', 'Card repaired, tested 1 hour.'), s('back', 0, 11, 'Yousef'), s('told', 0, 11, 'Mona', 'Sent on WhatsApp.')] }),
    mk(49, { customer: 'Youssef Samir', phone: '01284441200', product: 'Redragon K552 Kumara', serial: 'K552RGB09231', problem: 'Some keys stopped working (Q, W).', items: 'Keyboard only', steps: [s('opened', -1, 17, 'Mona'), s('received', -1, 17, 'Mona')] }),
    mk(50, { customer: 'Nour Ibrahim', phone: '01550102030', product: 'Kingston NV2 1TB NVMe', serial: '', problem: 'Not detected in BIOS.', steps: [s('opened', 0, 12, 'Ahmed', 'Customer messaged on WhatsApp.')] }),
    mk(39, { customer: 'Hany Fathy', phone: '01001112223', product: 'AeroCool P500C ARGB', serial: 'AC-P500C-7781', problem: 'Front fan does not light.', steps: [s('opened', -20, 12, 'Mona'), s('received', -20, 12, 'Mona'), s('fixed', -19, 15, 'Ahmed', 'Loose cable, fixed in store.'), s('back', -19, 15, 'Ahmed'), s('delivered', -18, 18, 'Mona')] }),
  ]
}

function localAll(): Ticket[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (raw) return (JSON.parse(raw) as Ticket[]).map((x) => toTicket(x.id, x))
  } catch { /* fall through to the samples */ }
  return demoTickets()
}
function localSave(list: Ticket[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)) } catch { /* the demo then lasts for this visit */ }
  localListeners.forEach((l) => l())
}
let localMem: Ticket[] | null = null
const localGet = () => (localMem ??= localAll())
const localPut = (list: Ticket[]) => { localMem = list; localSave(list) }
const localChange = (id: string, patch: Partial<Ticket>) => localPut(localGet().map((x) => (x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x)))

function localTickets(): TicketBackend {
  return {
    watchOpen(onData) {
      const send = () => onData(localGet().filter((x) => !x.closed))
      send()
      localListeners.add(send)
      return () => localListeners.delete(send)
    },
    async loadClosed() {
      return localGet().filter((x) => x.closed)
    },
    async create(fields, received, note) {
      const list = localGet()
      const no = Math.max(0, ...list.map((x) => x.no)) + 1
      const today = cairoNow().date
      const steps: Step[] = [stepBy('opened', note)]
      if (received) steps.push({ ...stepBy('received', ''), at: Date.now() + 1 })
      const tk: Ticket = { id: `T${no}`, no, ...cleanFields(fields), receivedOn: received ? today : '', dueOn: received ? dueDate(today) : '', closed: false, createdAt: Date.now(), createdBy: 'demo-you', createdByName: 'You', updatedAt: Date.now(), steps }
      localPut([...list, tk])
      return tk
    },
    async edit(tk, fields) { localChange(tk.id, cleanFields(fields)) },
    async addStep(tk, step, extra = {}) { localChange(tk.id, { ...applyStep(tk, step, cairoNow().date), ...extra }) },
    async removeStep(tk, index) { localChange(tk.id, withoutStep(tk, index)) },
    async remove(tk) { localPut(localGet().filter((x) => x.id !== tk.id)) },
  }
}

export const tickets: TicketBackend = firestore ? firestoreTickets(firestore) : localTickets()
