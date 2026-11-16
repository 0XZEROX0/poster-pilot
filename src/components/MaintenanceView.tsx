import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { track } from '../data/activity'
import { cairoNow } from '../data/logic'
import { matches, usePrices, type PriceItem } from '../data/prices'
import { isOwner } from '../data/store'
import {
  ADDABLE, dueDate as dueOf, matchesTicket, outcomeOf, paperDate, progressOf, stageOf, STAGE_LABEL, STAGES, stepBy, TICKET_DAYS, ticketNo, tickets, waMessage, waNumber, workdaysLeft,
  type Stage, type StepKind, type Ticket, type TicketFields,
} from '../data/tickets'
import { locale, t, tn } from '../i18n'
import { Sheet } from './Sheet'
import { useDesktop } from './useDesktop'
import { Empty, Icon, SearchBox, showToast } from './ui'

type Filter = 'open' | Stage

/** Names for each step, in the log and on the buttons that add them. */
const STEP_TITLE: Record<StepKind, string> = {
  opened: 'Ticket opened', received: 'Received from the customer', sent: 'Given to the warranty provider', update: 'Provider update', fixed: 'Fixed',
  replaced: 'Replaced', refused: 'Refused by the provider', back: 'Back at the store', told: 'Customer told', delivered: 'Delivered to the customer', note: 'Note',
}
const STEP_BUTTON: Record<StepKind, string> = {
  opened: 'Ticket opened', received: 'Received from customer', sent: 'Given to warranty', update: 'Provider update', fixed: 'Fixed', replaced: 'Replaced',
  refused: 'Refused', back: 'Back at the store', told: 'Customer told', delivered: 'Delivered', note: 'Note',
}
const STEP_TONE: Partial<Record<StepKind, string>> = { received: 'b', sent: 'b', back: 'b', fixed: 'g', replaced: 'g', delivered: 'g', refused: 'r', told: 'o' }
const PROGRESS = ['Received', 'Sent to warranty', 'Decision', 'Back at store', 'Delivered']

const when = (ms: number) => new Date(ms).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })
const dayShort = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const refused = (e: unknown) => {
  console.error(e)
  showToast(/permission/i.test(String(e)) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : t('Could not save. Check the connection and try again.'))
}

/** The time chip of a ticket: days left, late, or waiting for the product. */
function DueChip({ tk, today }: { tk: Ticket; today: string }) {
  const stage = stageOf(tk.steps)
  if (stage === 'closed') return <span className="chip chip-good">{t('Closed')}</span>
  if (stage === 'ready') return <span className="chip chip-good">{t('Ready for pickup')}</span>
  if (!tk.dueOn) return <span className="chip">{t('Not received yet')}</span>
  const left = workdaysLeft(today, tk.dueOn)
  if (left < 0) return <span className="chip chip-bad">{tn(left === -1 ? '%n working day late' : '%n working days late', { n: -left })}</span>
  if (left === 0) return <span className="chip chip-bad">{t('Due today')}</span>
  return <span className={`chip${left <= 4 ? ' chip-warn' : ''}`}>{tn(left === 1 ? '%n working day left' : '%n working days left', { n: left })}</span>
}

function whereLine(tk: Ticket): string {
  const stage = stageOf(tk.steps)
  const outcome = outcomeOf(tk.steps)
  const base = t(STAGE_LABEL[stage])
  if (stage === 'ready') return outcome ? t(STEP_BUTTON[outcome]) : t('Back at the store')
  const extra = stage === 'warranty' && tk.provider ? tk.provider : outcome && stage !== 'store' ? t(STEP_BUTTON[outcome]) : ''
  return extra ? `${base} · ${extra}` : base
}

