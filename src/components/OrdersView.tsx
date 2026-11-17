import { useEffect, useMemo, useState } from 'react'
import { getAuth } from 'firebase/auth'
import { track } from '../data/activity'
import { firestore } from '../data/firebase'
import { cairoNow } from '../data/logic'
import { nudgeEngine } from '../data/nudge'
import { nameOf } from '../data/profiles'
import {
  ADDABLE, CATEGORIES, DEFAULT_REPS, isManual, leftOf, matchesOrder, orderNo, orders, paidOf, PAY_METHODS, priceOf, progressOf, SOURCE_LABEL, STATUS_LABEL, stepBy, timeLabel, waMessage, waNumber, WEB_LABEL, whereNow,
  type Order, type Status, type Step, type StepKind,
} from '../data/orders'
import { allowed, isOwner } from '../data/store'
import { locale, t, tn } from '../i18n'
import { OrderForm } from './OrderForm'
import { OrderStats } from './OrderStats'
import { Sheet } from './Sheet'
import { useDesktop } from './useDesktop'
import { Empty, Icon, SearchBox, showToast } from './ui'

type Filter = 'open' | 'new' | 'confirmed' | 'completed' | 'cancelled'
const FILTERS: Filter[] = ['open', 'new', 'confirmed', 'completed', 'cancelled']

/** Names for each step, in the log and on the buttons that add them. */
const STEP_TITLE: Record<StepKind, string> = {
  placed: 'Order placed on the website', called: 'Called the customer', confirmed: 'Order confirmed', date: 'Date and time set', price: 'Agreed price changed',
  paid: 'Payment received', ready: 'Ready for pickup', out: 'Out for delivery', delivered: 'Delivered, order completed', cancelled: 'Order cancelled',
  reopened: 'Order opened again', note: 'Note', website: 'Status changed on the website', edited: 'Order details changed',
}
const STEP_BUTTON: Record<StepKind, string> = {
  placed: 'Placed', called: 'Called', confirmed: 'Confirm order', date: 'Date and time', price: 'Agreed price', paid: 'Payment', ready: 'Ready for pickup',
  out: 'Out for delivery', delivered: 'Delivered (complete)', cancelled: 'Cancel order', reopened: 'Open again', note: 'Note', website: 'Website', edited: 'Edit',
}
const STEP_TONE: Partial<Record<StepKind, string>> = { placed: 'b', confirmed: 'b', date: 'b', paid: 'g', ready: 'o', out: 'o', delivered: 'g', cancelled: 'r', called: 'b', website: '' }
const STEP_ICON: Partial<Record<StepKind, string>> = { placed: 'globe', called: 'whatsapp', date: 'calendar', price: 'prices', paid: 'check', note: 'edit', cancelled: 'close', website: 'globe', out: 'send', reopened: 'redo', edited: 'edit' }
const PROGRESS = ['Placed', 'Confirmed', 'Paid', 'Ready or on the way', 'Delivered']

