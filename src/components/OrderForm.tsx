import { useMemo, useState } from 'react'
import { track } from '../data/activity'
import { cairoNow } from '../data/logic'
import { itemsTotal, MANUAL_SOURCES, orderNo, orders, PAY_METHODS, SOURCE_LABEL, stepBy, type Draft, type Item, type Order } from '../data/orders'
import { matches, usePrices, type PriceItem } from '../data/prices'
import { t, tn } from '../i18n'
import { Sheet } from './Sheet'
import { Icon, showToast } from './ui'

// Add an order by hand (a customer who ordered on WhatsApp, by phone or in the shop), or change one added that way.
// Lines are picked from the price list (so the sales page knows their cost) or typed in.

type Line = { name: string; qty: string; unit: string; cat?: string; ref?: string }
const money = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP`
const numOf = (s: string) => (s.trim() && isFinite(Number(s)) ? Number(s) : 0)

function linesOf(items: Item[]): Line[] {
  return items.map((x) => ({ name: x.name, qty: String(x.qty), unit: String(Math.round((x.total / (x.qty || 1)) * 100) / 100), cat: x.cat, ref: x.ref }))
}

export function OrderForm({ edit, onClose, onSaved }: { edit?: Order; onClose: () => void; onSaved: (id: string) => void }) {
  const { cats } = usePrices()
  const [source, setSource] = useState<Draft['source']>(edit && edit.source !== 'website' ? edit.source : 'whatsapp')
  const [customer, setCustomer] = useState(edit?.customer ?? '')
  const [phone, setPhone] = useState(edit?.phone ?? '')
  const [delivery, setDelivery] = useState<Draft['delivery']>(edit?.delivery ?? 'pickup')
  const [address, setAddress] = useState(edit?.address ?? '')
  const [city, setCity] = useState(edit?.city ?? '')
  const [shipping, setShipping] = useState(edit?.shipping ? String(edit.shipping) : '')
  const [payMethod, setPayMethod] = useState(edit?.payMethod || 'Cash')
  const [lines, setLines] = useState<Line[]>(edit ? linesOf(edit.items) : [])
  const [agreed, setAgreed] = useState(edit?.agreed != null ? String(edit.agreed) : '')
  const [date, setDate] = useState(edit?.date ?? '')
  const [time, setTime] = useState(edit?.time ?? '')
  const [confirmed, setConfirmed] = useState(false)
  const [note, setNote] = useState(edit?.customerNote ?? '')
  const [find, setFind] = useState('')
  const [busy, setBusy] = useState(false)

  const found = useMemo(() => {
    const q = find.trim()
    if (q.length < 2) return []
    const out: { item: PriceItem; cat: string; catName: string }[] = []
    for (const c of cats) for (const item of c.items) if (!item.hidden && matches(item, q)) out.push({ item, cat: c.id, catName: c.name })
    return out.slice(0, 8)
  }, [cats, find])

  const items: Item[] = lines.map((l) => {
    const qty = Math.max(1, Math.round(numOf(l.qty) || 1))
    const it: Item = { name: l.name, qty, total: Math.round(numOf(l.unit) * qty * 100) / 100, pid: 0, vid: 0 }
    if (l.cat && l.ref) { it.cat = l.cat; it.ref = l.ref }
    return it
  })
  const ship = delivery === 'delivery' ? numOf(shipping) : 0
  const total = itemsTotal(items) + ship
  const agreedOk = agreed.trim() === '' || (isFinite(Number(agreed)) && Number(agreed) >= 0)
  const ok = customer.trim() && lines.some((l) => l.name.trim()) && lines.every((l) => !l.name.trim() || numOf(l.unit) >= 0) && agreedOk && !busy

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)))
  function pick(item: PriceItem, cat: string) {
    const price = item.alone ?? item.in ?? 0
    setLines((ls) => [...ls, { name: item.name, qty: '1', unit: String(price), cat, ref: item.id }])
    setFind('')
  }

  async function save() {
    if (!ok) return
    setBusy(true)
    const d: Draft = {
      source, customer, phone, email: edit?.email ?? '', address: delivery === 'delivery' ? address : '', city: delivery === 'delivery' ? city : '', area: edit?.area ?? '',
      delivery, shipping: ship, payMethod, items: items.filter((x) => x.name.trim()), customerNote: note, date, time,
      status: edit ? (edit.status === 'confirmed' ? 'confirmed' : 'new') : confirmed ? 'confirmed' : 'new',
      agreed: agreed.trim() === '' ? null : Math.round(Number(agreed) * 100) / 100,
    }
    try {
      if (edit) {
        await orders.edit(edit, d, stepBy('edited', ''))
        track('orders', 'order.edited', { what: `${orderNo(edit)} · ${customer.trim()}`, ref: edit.id })
        onSaved(edit.id)
      } else {
        const id = await orders.add(d)
        track('orders', 'order.added', { what: customer.trim(), note: `${t(SOURCE_LABEL[source])} · ${money(d.agreed ?? total)}`, ref: id })
        onSaved(id)
      }
    } catch (e) {
      console.error(e)
      showToast(/permission/i.test(String(e)) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : t('Could not save. Check the connection and try again.'))
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={edit ? tn('Edit order %n', { n: orderNo(edit) }) : t('Add an order')}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn btn-primary" disabled={!ok} onClick={save}>{t(edit ? 'Save' : 'Add order')}</button>
      </>}
    >
      <div className="form">
        <label><span>{t('Ordered by')}</span>
          <select value={source} onChange={(e) => setSource(e.target.value as Draft['source'])}>{MANUAL_SOURCES.map((s) => <option key={s} value={s}>{t(SOURCE_LABEL[s])}</option>)}</select>
        </label>
        <div className="form-row two">
          <label><span>{t('Customer name')}</span><input value={customer} onChange={(e) => setCustomer(e.target.value)} dir="auto" autoFocus={!edit} /></label>
          <label><span>{t('Phone')}</span><input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" placeholder="01xxxxxxxxx" /></label>
        </div>

        <div className="or-lines">
          <span className="or-label">{t('Items')}</span>
          {lines.map((l, i) => (
            <div key={i} className="or-line">
              <input className="or-line-name" value={l.name} onChange={(e) => setLine(i, { name: e.target.value, ...(l.ref ? { cat: undefined, ref: undefined } : {}) })} dir="auto" placeholder={t('Product')} aria-label={t('Product')} />
              <label className="or-line-qty"><small>{t('Qty')}</small><input value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value.replace(/\D/g, '') })} inputMode="numeric" dir="ltr" /></label>
              <label className="or-line-price"><small>{t('Price each')}</small><input value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" dir="ltr" /></label>
              <button type="button" className="icon-btn" onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))} aria-label={t('Remove this line')}><Icon name="close" size={16} /></button>
              {!l.ref && l.name.trim() && <small className="muted or-line-hint">{t('Not from the price list: no cost for profit')}</small>}
            </div>
          ))}
          <label className="mt-pickwrap">
            <input value={find} onChange={(e) => setFind(e.target.value)} dir="auto" placeholder={t('Search the price list to add a product')} />
            {found.length > 0 && (
              <div className="mt-picks">
                {found.map(({ item, cat, catName }) => (
                  <button key={`${cat}/${item.id}`} type="button" onClick={() => pick(item, cat)}>
                    <b dir="auto">{item.name}</b>
                    <small className="muted">{catName}{item.alone != null ? ` · ${money(item.alone)}` : item.in != null ? ` · ${money(item.in)}` : ''}{item.out ? ` · ${t('Out of stock')}` : ''}</small>
                  </button>
                ))}
              </div>
            )}
          </label>
          <button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, { name: find.trim(), qty: '1', unit: '' }])}><Icon name="plus" size={16} />{t('Type a line instead')}</button>
        </div>

        <div className="seg">
          <button type="button" className={delivery === 'pickup' ? 'on' : ''} onClick={() => setDelivery('pickup')}>{t('Store pickup')}</button>
          <button type="button" className={delivery === 'delivery' ? 'on' : ''} onClick={() => setDelivery('delivery')}>{t('Home delivery')}</button>
        </div>
        {delivery === 'delivery' && (
          <>
            <label><span>{t('Address')}</span><input value={address} onChange={(e) => setAddress(e.target.value)} dir="auto" /></label>
            <div className="form-row two">
              <label><span>{t('City')}</span><input value={city} onChange={(e) => setCity(e.target.value)} dir="auto" /></label>
              <label><span>{t('Delivery (EGP)')}</span><input value={shipping} onChange={(e) => setShipping(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" dir="ltr" /></label>
            </div>
          </>
        )}
        <div className="form-row two">
          <label><span>{t(delivery === 'pickup' ? 'Pickup day' : 'Delivery day')}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={edit ? undefined : cairoNow().date} /></label>
          <label><span>{t('Time (optional)')}</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        </div>
        <div className="form-row two">
          <label><span>{t('Pays by')}</span><select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>{PAY_METHODS.map((m) => <option key={m} value={m}>{t(m)}</option>)}</select></label>
          <label><span>{t('Agreed price (optional)')}</span><input value={agreed} onChange={(e) => setAgreed(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" dir="ltr" placeholder={String(total)} /></label>
        </div>
        <p className="or-form-total">{t('Total')}: <b dir="ltr">{money(agreed.trim() && agreedOk ? Number(agreed) : total)}</b>{ship > 0 && <small className="muted"> · {tn('with %m delivery', { m: money(ship) })}</small>}</p>
        <label><span>{t('Note (optional)')}</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} dir="auto" /></label>
        {!edit && <label className="check-line"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>{t('Already confirmed with the customer')}</span></label>}
        <p className="small t2">{t('Orders added here stay in the app. They are not sent to the website.')}</p>
      </div>
    </Sheet>
  )
}