export function MaintenanceView() {
  const desktop = useDesktop()
  const today = cairoNow().date
  const [open, setOpen] = useState<Ticket[] | null>(null)
  const [closed, setClosed] = useState<Ticket[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('open')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState<{ edit?: Ticket } | null>(null)
  const [printing, setPrinting] = useState<Ticket | null>(null)

  useEffect(() => tickets.watchOpen((list) => { setOpen(list); setError('') }, (e) => setError(String(e))), [])
  // Closed tickets are read once, only when someone looks for them.
  const wantClosed = filter === 'closed' || search.trim().length >= 3
  useEffect(() => {
    if (!wantClosed || closed) return
    tickets.loadClosed().then(setClosed, (e) => setError(String(e)))
  }, [wantClosed, closed])

  const all = useMemo(() => {
    const byId = new Map<string, Ticket>()
    for (const x of closed ?? []) byId.set(x.id, x)
    for (const x of open ?? []) byId.set(x.id, x)
    // Something closed here moves to the closed list without reading it again.
    return [...byId.values()]
  }, [open, closed])
  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0 }
    for (const x of open ?? []) { const s = stageOf(x.steps); c[s] = (c[s] ?? 0) + 1; if (s !== 'closed') c.open++ }
    return c
  }, [open])
  const late = (open ?? []).filter((x) => x.dueOn && !['ready', 'closed'].includes(stageOf(x.steps)) && workdaysLeft(today, x.dueOn) < 0).length

  const list = all
    .filter((x) => {
      const s = stageOf(x.steps)
      if (search.trim()) return matchesTicket(x, search)
      return filter === 'open' ? s !== 'closed' : s === filter
    })
    .sort((a, b) => {
      // Open: the closest due date first, waiting ones after. Closed: the newest first.
      if (filter === 'closed' || search.trim()) return b.updatedAt - a.updatedAt
      return (a.dueOn || '9999') < (b.dueOn || '9999') ? -1 : (a.dueOn || '9999') > (b.dueOn || '9999') ? 1 : b.no - a.no
    })
  const current = all.find((x) => x.id === selected) ?? (desktop ? list[0] : undefined)

  // The paper only exists while printing, then goes away again.
  useEffect(() => {
    if (!printing) return
    const id = requestAnimationFrame(() => {
      printPaper(`${ticketNo(printing.no)} ${printing.customer}`.trim(), () => setPrinting(null))
    })
    return () => cancelAnimationFrame(id)
  }, [printing])

  const detail = current && (
    <TicketDetail
      key={current.id}
      tk={current}
      today={today}
      onEdit={() => setForm({ edit: current })}
      onPrint={() => setPrinting(current)}
      onDeleted={() => setSelected(null)}
      onClosed={(tk) => setClosed((c) => (c ? [tk, ...c.filter((x) => x.id !== tk.id)] : c))}
    />
  )

  return (
    <div className="mt">
      <div className="mt-top">
        <div className="filters">
          {(['open', ...STAGES] as Filter[]).map((f) => (
            <button key={f} className={`filter${filter === f && !search.trim() ? ' on' : ''}`} onClick={() => { setFilter(f); setSearch('') }}>
              {t(f === 'open' ? 'Open' : STAGE_LABEL[f])}
              {f !== 'closed' && counts[f] ? <i>{counts[f]}</i> : null}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={20} />{t('New ticket')}</button>
      </div>
      <SearchBox value={search} onChange={setSearch} placeholder={t('Search name, phone, product, serial, ticket number')} />
      {late > 0 && <p className="banner banner-bad mt-late">{tn(late === 1 ? '%n ticket is past its %d working days.' : '%n tickets are past their %d working days.', { n: late, d: TICKET_DAYS })}</p>}
      {error && <p className="banner banner-bad mt-late" dir="ltr">{/permission/i.test(error) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : error}</p>}
      <div className={desktop ? 'mt-split' : ''}>
        <div className="mt-list">
          {open === null ? <p className="muted">{t('Loading…')}</p>
            : list.length === 0 ? <Empty icon="wrench" text={search.trim() ? t('No ticket matches the search.') : filter === 'open' ? t('No open tickets. Tap New ticket when a customer has a problem with a product.') : t('No tickets here.')} />
              : list.map((x) => (
                <button key={x.id} className={`mt-card${current?.id === x.id && desktop ? ' sel' : ''}${x.dueOn && !['ready', 'closed'].includes(stageOf(x.steps)) && workdaysLeft(today, x.dueOn) < 0 ? ' late' : ''}`} onClick={() => setSelected(x.id)}>
                  <span className="mt-row"><span className="mt-no" dir="ltr">#{ticketNo(x.no)}</span><DueChip tk={x} today={today} /></span>
                  <b dir="auto">{x.product || t('No product')}</b>
                  <span className="t2" dir="auto">{x.customer}{x.phone ? <> · <span dir="ltr">{x.phone}</span></> : null}</span>
                  <span className="mt-row"><span className="chip chip-info">{whereLine(x)}</span>{x.dueOn && <small className="muted mt-when">{tn('Due %d', { d: dayShort(x.dueOn) })}</small>}</span>
                </button>
              ))}
          {filter === 'closed' && closed && closed.length >= 1 && <p className="muted small">{t('Showing the latest closed tickets.')}</p>}
        </div>
        {desktop && <div className="mt-side">{detail ?? <Empty icon="wrench" text={t('Pick a ticket to see its log.')} />}</div>}
      </div>
      {!desktop && current && <Sheet title={`#${ticketNo(current.no)}`} onClose={() => setSelected(null)}>{detail}</Sheet>}
      {form && (
        <TicketForm
          edit={form.edit}
          onClose={() => setForm(null)}
          onSaved={(tk) => { setForm(null); setSelected(tk.id); setFilter('open'); setSearch('') }}
          onPrint={(tk) => setPrinting(tk)}
        />
      )}
      {printing && createPortal(<TicketPaper tk={printing} />, document.body)}
    </div>
  )
}

function TicketDetail({ tk, today, onEdit, onPrint, onDeleted, onClosed }: { tk: Ticket; today: string; onEdit: () => void; onPrint: () => void; onDeleted: () => void; onClosed: (tk: Ticket) => void }) {
  const stage = stageOf(tk.steps)
  const [kind, setKind] = useState<StepKind | null>(null)
  const [note, setNote] = useState('')
  const [provider, setProvider] = useState(tk.provider)
  const [ref, setRef] = useState(tk.providerRef)
  const [busy, setBusy] = useState(false)
  const done = progressOf(tk.steps)
  const choices = ADDABLE.filter((k) => !(k === 'received' && tk.steps.some((x) => x.kind === 'received')))
  const owner = isOwner()

  async function add() {
    if (!kind) return
    setBusy(true)
    const text = kind === 'sent' ? [provider.trim(), ref.trim() && `${t('Ref')} ${ref.trim()}`, note.trim()].filter(Boolean).join(' · ') : note
    const step = stepBy(kind, text)
    try {
      await tickets.addStep(tk, step, kind === 'sent' ? { provider: provider.trim().slice(0, 120), providerRef: ref.trim().slice(0, 120) } : {})
      track('tickets', 'ticket.step', { what: `${ticketNo(tk.no)} · ${tk.product}`, note: [STEP_TITLE[kind], step.note].filter(Boolean).join(': '), ref: tk.id })
      if (kind === 'delivered') onClosed({ ...tk, steps: [...tk.steps, step], closed: true, updatedAt: Date.now() })
      setKind(null)
      setNote('')
    } catch (e) { refused(e) }
    setBusy(false)
  }
  async function takeOut(i: number) {
    if (!confirm(t('Take this step out of the log?'))) return
    try {
      await tickets.removeStep(tk, i)
      track('tickets', 'ticket.step_removed', { what: `${ticketNo(tk.no)} · ${tk.product}`, note: t(STEP_TITLE[tk.steps[i].kind]), ref: tk.id })
    } catch (e) { refused(e) }
  }
  async function remove() {
    if (!confirm(tn('Delete ticket %n for good? Its whole log goes with it.', { n: ticketNo(tk.no) }))) return
    try {
      await tickets.remove(tk)
      track('tickets', 'ticket.deleted', { what: `${ticketNo(tk.no)} · ${tk.product}`, note: tk.customer, ref: tk.id })
      onDeleted()
    } catch (e) { refused(e) }
  }

  const wa = waNumber(tk.phone)
  return (
    <div className="mt-detail">
      <div className="mt-head">
        <div>
          <div className="mt-no"><bdi dir="ltr">#{ticketNo(tk.no)}</bdi> · {tn('opened by %n', { n: tk.createdByName || t('Someone') })}</div>
          <h2 dir="auto">{tk.product || t('No product')}</h2>
        </div>
        <div className="mt-acts">
          <button className="btn btn-sm" onClick={onPrint}><Icon name="print" size={18} />{t('Print receipt')}</button>
          {wa && <a className="btn btn-sm mt-wa" href={`https://wa.me/${wa}?text=${encodeURIComponent(waMessage(tk))}`} target="_blank" rel="noreferrer"><Icon name="whatsapp" size={18} />WhatsApp</a>}
          <button className="btn btn-sm" onClick={onEdit}><Icon name="edit" size={18} />{t('Edit')}</button>
          {owner && <button className="btn btn-sm mt-del" onClick={remove} aria-label={t('Delete')}><Icon name="trash" size={18} /></button>}
        </div>
      </div>
      <dl className="mt-kv">
        <dt>{t('Customer')}</dt><dd dir="auto">{tk.customer || '—'}</dd>
        <dt>{t('Phone')}</dt><dd dir="ltr">{tk.phone || '—'}</dd>
        <dt>{t('Serial')}</dt><dd dir="ltr">{tk.serial || '—'}</dd>
        <dt>{t('Problem')}</dt><dd className="plain" dir="auto">{tk.problem || '—'}</dd>
        {tk.items && <><dt>{t('Came with')}</dt><dd className="plain" dir="auto">{tk.items}</dd></>}
        {tk.provider && <><dt>{t('Warranty provider')}</dt><dd dir="auto">{tk.provider}{tk.providerRef ? ` · ${t('Ref')} ${tk.providerRef}` : ''}</dd></>}
      </dl>
      <div>
        <div className="mt-bar">{PROGRESS.map((p, i) => <span key={p} className={i < done ? 'on' : ''} />)}</div>
        <div className="mt-stages">{PROGRESS.map((p, i) => <span key={p} className={i < done ? 'on' : ''}>{t(p)}</span>)}</div>
      </div>
      {stage !== 'closed' && (
        <div className={`mt-due${tk.dueOn && workdaysLeft(today, tk.dueOn) < 0 && stage !== 'ready' ? ' bad' : ''}`}>
          <span>{tn('Max %d working days (Sun–Thu)', { d: TICKET_DAYS })}</span>
          <span>{tk.dueOn ? <><DueChip tk={tk} today={today} /> {tn('due %d', { d: dayShort(tk.dueOn) })}</> : t('Starts when the product is received')}</span>
        </div>
      )}
      <div className="mt-add">
        <b>{t('Add a step')}</b>
        <div className="mt-quick">
          {choices.map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(kind === k ? null : k)}>{t(STEP_BUTTON[k])}</button>)}
        </div>
        {kind && (
          <div className="form">
            {kind === 'sent' && (
              <div className="form-row two">
                <label><span>{t('Warranty provider')}</span><input value={provider} onChange={(e) => setProvider(e.target.value)} dir="auto" placeholder={t('Who has it now')} /></label>
                <label><span>{t('Their reference (optional)')}</span><input value={ref} onChange={(e) => setRef(e.target.value)} dir="auto" /></label>
              </div>
            )}
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} dir="auto" placeholder={t('What happened? (optional)')} />
            <div className="mt-acts end">
              <button className="btn btn-sm" onClick={() => setKind(null)}>{t('Cancel')}</button>
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={add}>{t('Add step')}</button>
            </div>
          </div>
        )}
      </div>
      <div>
        <h3 className="mt-h3">{t('Event log')}</h3>
        <ol className="mt-log">
          {tk.steps.map((s, i) => ({ s, i })).reverse().map(({ s, i }) => (
            <li key={`${s.at}-${i}`}>
              <span className={`mt-dot ${STEP_TONE[s.kind] ?? ''}`}><Icon name={s.kind === 'note' || s.kind === 'opened' || s.kind === 'update' ? 'edit' : s.kind === 'refused' ? 'close' : 'check'} size={13} /></span>
              <div>
                <h4>{t(STEP_TITLE[s.kind])}</h4>
                {s.note && <p dir="auto">{s.note}</p>}
                <small>{when(s.at)} · {s.byName || t('Someone')}</small>
              </div>
              {owner && s.kind !== 'opened' && <button className="icon-btn mt-x" onClick={() => takeOut(i)} aria-label={t('Take this step out')}><Icon name="close" size={16} /></button>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

const EMPTY: TicketFields = { customer: '', phone: '', product: '', productId: '', serial: '', problem: '', items: '', provider: '', providerRef: '' }

function TicketForm({ edit, onClose, onSaved, onPrint }: { edit?: Ticket; onClose: () => void; onSaved: (tk: Ticket) => void; onPrint: (tk: Ticket) => void }) {
  const [f, setF] = useState<TicketFields>(edit ? { ...edit } : EMPTY)
  const [received, setReceived] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const { cats } = usePrices()
  const set = (k: keyof TicketFields) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const found = useMemo(() => {
    const q = f.product.trim()
    if (!picking || q.length < 2) return []
    const out: { item: PriceItem; cat: string }[] = []
    for (const c of cats) for (const item of c.items) if (!item.hidden && matches(item, q)) out.push({ item, cat: c.name })
    return out.slice(0, 6)
  }, [cats, f.product, picking])
  const ok = f.customer.trim() && f.phone.trim() && f.product.trim()

  async function save(print: boolean) {
    if (!ok) return
    setBusy(true)
    try {
      if (edit) {
        await tickets.edit(edit, f)
        track('tickets', 'ticket.edited', { what: `${ticketNo(edit.no)} · ${f.product}`, note: f.customer, ref: edit.id })
        onSaved({ ...edit, ...f })
      } else {
        const tk = await tickets.create(f, received, note)
        track('tickets', 'ticket.opened', { what: `${ticketNo(tk.no)} · ${tk.product}`, note: `${tk.customer} · ${tk.phone}`, ref: tk.id })
        onSaved(tk)
        if (print) onPrint(tk)
      }
    } catch (e) { refused(e) }
    setBusy(false)
  }

  return (
    <Sheet
      title={edit ? tn('Edit ticket %n', { n: ticketNo(edit.no) }) : t('New ticket')}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('Cancel')}</button>
        {!edit && received && <button className="btn" disabled={!ok || busy} onClick={() => save(true)}><Icon name="print" size={18} />{t('Save and print')}</button>}
        <button className="btn btn-primary" disabled={!ok || busy} onClick={() => save(false)}>{t('Save')}</button>
      </>}
    >
      <div className="form">
        <div className="form-row two">
          <label><span>{t('Customer name')}</span><input value={f.customer} onChange={set('customer')} dir="auto" autoFocus /></label>
          <label><span>{t('Phone')}</span><input value={f.phone} onChange={set('phone')} dir="ltr" inputMode="tel" placeholder="01xxxxxxxxx" /></label>
        </div>
        <label className="mt-pickwrap">
          <span>{t('Product (from the price list, or type any name)')}</span>
          <input value={f.product} onChange={(e) => { setPicking(true); setF((x) => ({ ...x, product: e.target.value, productId: '' })) }} dir="auto" />
          {found.length > 0 && (
            <div className="mt-picks">
              {found.map(({ item, cat }) => (
                <button key={item.id} type="button" onClick={() => { setF((x) => ({ ...x, product: item.name, productId: item.id })); setPicking(false) }}>
                  <b dir="auto">{item.name}</b>
                  <small className="muted">{cat}{item.warranty ? ` · ${tn(item.warranty === 1 ? '%n year warranty' : '%n years warranty', { n: item.warranty })}` : ''}</small>
                </button>
              ))}
            </div>
          )}
        </label>
        <label><span>{t('Serial number')}</span><input value={f.serial} onChange={set('serial')} dir="ltr" /></label>
        <label><span>{t('The problem')}</span><textarea rows={3} value={f.problem} onChange={set('problem')} dir="auto" /></label>
        <label><span>{t('Came with (what the customer left)')}</span><input value={f.items} onChange={set('items')} dir="auto" placeholder={t('Monitor, power cable, stand…')} /></label>
        {!edit && (
          <>
            <div className="mt-recv">
              <span className="small t2">{t('The product is')}</span>
              <div className="seg">
                <button type="button" className={!received ? 'on' : ''} onClick={() => setReceived(false)}>{t('Still with the customer')}</button>
                <button type="button" className={received ? 'on' : ''} onClick={() => setReceived(true)}>{t('Received in store now')}</button>
              </div>
            </div>
            <label><span>{t('Note for the log (optional)')}</span><input value={note} onChange={(e) => setNote(e.target.value)} dir="auto" placeholder={t('For example: customer messaged on WhatsApp')} /></label>
            <p className="mt-due">
              <span>{tn('Due date (%d working days, no Fri/Sat)', { d: TICKET_DAYS })}</span>
              <span>{received ? dayShort(dueOf(cairoNow().date)) : t('Starts when received')}</span>
            </p>
          </>
        )}
      </div>
    </Sheet>
  )
}

/** The receipt the customer takes home: A5, the shop's logo, the date, a big tilted logo behind, and the policy. */
function TicketPaper({ tk }: { tk: Ticket }) {
  const base = import.meta.env.BASE_URL
  const receivedBy = tk.steps.find((x) => x.kind === 'received')?.byName ?? ''
  return (
    <div className="ticket-print" dir="ltr" lang="en">
      <div className="tp-mark" aria-hidden="true"><img src={`${base}static-logo.png`} alt="" /></div>
      <div className="tp-head">
        <img src={`${base}static-logo.png`} alt="Static" />
        <div className="tp-date">Date<br /><b>{paperDate(tk.receivedOn || cairoNow().date)}</b></div>
      </div>
      <div className="tp-title">
        <h1>Maintenance Receipt</h1>
        <div dir="rtl" lang="ar">إيصال استلام صيانة</div>
        <span className="tp-no">Ticket #{ticketNo(tk.no)}</span>
      </div>
      <table className="tp-table">
        <tbody>
          <tr><th>Customer name</th><td dir="auto">{tk.customer}</td></tr>
          <tr><th>Phone</th><td>{tk.phone}</td></tr>
          <tr><th>Product</th><td dir="auto">{tk.product}</td></tr>
          <tr><th>Serial number</th><td>{tk.serial}</td></tr>
          <tr><th>Problem</th><td className="plain" dir="auto">{tk.problem}</td></tr>
          {tk.items && <tr><th>Received with</th><td className="plain" dir="auto">{tk.items}</td></tr>}
          {receivedBy && <tr><th>Received by</th><td dir="auto">{receivedBy}</td></tr>}
          <tr><th>Expected by (latest)</th><td>{tk.dueOn ? `${new Date(`${tk.dueOn}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })} ${paperDate(tk.dueOn)}` : ''}</td></tr>
        </tbody>
      </table>
      <div className="tp-policy">
        <h3>Warranty policy · <span lang="ar">سياسة الضمان</span></h3>
        <p className="ar big" dir="rtl" lang="ar">• مدة الصيانة أو الاستبدال بحد أقصى {TICKET_DAYS} يوم عمل، لا تشمل يومي الجمعة والسبت.</p>
        <p className="big">• Repair or replacement takes a maximum of {TICKET_DAYS} working days, not counting Friday and Saturday.</p>
        <p className="ar" dir="rtl" lang="ar">• يرجى إحضار هذا الإيصال عند استلام المنتج.</p>
        <p>• Please bring this receipt when you collect the product.</p>
      </div>
      <div className="tp-sign"><div>Customer signature · <span lang="ar">توقيع العميل</span></div><div>Static · Received by</div></div>
      <div className="tp-foot">
        <p className="ar" dir="rtl" lang="ar"><b>مول البستان - 18 شارع يوسف الجندى، باب اللوق، التحرير ( مواعيد العمل من 12م ال 10م )</b></p>
        <p className="tp-row"><b>Phone: 01223311744 -- 01272222829</b><b className="tp-link">www.static-eg.com/</b></p>
      </div>
    </div>
  )
}

/**
 * Prints the receipt. A computer prints on A5 portrait. A phone leaves the paper to its print screen
 * (forcing a size there made Android shrink and cut the quotation), and the styles fit any width.
 */
function printPaper(name: string, done: () => void) {
  const title = document.title
  const phone = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900
  const page = document.createElement('style')
  // On a computer the paper is known (A5), so the receipt fills it and the shop's details sit at the bottom.
  page.textContent = phone ? '@page { margin: 6mm; }' : '@page { size: A5 portrait; margin: 7mm; } .ticket-print { min-height: 194mm; }'
  document.head.appendChild(page)
  document.body.classList.add('printing-ticket')
  document.title = name
  let finished = false
  const restore = () => {
    if (finished) return
    finished = true
    document.title = title
    page.remove()
    document.body.classList.remove('printing-ticket')
    done()
  }
  const started = Date.now()
  window.print()
  if (Date.now() - started > 1000 || !phone) return restore()
  const back = () => { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', back); setTimeout(restore, 500) } }
  document.addEventListener('visibilitychange', back)
  window.addEventListener('afterprint', () => setTimeout(restore, 2000), { once: true })
}