const money = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP`
const when = (ms: number) => new Date(ms).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })
const dayShort = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const whenLabel = (o: Pick<Order, 'date' | 'time'>) => (o.date ? `${dayShort(o.date)}${o.time ? ` · ${timeLabel(o.time)}` : ''}` : '')
const refused = (e: unknown) => {
  console.error(e)
  showToast(/permission/i.test(String(e)) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : t('Could not save. Check the connection and try again.'))
}
const tellEngine = () => { if (firestore) nudgeEngine(getAuth(firestore.app), ['orders']) }

function StatusChip({ o }: { o: Order }) {
  const cls = o.status === 'completed' ? 'chip-good' : o.status === 'new' ? 'chip-warn' : o.status === 'confirmed' ? 'chip-info' : 'chip-bad'
  return <span className={`chip ${cls}`}>{t(STATUS_LABEL[o.status])}</span>
}

/** Whether the website has caught up with the app. */
function SyncChip({ o }: { o: Order }) {
  if (isManual(o)) return <span className="chip">{t(SOURCE_LABEL[o.source])}</span>
  if (o.webError) return <span className="chip chip-bad" title={o.webError}>{t('Website refused')}</span>
  if (o.want) return <span className="chip">{t('Sending to website…')}</span>
  return null
}

export function OrdersView() {
  const desktop = useDesktop()
  const today = cairoNow().date
  const [open, setOpen] = useState<Order[] | null>(null)
  const [closed, setClosed] = useState<Order[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('open')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'stats'>('list')
  const [form, setForm] = useState<{ edit?: Order } | null>(null)
  const canEdit = allowed('orders.edit')
  /** An order opened from the sales page that is not among the loaded ones. */
  const [extra, setExtra] = useState<Order | null>(null)

  useEffect(() => orders.watchOpen((list) => { setOpen(list); setError('') }, (e) => setError(String(e))), [])
  // Closed orders are read once, only when someone looks for them.
  const wantClosed = filter === 'completed' || filter === 'cancelled' || search.trim().length >= 3
  useEffect(() => {
    if (!wantClosed || closed) return
    orders.loadClosed().then(setClosed, (e) => setError(String(e)))
  }, [wantClosed, closed])

  const all = useMemo(() => {
    const byId = new Map<string, Order>()
    for (const x of closed ?? []) byId.set(x.id, x)
    for (const x of open ?? []) byId.set(x.id, x)
    if (extra && !byId.has(extra.id)) byId.set(extra.id, extra)
    return [...byId.values()]
  }, [open, closed, extra])
  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0 }
    for (const x of open ?? []) { c[x.status] = (c[x.status] ?? 0) + 1; if (!x.closed) c.open++ }
    return c
  }, [open])
  const today2 = (open ?? []).filter((x) => x.date === today).length

  const list = all
    .filter((x) => {
      if (search.trim()) return matchesOrder(x, search)
      if (filter === 'open') return !x.closed
      if (filter === 'cancelled') return ['cancelled', 'refunded', 'failed'].includes(x.status)
      return x.status === filter
    })
    .sort((a, b) => {
      // Open: the soonest date first, then the newest without a date. Closed: the newest first.
      if (filter === 'completed' || filter === 'cancelled' || search.trim()) return b.updatedAt - a.updatedAt
      const da = a.date || '9999', db = b.date || '9999'
      return da !== db ? (da < db ? -1 : 1) : (a.time || '99') !== (b.time || '99') ? ((a.time || '99') < (b.time || '99') ? -1 : 1) : b.placedAt - a.placedAt
    })
  const current = all.find((x) => x.id === selected) ?? (desktop ? list[0] : undefined)

  const detail = current && (
    <OrderDetail
      key={current.id}
      o={current}
      onDeleted={() => setSelected(null)}
      onEdit={() => setForm({ edit: current })}
      onClosed={(o) => setClosed((c) => (c ? [o, ...c.filter((x) => x.id !== o.id)] : c))}
    />
  )

  const formSheet = form && (
    <OrderForm
      edit={form.edit}
      onClose={() => setForm(null)}
      onSaved={(id) => { setForm(null); setView('list'); if (!form.edit) { setFilter('open'); setSearch('') } setSelected(id) }}
    />
  )
  const top = (
    <div className="os-switch">
      <div className="seg">
        <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>{t('Orders')}</button>
        <button className={view === 'stats' ? 'on' : ''} onClick={() => setView('stats')}>{t('Sales')}</button>
      </div>
      {canEdit && <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={20} />{t('Add order')}</button>}
    </div>
  )

  if (view === 'stats') {
    return (
      <div className="mt">
        {top}
        <OrderStats onOpen={(o) => { setExtra(o); setSelected(o.id); setView('list') }} />
        {formSheet}
      </div>
    )
  }

  return (
    <div className="mt">
      {top}
      <div className="mt-top">
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f} className={`filter${filter === f && !search.trim() ? ' on' : ''}`} onClick={() => { setFilter(f); setSearch('') }}>
              {t(f === 'open' ? 'Open' : STATUS_LABEL[f as Status])}
              {(f === 'open' || f === 'new' || f === 'confirmed') && counts[f] ? <i>{counts[f]}</i> : null}
            </button>
          ))}
        </div>
      </div>
      <SearchBox value={search} onChange={setSearch} placeholder={t('Search name, phone, product, order number')} />
      {today2 > 0 && !search.trim() && filter === 'open' && <p className="banner mt-late">{tn(today2 === 1 ? '%n order is due today.' : '%n orders are due today.', { n: today2 })}</p>}
      {error && <p className="banner banner-bad mt-late" dir="ltr">{/permission/i.test(error) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : error}</p>}
      <div className={desktop ? 'mt-split' : ''}>
        <div className="mt-list">
          {open === null ? <p className="muted">{t('Loading…')}</p>
            : list.length === 0 ? <Empty icon="cart" text={search.trim() ? t('No order matches the search.') : filter === 'open' ? t('No open orders. New website orders show up here by themselves.') : t('No orders here.')} />
              : list.map((x) => {
                const now = whereNow(x)
                const left = leftOf(x)
                return (
                  <button key={x.id} className={`mt-card${current?.id === x.id && desktop ? ' sel' : ''}${!x.closed && x.date && x.date < today ? ' late' : ''}`} onClick={() => setSelected(x.id)}>
                    <span className="mt-row"><span className="mt-no" dir="ltr">{orderNo(x)}</span><span className="or-chips"><SyncChip o={x} /><StatusChip o={x} /></span></span>
                    <b dir="auto">{x.customer || t('No name')}</b>
                    <span className="t2 or-items" dir="auto">{x.items.map((i) => (i.qty > 1 ? `${i.qty}× ${i.name}` : i.name)).join(' · ')}</span>
                    <span className="mt-row">
                      <span className="chip chip-info">{t(x.delivery === 'pickup' ? 'Store pickup' : 'Home delivery')}{now ? ` · ${t(STEP_BUTTON[now])}` : ''}</span>
                      <small className="muted mt-when">{x.date ? whenLabel(x) : money(priceOf(x))}{!x.closed && left > 0 && paidOf(x) > 0 ? ` · ${tn('%m left', { m: money(left) })}` : ''}</small>
                    </span>
                  </button>
                )
              })}
          {(filter === 'completed' || filter === 'cancelled') && closed && closed.length >= 1 && <p className="muted small">{t('Showing the latest closed orders.')}</p>}
        </div>
        {desktop && <div className="mt-side">{detail ?? <Empty icon="cart" text={t('Pick an order to see its log.')} />}</div>}
      </div>
      {!desktop && current && <Sheet title={orderNo(current)} onClose={() => setSelected(null)}>{detail}</Sheet>}
      {formSheet}
    </div>
  )
}

function OrderDetail({ o, onDeleted, onClosed, onEdit }: { o: Order; onDeleted: () => void; onClosed: (o: Order) => void; onEdit: () => void }) {
  const [kind, setKind] = useState<StepKind | null>(null)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [date, setDate] = useState(o.date)
  const [time, setTime] = useState(o.time)
  const [busy, setBusy] = useState(false)
  const done = progressOf(o)
  const owner = isOwner()
  const canEdit = allowed('orders.edit')
  const price = priceOf(o)
  const paid = paidOf(o)
  const left = leftOf(o)
  const manual = isManual(o)
  const [tagging, setTagging] = useState(false)
  const [repIn, setRepIn] = useState(o.rep)
  const [catIn, setCatIn] = useState(o.category)
  async function saveTag() {
    setBusy(true)
    try {
      await orders.tag(o, repIn, catIn, stepBy('edited', [repIn.trim() && `${t('Sales rep')}: ${repIn.trim()}`, catIn.trim() && `${t('Category')}: ${catIn.trim()}`].filter(Boolean).join(' · ')))
      track('orders', 'order.edited', { what: `${orderNo(o)} · ${o.customer}`, note: [repIn, catIn].filter((x) => x.trim()).join(' · '), ref: o.id })
      setTagging(false)
    } catch (e) { refused(e) }
    setBusy(false)
  }
  const reopenable = o.status === 'completed' || o.status === 'cancelled'
  const choices: StepKind[] = o.closed ? (reopenable ? ['reopened', 'paid', 'note'] : ['note'])
    : ADDABLE.filter((k) => !(k === 'confirmed' && o.status === 'confirmed') && !(k === 'ready' && o.delivery === 'delivery') && !(k === 'out' && o.delivery === 'pickup'))

  function pick(k: StepKind) {
    if (kind === k) return setKind(null)
    setKind(k)
    setNote('')
    if (k === 'paid') { setAmount(left > 0 ? String(left) : ''); setMethod((PAY_METHODS as readonly string[]).includes(o.payMethod) ? o.payMethod : 'Cash') }
    if (k === 'price') setAmount(String(price))
    if (k === 'date') { setDate(o.date || cairoNow().date); setTime(o.time) }
  }
  const amountOk = kind !== 'paid' && kind !== 'price' ? true : amount.trim() !== '' && isFinite(Number(amount)) && Number(amount) >= 0 && (kind === 'price' || Number(amount) > 0)
  const dateOk = kind !== 'date' || /^\d{4}-\d{2}-\d{2}$/.test(date)

  async function add() {
    if (!kind || !amountOk || !dateOk) return
    if (kind === 'cancelled' && !confirm(manual ? tn('Cancel order %n?', { n: orderNo(o) }) : tn('Cancel order %n? The website order is cancelled too.', { n: orderNo(o) }))) return
    if (kind === 'delivered' && left > 0 && !confirm(tn('%m is still unpaid. Complete the order anyway?', { m: money(left) }))) return
    setBusy(true)
    const step: Step = stepBy(kind, note, kind === 'paid' ? { amount: Number(amount), method } : kind === 'price' ? { amount: Number(amount) } : kind === 'date' ? { date, time } : {})
    try {
      await orders.addStep(o, step)
      const extra = kind === 'paid' ? `${money(step.amount ?? 0)} · ${method}` : kind === 'price' ? money(step.amount ?? 0) : kind === 'date' ? whenLabel({ date, time }) : ''
      track('orders', 'order.step', { what: `${orderNo(o)} · ${o.customer}`, note: [STEP_TITLE[kind], extra, step.note].filter(Boolean).join(': '), ref: o.id })
      if (!manual && ['confirmed', 'delivered', 'cancelled', 'reopened'].includes(kind)) tellEngine()
      if (kind === 'delivered' || kind === 'cancelled') onClosed({ ...o, steps: [...o.steps, step], status: kind === 'delivered' ? 'completed' : 'cancelled', closed: true, updatedAt: Date.now() })
      setKind(null)
      setNote('')
    } catch (e) { refused(e) }
    setBusy(false)
  }
  async function takeOut(i: number) {
    if (!confirm(t('Take this step out of the log?'))) return
    try {
      await orders.removeStep(o, i)
      track('orders', 'order.step_removed', { what: `${orderNo(o)} · ${o.customer}`, note: t(STEP_TITLE[o.steps[i].kind]), ref: o.id })
    } catch (e) { refused(e) }
  }
  async function remove() {
    if (!confirm(manual ? tn('Delete order %n? This cannot be undone.', { n: orderNo(o) }) : tn('Remove order %n from the app? It stays on the website.', { n: orderNo(o) }))) return
    try {
      await orders.remove(o)
      track('orders', 'order.deleted', { what: `${orderNo(o)} · ${o.customer}`, ref: o.id })
      onDeleted()
    } catch (e) { refused(e) }
  }

  const wa = waNumber(o.phone)
  const stepExtra = (s: Step) => s.kind === 'paid' ? `${money(s.amount ?? 0)}${s.method ? ` · ${t(s.method)}` : ''}`
    : s.kind === 'price' ? money(s.amount ?? 0)
      : s.kind === 'date' ? whenLabel({ date: s.date ?? '', time: s.time ?? '' }) || t('No date')
        : s.kind === 'website' && s.web ? t(WEB_LABEL[s.web] ?? s.web) : ''
  return (
    <div className="mt-detail">
      {/* Stays at the top while the rest scrolls: who, the buttons, and how far the order got. */}
      <div className="or-pin">
      <div className="mt-head">
        <div>
          <div className="mt-no"><bdi dir="ltr">{orderNo(o)}</bdi> · {when(o.placedAt)}</div>
          <h2 dir="auto">{o.customer || t('No name')}</h2>
        </div>
        <div className="mt-acts">
          {wa && <a className="btn btn-sm mt-wa" href={`https://wa.me/${wa}?text=${encodeURIComponent(waMessage(o))}`} target="_blank" rel="noreferrer"><Icon name="whatsapp" size={18} />WhatsApp</a>}
          {o.phone && <a className="btn btn-sm" href={`tel:${o.phone.replace(/[^\d+]/g, '')}`}><Icon name="user" size={18} />{t('Call')}</a>}
          {manual && canEdit && <button className="btn btn-sm" onClick={onEdit}><Icon name="edit" size={18} />{t('Edit')}</button>}
          {owner && <button className="btn btn-sm mt-del" onClick={remove} aria-label={t('Remove from the app')}><Icon name="trash" size={18} /></button>}
        </div>
      </div>
      <div className="or-status">
        <StatusChip o={o} />
        {manual ? <span className="small t2">{tn('Added in the app · %s', { s: t(SOURCE_LABEL[o.source]) })}</span>
          : <span className="small t2">{tn('Website: %s', { s: t(WEB_LABEL[o.webStatus] ?? o.webStatus ?? '—') })}</span>}
        <SyncChip o={o} />
      </div>
      <div>
        <div className="mt-bar">{PROGRESS.map((p, i) => <span key={p} className={done[i] ? 'on' : ''} />)}</div>
        <div className="mt-stages">{PROGRESS.map((p, i) => <span key={p} className={done[i] ? 'on' : ''}>{t(p)}</span>)}</div>
      </div>
      </div>
      {o.webError && <p className="banner banner-bad mt-late" dir="auto">{tn('The website did not take the last change: %e', { e: o.webError })}</p>}
      <dl className="mt-kv">
        <dt>{t('Phone')}</dt><dd dir="ltr">{o.phone || '—'}</dd>
        {o.email && <><dt>{t('Email')}</dt><dd dir="ltr">{o.email}</dd></>}
        <dt>{t(o.delivery === 'pickup' ? 'Store pickup' : 'Home delivery')}</dt>
        <dd dir="auto">{o.date ? whenLabel(o) : t('No date yet')}</dd>
        {(o.delivery === 'delivery' || o.address) && <><dt>{t('Address')}</dt><dd className="plain" dir="auto">{[o.address, o.city, o.area].filter(Boolean).join(', ') || '—'}</dd></>}
        <dt>{t('Pays by')}</dt><dd dir="auto">{o.payMethod ? t(o.payMethod) : '—'}</dd>
        <dt>{t('Sales rep')}</dt>
        <dd dir="auto">{o.rep || '—'}{o.category ? ` · ${t(o.category)}` : ''}{canEdit && !manual && !tagging && <button className="link-btn or-tag" onClick={() => { setRepIn(o.rep); setCatIn(o.category); setTagging(true) }}>{t('Change')}</button>}</dd>
        {o.label && <><dt>{t('Label used')}</dt><dd dir="auto">{o.label}</dd></>}
        {o.shipState && <><dt>{t('Shipping state')}</dt><dd dir="auto">{o.shipState}</dd></>}
        {o.customerNote && <><dt>{t('Customer note')}</dt><dd className="plain" dir="auto">{o.customerNote}</dd></>}
      </dl>
      {tagging && (
        <div className="form or-tagform">
          <div className="two">
            <label><span>{t('Sales rep')}</span><input value={repIn} onChange={(e) => setRepIn(e.target.value)} list="or-reps2" dir="auto" autoFocus /></label>
            <label><span>{t('Category')}</span><input value={catIn} onChange={(e) => setCatIn(e.target.value)} list="or-cats2" dir="auto" /></label>
          </div>
          <datalist id="or-reps2">{DEFAULT_REPS.map((r) => <option key={r} value={r} />)}</datalist>
          <datalist id="or-cats2">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          <div className="mt-acts end">
            <button className="btn btn-sm" onClick={() => setTagging(false)}>{t('Cancel')}</button>
            <button className="btn btn-sm btn-primary" disabled={busy || (repIn.trim() === o.rep && catIn.trim() === o.category)} onClick={saveTag}>{t('Save')}</button>
          </div>
        </div>
      )}
      <table className="or-items-table">
        <tbody>
          {o.items.map((i, n) => (
            <tr key={n}><td dir="auto">{i.name}</td><td className="num">{i.qty > 1 ? `× ${i.qty}` : ''}</td><td className="num" dir="ltr">{money(i.total)}</td></tr>
          ))}
          {o.shipping > 0 && <tr><td>{t('Delivery')}</td><td /><td className="num" dir="ltr">{money(o.shipping)}</td></tr>}
          <tr className="sum"><td>{t(manual ? 'Total' : 'Website total')}</td><td /><td className="num" dir="ltr">{money(o.webTotal)}</td></tr>
        </tbody>
      </table>
      <div className="or-money">
        <div><small>{t('Agreed price')}</small><b dir="ltr">{money(price)}</b></div>
        <div><small>{t('Paid')}</small><b dir="ltr" className={paid > 0 ? 'good' : ''}>{money(paid)}</b></div>
        <div><small>{left < 0 ? t('Paid too much') : t('Left to pay')}</small><b dir="ltr" className={left > 0 ? 'bad' : 'good'}>{money(Math.abs(left))}</b></div>
      </div>
      {canEdit && <div className="mt-add">
        <b>{t('Add a step')}</b>
        <div className="mt-quick">
          {choices.map((k) => <button key={k} className={`${kind === k ? 'on' : ''}${k === 'cancelled' ? ' or-cancel' : ''}`} onClick={() => pick(k)}>{t(STEP_BUTTON[k])}</button>)}
        </div>
        {kind && (
          <div className="form">
            {(kind === 'paid' || kind === 'price') && (
              <div className={`form-row${kind === 'paid' ? ' two' : ''}`}>
                <label><span>{t(kind === 'paid' ? 'Amount paid (EGP)' : 'Agreed price (EGP)')}</span><input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" dir="ltr" autoFocus /></label>
                {kind === 'paid' && <label><span>{t('Paid by')}</span><select value={method} onChange={(e) => setMethod(e.target.value)}>{PAY_METHODS.map((m) => <option key={m} value={m}>{t(m)}</option>)}</select></label>}
              </div>
            )}
            {kind === 'date' && (
              <div className="form-row two">
                <label><span>{t(o.delivery === 'pickup' ? 'Pickup day' : 'Delivery day')}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                <label><span>{t('Time (optional)')}</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
              </div>
            )}
            {!manual && (kind === 'confirmed' || kind === 'delivered' || kind === 'cancelled' || kind === 'reopened') && (
              <p className="small t2">{tn('The website order becomes %s.', { s: t(kind === 'confirmed' || kind === 'reopened' ? 'Processing' : kind === 'delivered' ? 'Completed' : 'Cancelled') })}</p>
            )}
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} dir="auto" placeholder={t(kind === 'paid' ? 'For example: deposit for shipping (optional)' : 'What happened? (optional)')} />
            <div className="mt-acts end">
              <button className="btn btn-sm" onClick={() => setKind(null)}>{t('Cancel')}</button>
              <button className="btn btn-sm btn-primary" disabled={busy || !amountOk || !dateOk} onClick={add}>{t('Add step')}</button>
            </div>
          </div>
        )}
      </div>}
      <div>
        <h3 className="mt-h3">{t('Event log')}</h3>
        <ol className="mt-log">
          {o.steps.map((s, i) => ({ s, i })).reverse().map(({ s, i }) => {
            const extra = stepExtra(s)
            return (
              <li key={`${s.at}-${i}`}>
                <span className={`mt-dot ${STEP_TONE[s.kind] ?? ''}`}><Icon name={STEP_ICON[s.kind] ?? 'check'} size={13} /></span>
                <div>
                  <h4>{t(s.kind === 'placed' && manual ? 'Order added in the app' : STEP_TITLE[s.kind])}{extra && <span className="or-extra" dir="auto"> · {extra}</span>}</h4>
                  {s.note && <p dir="auto">{s.note}</p>}
                  <small>{when(s.at)} · {s.by === 'website' ? t('Website') : nameOf(s.by, s.byName) || t('Someone')}</small>
                </div>
                {owner && s.kind !== 'placed' && s.kind !== 'website' && s.kind !== 'edited' && <button className="icon-btn mt-x" onClick={() => takeOut(i)} aria-label={t('Take this step out')}><Icon name="close" size={16} /></button>}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
