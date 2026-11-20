import { useEffect, useMemo, useRef, useState } from 'react'
import { getAuth } from 'firebase/auth'
import { track } from '../data/activity'
import { firestore } from '../data/firebase'
import { cairoNow } from '../data/logic'
import { nudgeEngine } from '../data/nudge'
import { CATEGORIES, DEFAULT_REPS, itemsTotal, timeLabel, type Item } from '../data/orders'
import { LINK_MINUTES, linkStatus, linkTotal, linkUrl, minutesLeft, orderLinks, waLinkHref, waLinkText, type LinkStatus, type OrderLink } from '../data/orderLinks'
import { matches, usePrices, type PriceItem } from '../data/prices'
import { locale, t, tn } from '../i18n'
import { Sheet } from './Sheet'
import { Icon, showToast } from './ui'

// Order links in the Orders app: make one for a customer on WhatsApp, and follow the recent ones.

type Line = { name: string; qty: string; unit: string; cat?: string; ref?: string; pid?: number; vid?: number; web?: number | null; list?: number | null }
const money = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP`
const numOf = (s: string) => (s.trim() && isFinite(Number(s)) ? Number(s) : 0)
const REP_KEY = 'staticos.orders.rep'
const lastRep = () => { try { return localStorage.getItem(REP_KEY) ?? '' } catch { return '' } }
const keepRep = (r: string) => { try { localStorage.setItem(REP_KEY, r) } catch { /* only a convenience */ } }

/** The website's price now (the sale price when there is one), or null. */
const webPrice = (p: PriceItem) => p.onlineSale ?? p.online ?? null
/** The shop's price list price (sold on its own), or null. */
const listPrice = (p: PriceItem) => p.alone ?? p.in ?? null

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

const STATUS_TEXT: Record<LinkStatus, string> = {
  open: 'Waiting for the customer', expired: 'Expired', filled: 'Customer sent it, making the website order…', sending: 'Making the website order…',
  done: 'Website order made', error: 'The website refused it', cancelled: 'Cancelled',
}
const STATUS_CHIP: Record<LinkStatus, string> = { open: 'chip-warn', expired: '', filled: 'chip-info', sending: 'chip-info', done: 'chip-good', error: 'chip-bad', cancelled: '' }

/** Make a link: pick the items and prices, the discount, pickup or delivery, how long it works. Then copy it for WhatsApp. */
export function OrderLinkSheet({ onClose }: { onClose: () => void }) {
  const { cats } = usePrices()
  const [lines, setLines] = useState<Line[]>([])
  const [find, setFind] = useState('')
  const [discount, setDiscount] = useState('')
  const [delivery, setDelivery] = useState<'pickup' | 'delivery'>('pickup')
  const [shipping, setShipping] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [minutes, setMinutes] = useState<number>(60)
  const [note, setNote] = useState('')
  const [rep, setRep] = useState(lastRep())
  const [category, setCategory] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<OrderLink | null>(null)

  const found = useMemo(() => {
    const q = find.trim()
    if (q.length < 2) return []
    const out: { item: PriceItem; cat: string; catName: string }[] = []
    for (const c of cats) for (const item of c.items) if (!item.hidden && matches(item, q)) out.push({ item, cat: c.id, catName: c.name })
    return out.slice(0, 8)
  }, [cats, find])

  const items: Item[] = lines.map((l) => {
    const qty = Math.max(1, Math.round(numOf(l.qty) || 1))
    const it: Item = { name: l.name.trim(), qty, total: Math.round(numOf(l.unit) * qty * 100) / 100, pid: l.pid ?? 0, vid: l.vid ?? 0 }
    if (l.cat && l.ref) { it.cat = l.cat; it.ref = l.ref }
    return it
  }).filter((x) => x.name)
  const ship = delivery === 'delivery' ? numOf(shipping) : 0
  const disc = Math.min(itemsTotal(items), numOf(discount))
  const total = linkTotal(items, disc, ship)
  const ok = items.length > 0 && lines.every((l) => !l.name.trim() || numOf(l.unit) > 0) && !busy

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)))
  function pick(item: PriceItem, cat: string) {
    // A product linked to the website goes on the website order as that product (option included); else as a line with its name.
    const w = item.web?.ok ? item.web : undefined
    const price = webPrice(item) ?? listPrice(item) ?? 0
    setLines((ls) => [...ls, { name: item.name, qty: '1', unit: String(price), cat, ref: item.id, pid: w?.id ?? 0, vid: w?.variation ?? 0, web: webPrice(item), list: listPrice(item) }])
    setFind('')
  }

  async function make() {
    if (!ok) return
    setBusy(true)
    if (rep.trim()) keepRep(rep.trim())
    try {
      const l = await orderLinks.create({ items, discount: disc, delivery, shipping: ship, date, time, note, rep, category, minutes })
      track('orders', 'order.link', { what: tn('Order link · %m', { m: money(l.total) }), note: items.map((x) => `${x.qty > 1 ? `${x.qty}× ` : ''}${x.name}`).join(', ') })
      setMade(l)
    } catch (e) {
      console.error(e)
      showToast(/permission/i.test(String(e)) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : t('Could not save. Check the connection and try again.'))
    }
    setBusy(false)
  }

  if (made) {
    const url = linkUrl(made.id)
    const text = waLinkText(made, url)
    return (
      <Sheet title={t('Order link ready')} onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>{t('Done')}</button>}>
        <div className="form">
          <p className="banner">{tn('Send it to the customer now. It works for %n minutes, once.', { n: Math.round((made.expiresAt - made.createdAt) / 60000) })}</p>
          <label><span>{t('Link')}</span><input value={url} readOnly dir="ltr" onFocus={(e) => e.target.select()} /></label>
          <p className="or-form-total">{t('Total')}: <b dir="ltr">{money(made.total)}</b></p>
          <div className="ol-actions">
            <button className="btn btn-primary" onClick={async () => showToast(t((await copy(text)) ? 'Copied. Paste it in the WhatsApp chat.' : 'Could not copy. Select the link and copy it.'))}><Icon name="whatsapp" size={18} />{t('Copy for WhatsApp')}</button>
            <button className="btn" onClick={async () => showToast(t((await copy(url)) ? 'Link copied.' : 'Could not copy. Select the link and copy it.'))}><Icon name="link" size={18} />{t('Copy link only')}</button>
          </div>
          <label><span>{t('Customer WhatsApp number (optional)')}</span><input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" placeholder="01xxxxxxxxx" /></label>
          <a className="btn" href={waLinkHref(phone, text)} target="_blank" rel="noreferrer"><Icon name="send" size={18} />{t(phone.trim() ? 'Open the chat in WhatsApp' : 'Open WhatsApp')}</a>
          <a className="small" href={url} target="_blank" rel="noreferrer">{t('See what the customer sees')}</a>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet
      title={t('Make an order link')}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn btn-primary" disabled={!ok} onClick={make}><Icon name="link" size={18} />{t('Make the link')}</button>
      </>}
    >
      <div className="form">
        <p className="small t2">{t('The customer opens the link, sees these items and the total, and types their name, phone and address. It then becomes a website order (New) in Orders.')}</p>
        <div className="or-lines">
          <span className="or-label">{t('Items')}</span>
          {lines.map((l, i) => (
            <div key={i} className="or-line">
              <input className="or-line-name" value={l.name} onChange={(e) => setLine(i, { name: e.target.value, ...(l.ref || l.pid ? { cat: undefined, ref: undefined, pid: 0, vid: 0, web: null, list: null } : {}) })} dir="auto" placeholder={t('Product')} aria-label={t('Product')} />
              <label className="or-line-qty"><small>{t('Qty')}</small><input value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value.replace(/\D/g, '') })} inputMode="numeric" dir="ltr" /></label>
              <label className="or-line-price"><small>{t('Price each')}</small><input value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" dir="ltr" /></label>
              <button type="button" className="icon-btn" onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))} aria-label={t('Remove this line')}><Icon name="close" size={16} /></button>
              {(l.web != null || l.list != null) && (
                <span className="ol-prices">
                  {l.web != null && <button type="button" className={`chip${numOf(l.unit) === l.web ? ' chip-info' : ''}`} onClick={() => setLine(i, { unit: String(l.web) })}>{t('Website')} {money(l.web)}</button>}
                  {l.list != null && <button type="button" className={`chip${numOf(l.unit) === l.list ? ' chip-info' : ''}`} onClick={() => setLine(i, { unit: String(l.list) })}>{t('Price list')} {money(l.list)}</button>}
                </span>
              )}
              {!l.pid && l.name.trim() && <small className="muted or-line-hint">{t('Not linked to a website product: it goes on the website order as a line with this name.')}</small>}
            </div>
          ))}
          <label className="mt-pickwrap">
            <input value={find} onChange={(e) => setFind(e.target.value)} dir="auto" placeholder={t('Search the price list to add a product')} autoFocus />
            {found.length > 0 && (
              <div className="mt-picks">
                {found.map(({ item, cat, catName }) => {
                  const w = webPrice(item), p = listPrice(item)
                  return (
                    <button key={`${cat}/${item.id}`} type="button" onClick={() => pick(item, cat)}>
                      <b dir="auto">{item.name}</b>
                      <small className="muted">{catName}{w != null ? ` · ${t('Website')} ${money(w)}` : ''}{p != null ? ` · ${t('Price list')} ${money(p)}` : ''}{item.out ? ` · ${t('Out of stock')}` : ''}</small>
                    </button>
                  )
                })}
              </div>
            )}
          </label>
          <button type="button" className="btn btn-sm" onClick={() => { setLines((ls) => [...ls, { name: find.trim(), qty: '1', unit: '' }]); setFind('') }}><Icon name="plus" size={16} />{t('Type a line instead')}</button>
        </div>

        <div className="seg">
          <button type="button" className={delivery === 'pickup' ? 'on' : ''} onClick={() => setDelivery('pickup')}>{t('Store pickup')}</button>
          <button type="button" className={delivery === 'delivery' ? 'on' : ''} onClick={() => setDelivery('delivery')}>{t('Home delivery')}</button>
        </div>
        <div className="form-row two">
          <label><span>{t('Discount (EGP)')}</span><input value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" dir="ltr" placeholder="0" /></label>
          {delivery === 'delivery'
            ? <label><span>{t('Delivery (EGP)')}</span><input value={shipping} onChange={(e) => setShipping(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" dir="ltr" placeholder="0" /></label>
            : <span />}
        </div>
        <div className="form-row two">
          <label><span>{t(delivery === 'pickup' ? 'Pickup day (optional)' : 'Delivery day (optional)')}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={cairoNow().date} /></label>
          <label><span>{t('Time (optional)')}</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        </div>
        <label><span>{t('The link works for')}</span>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>{LINK_MINUTES.map((m) => <option key={m} value={m}>{m === 60 ? t('1 hour') : tn('%n minutes', { n: m })}</option>)}</select>
        </label>
        <label><span>{t('Message on the page (optional)')}</span><input value={note} onChange={(e) => setNote(e.target.value)} dir="auto" maxLength={500} placeholder={t('For example: the price includes the 3-year warranty')} /></label>
        <div className="form-row two">
          <label><span>{t('Sales rep')}</span><input value={rep} onChange={(e) => setRep(e.target.value)} list="ol-reps" dir="auto" /></label>
          <label><span>{t('Category')}</span><input value={category} onChange={(e) => setCategory(e.target.value)} list="ol-cats" dir="auto" /></label>
          <datalist id="ol-reps">{DEFAULT_REPS.map((r) => <option key={r} value={r} />)}</datalist>
          <datalist id="ol-cats">{CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}</datalist>
        </div>
        <p className="or-form-total">{t('Total')}: <b dir="ltr">{money(total)}</b>{(disc > 0 || ship > 0) && <small className="muted"> · {[disc > 0 ? tn('%m off', { m: money(disc) }) : '', ship > 0 ? tn('with %m delivery', { m: money(ship) }) : ''].filter(Boolean).join(' · ')}</small>}</p>
      </div>
    </Sheet>
  )
}

/** The links made in the last two days. Open ones count down; a filled one tells the engine to make the order now. */
export function OrderLinksPanel({ onOpenOrder }: { onOpenOrder: (id: string) => void }) {
  const [list, setList] = useState<OrderLink[]>([])
  const [all, setAll] = useState(false)
  const [, tick] = useState(0)
  const told = useRef(new Set<string>())

  useEffect(() => orderLinks.watchRecent(setList, (e) => console.error(e)), [])
  // Count the minutes down while links are open.
  useEffect(() => {
    if (!list.some((l) => l.state === 'open')) return
    const id = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [list])
  // A customer just sent a link: ask the engine to make the website order now (it also checks every few minutes).
  useEffect(() => {
    const fresh = list.filter((l) => l.state === 'filled' && !told.current.has(l.id))
    if (!fresh.length) return
    fresh.forEach((l) => told.current.add(l.id))
    if (firestore) nudgeEngine(getAuth(firestore.app), ['orders'])
  }, [list])

  const now = Date.now()
  // Shown by default: what still needs something (open, on its way, refused) and what finished in the last 3 hours.
  const live = list.filter((l) => {
    const s = linkStatus(l, now)
    return s === 'open' || s === 'filled' || s === 'sending' || s === 'error' || now - Math.max(l.filledAt, l.createdAt) < 3 * 3600_000
  })
  const shown = all ? list : live
  if (!list.length) return null

  async function act(l: OrderLink, what: 'cancel' | 'retry') {
    try {
      await (what === 'cancel' ? orderLinks.cancel(l) : orderLinks.retry(l))
      if (what === 'retry' && firestore) nudgeEngine(getAuth(firestore.app), ['orders'])
    } catch (e) {
      console.error(e)
      showToast(/permission/i.test(String(e)) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : t('Could not save. Check the connection and try again.'))
    }
  }

  return (
    <section className="ol-panel">
      <div className="ol-head">
        <b><Icon name="link" size={18} /> {t('Order links')}</b>
        {list.length > live.length && <button className="btn btn-sm" onClick={() => setAll(!all)}>{t(all ? 'Show fewer' : 'Show all')}</button>}
      </div>
      {shown.length === 0 && <p className="small t2">{t('Nothing waiting.')}</p>}
      {shown.map((l) => {
        const s = linkStatus(l, now)
        const stuck = s === 'sending' && now - l.filledAt > 10 * 60_000
        const url = linkUrl(l.id)
        return (
          <div key={l.id} className="ol-row">
            <span className="mt-row">
              <span className={`chip ${STATUS_CHIP[s]}`}>{t(STATUS_TEXT[s])}{s === 'open' ? ` · ${tn('%n min left', { n: minutesLeft(l, now) })}` : ''}</span>
              <small className="muted" dir="ltr">{money(l.total)}</small>
            </span>
            <span className="t2 or-items" dir="auto">{l.form?.name ? `${l.form.name} · ` : ''}{l.items.map((i) => (i.qty > 1 ? `${i.qty}× ${i.name}` : i.name)).join(' · ')}</span>
            <small className="muted">
              {t(l.delivery === 'pickup' ? 'Store pickup' : 'Home delivery')}{l.date ? ` · ${l.date}${l.time ? ` ${timeLabel(l.time)}` : ''}` : ''}
              {' · '}{tn('by %name', { name: l.byName || '—' })} · {new Date(l.createdAt || now).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })}
              {l.cancelledByName ? ` · ${tn('cancelled by %name', { name: l.cancelledByName })}` : ''}
            </small>
            {s === 'error' && l.webError && <small className="bad" dir="auto">{l.webError}</small>}
            <span className="ol-actions">
              {s === 'open' && <button className="btn btn-sm" onClick={async () => showToast(t((await copy(waLinkText(l, url))) ? 'Copied. Paste it in the WhatsApp chat.' : 'Could not copy. Select the link and copy it.'))}><Icon name="whatsapp" size={16} />{t('Copy again')}</button>}
              {s === 'open' && <button className="btn btn-sm" onClick={() => act(l, 'cancel')}>{t('Cancel link')}</button>}
              {(s === 'error' || stuck) && <button className="btn btn-sm" onClick={() => act(l, 'retry')}><Icon name="redo" size={16} />{t('Try again')}</button>}
              {s === 'done' && l.wooId > 0 && <button className="btn btn-sm btn-primary" onClick={() => onOpenOrder(`W${l.wooId}`)}>{tn('Open order %n', { n: `#${l.number || l.wooId}` })}</button>}
            </span>
          </div>
        )
      })}
    </section>
  )
}
