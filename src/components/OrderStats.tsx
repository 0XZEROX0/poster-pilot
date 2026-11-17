import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useCosts, useCostShown } from '../data/costs'
import { cairoNow } from '../data/logic'
import { monthsBetween, orderCosts, type CostEntry, type SavedCosts } from '../data/orderCosts'
import { PERIOD_LABEL, PERIODS, periodDays, periodRange, statsOf, sumsBy, webIndex, type CostCtx, type OrderLine, type Period, type Sums } from '../data/orderStats'
import { orderNo, orders, SOURCE_LABEL, type Order } from '../data/orders'
import { usePrices } from '../data/prices'
import { allowed } from '../data/store'
import { locale, t, tn } from '../i18n'
import { CostEye } from './PricesView'
import { Empty, showToast } from './ui'

// Sales (and, for roles that may see cost, profit) of website orders and orders added by hand, for a period.

const money = (n: number) => `${Math.round(n).toLocaleString('en-US')} EGP`
const dayLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const HIDDEN = '••••'

export function OrderStats({ onOpen }: { onOpen: (o: Order) => void }) {
  const today = cairoNow().date
  const [period, setPeriod] = useState<Period>('month')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const days = periodDays(period, today, from, to)
  const [list, setList] = useState<Order[] | null>(null)
  const [error, setError] = useState('')
  const seeCost = allowed('cost')

  useEffect(() => {
    let live = true
    setList(null)
    const r = periodRange(days)
    orders.loadPlaced(r.from, r.to).then((l) => { if (live) { setList(l); setError('') } }, (e) => { if (live) setError(String(e)) })
    return () => { live = false }
  }, [days.from, days.to]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="os">
      <div className="filters">
        {PERIODS.map((p) => <button key={p} className={`filter${period === p ? ' on' : ''}`} onClick={() => setPeriod(p)}>{t(PERIOD_LABEL[p])}</button>)}
      </div>
      {period === 'custom' && (
        <div className="form"><div className="two">
          <label><span>{t('From')}</span><input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} /></label>
          <label><span>{t('To')}</span><input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} /></label>
        </div></div>
      )}
      <p className="small t2">
        {days.from === days.to ? dayLabel(days.from) : `${dayLabel(days.from)} – ${dayLabel(days.to)}`} · {t('Orders count on the day they were placed. Sales are completed orders only.')}
      </p>
      {error && <p className="banner banner-bad" dir="ltr">{/permission/i.test(error) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : error}</p>}
      {list === null && !error ? <p className="muted">{t('Loading…')}</p>
        : list && (seeCost ? <WithCost list={list} days={days} onOpen={onOpen} /> : <Body list={list} ctx={null} onOpen={onOpen} />)}
    </div>
  )
}

/**
 * Reads the costs, the website links (to know what website lines cost) and the costs saved on orders, only for
 * roles that may see cost. Saved order costs are one document per month of the period.
 */
function WithCost({ list, days, onOpen }: { list: Order[]; days: { from: string; to: string }; onOpen: (o: Order) => void }) {
  const { costs, hist, loaded } = useCosts()
  const { cats } = usePrices()
  const web = useMemo(() => webIndex(cats), [cats])
  const [saved, setSaved] = useState<SavedCosts | null>(null)
  useEffect(() => {
    let live = true
    setSaved(null)
    orderCosts.load(monthsBetween(days.from, days.to)).then((s) => { if (live) setSaved(s) }, () => { if (live) setSaved({}) })
    return () => { live = false }
  }, [days.from, days.to])
  const ctx = useMemo<CostCtx | null>(() => (loaded && saved ? { costs, hist, web, saved } : null), [loaded, saved, costs, hist, web])
  const onSaved = useCallback((entries: CostEntry[]) => setSaved((s) => {
    const next = { ...(s ?? {}) }
    for (const e of entries) next[e.id] = e.lines
    return next
  }), [])
  return <Body list={list} ctx={ctx} onOpen={onOpen} costRole onSaved={onSaved} />
}

function Body({ list, ctx, onOpen, costRole, onSaved }: { list: Order[]; ctx: CostCtx | null; onOpen: (o: Order) => void; costRole?: boolean; onSaved?: (e: CostEntry[]) => void }) {
  const shown = useCostShown()
  const s = useMemo(() => statsOf(list, ctx), [list, ctx])
  const showProfit = Boolean(costRole && shown && ctx)
  const profit = (x: Sums) => (!costRole ? null : !showProfit ? HIDDEN : x.costed ? money(x.profit) : '—')
  if (!list.length) return <Empty icon="cart" text={t('No orders were placed in these days.')} />
  return (
    <>
      <div className="tiles os-tiles">
        <div className="tile" style={{ '--tone': 'var(--good)' } as CSSProperties}><span>{t('Sales')}</span><b dir="ltr">{money(s.all.sales)}</b><small className="muted">{tn(s.all.completed === 1 ? '%n completed order' : '%n completed orders', { n: s.all.completed })}</small></div>
        {costRole && (
          <div className="tile" style={{ '--tone': 'var(--accent)' } as CSSProperties}>
            <span className="os-eye">{t('Profit')}<CostEye compact /></span>
            <b dir="ltr">{profit(s.all)}</b>
            {s.all.uncosted > 0 && (
              <small className="muted">
                {tn(s.all.uncosted === 1 ? '%n order left out: an item has no cost' : '%n orders left out: an item has no cost', { n: s.all.uncosted })}
                {showProfit && <> · <a href="#os-fix" onClick={(e) => { e.preventDefault(); document.getElementById('os-fix')?.scrollIntoView({ behavior: 'smooth' }) }}>{t('Fill in costs')}</a></>}
              </small>
            )}
          </div>
        )}
        <div className="tile" style={{ '--tone': 'var(--accent)' } as CSSProperties}><span>{t('Average order')}</span><b dir="ltr">{money(s.all.average)}</b><small className="muted">{tn('Delivery: %m', { m: money(s.all.delivery) })}</small></div>
        <div className="tile" style={{ '--tone': 'var(--warn)' } as CSSProperties}><span>{t('Still open')}</span><b dir="ltr">{money(s.all.openValue)}</b><small className="muted">{tn(s.all.open === 1 ? '%n order' : '%n orders', { n: s.all.open })} · {tn('%n cancelled', { n: s.all.cancelled })}</small></div>
      </div>

      <Split title="Where orders came from" rows={[['Website', s.website], ['Added in the app', s.manual], ['All', s.all]]} profit={profit} costRole={costRole} total />
      <Split title="By where the customer ordered" rows={sumsBy(list, ctx, (o) => SOURCE_LABEL[o.source])} profit={profit} costRole={costRole} />
      <Split title="By sales rep" rows={sumsBy(list, ctx, (o) => o.rep).map(([k, x]) => [k || 'No sales rep', x] as [string, Sums])} profit={profit} costRole={costRole} />
      <Split title="By category" rows={sumsBy(list, ctx, (o) => (o.category === 'ACC' ? 'Accessories' : o.category)).map(([k, x]) => [k || 'No category', x] as [string, Sums])} profit={profit} costRole={costRole} />

      {showProfit && ctx && onSaved && s.lines.length > 0 && <CostFix lines={s.lines} onSaved={onSaved} />}

      {s.lines.length > 0 && (
        <>
          <h3 className="mt-h3">{t('Completed orders')}</h3>
          <div className="os-lines">
            {s.lines.map(({ o, sale, profit: p }) => (
              <button key={o.id} className="os-line" onClick={() => onOpen(o)}>
                <span><b dir="ltr">{orderNo(o)}</b> <span dir="auto">{o.customer || t('No name')}</span></span>
                <small className="muted">{t(SOURCE_LABEL[o.source])}</small>
                <span className="num" dir="ltr">{money(sale)}</span>
                {costRole && <span className={`num ${showProfit && p !== null ? (p >= 0 ? 'good' : 'bad') : 'muted'}`} dir="ltr">{showProfit ? (p === null ? t('No cost') : money(p)) : HIDDEN}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

/** One table of sums: orders, completed, sales and (for cost roles) profit per row. */
function Split({ title, rows, profit, costRole, total }: { title: string; rows: [string, Sums][]; profit: (x: Sums) => string | null; costRole?: boolean; total?: boolean }) {
  if (!rows.length) return null
  return (
    <div>
      <h3 className="mt-h3">{t(title)}</h3>
      <table className="or-items-table os-table">
        <thead><tr><th /><th className="num">{t('Orders')}</th><th className="num">{t('Completed')}</th><th className="num">{t('Sales')}</th>{costRole && <th className="num">{t('Profit')}</th>}</tr></thead>
        <tbody>
          {rows.map(([label, x], i) => (
            <tr key={label} className={total && i === rows.length - 1 ? 'sum' : ''}>
              <td dir="auto">{t(label)}</td><td className="num">{x.orders}</td><td className="num">{x.completed}</td><td className="num" dir="ltr">{money(x.sales)}</td>{costRole && <td className="num" dir="ltr">{profit(x)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const PAGE = 15
const cleanNum = (v: string) => { const n = Number(v.replace(/[^\d.]/g, '')); return v.trim() !== '' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null }

/**
 * Completed orders whose items do not all have a known cost, to fill in: type what a line cost (for one), or take
 * the suggested cost (today's price list cost of the same product). "All completed" lets a cost be corrected too.
 */
function CostFix({ lines, onSaved }: { lines: OrderLine[]; onSaved: (e: CostEntry[]) => void }) {
  const [all, setAll] = useState(false)
  const [max, setMax] = useState(PAGE)
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const missing = lines.filter((l) => l.missing > 0)
  const shownList = (all ? lines : missing).slice(0, max)
  // Orders where a suggestion fills at least one missing line.
  const bulk = missing.filter((l) => l.lines?.some((c) => c.unit === null && c.suggest !== null))
  async function useAll() {
    if (!sure) { setSure(true); return }
    setBusy(true)
    const entries: CostEntry[] = bulk.map(({ o, lines: lc }) => ({ id: o.id, placedAt: o.placedAt, lines: o.items.map((it, i) => ({ n: it.name, c: lc![i].from === 'order' ? lc![i].unit : lc![i].unit === null ? lc![i].suggest : null })) }))
    try {
      await orderCosts.save(entries)
      onSaved(entries)
      showToast(tn('Saved costs on %n orders', { n: entries.length }))
    } catch (e) {
      showToast(/permission/i.test(String(e)) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : String(e))
    }
    setBusy(false)
    setSure(false)
  }
  return (
    <div id="os-fix">
      <h3 className="mt-h3">{t('Missing cost')}</h3>
      <p className="small t2">{t('Profit only counts an order when every item has a cost. A cost from the price list counts for orders placed after it was typed in; older orders get it as a suggestion, because prices change.')}</p>
      <div className="filters">
        <button className={`filter${!all ? ' on' : ''}`} onClick={() => { setAll(false); setMax(PAGE) }}>{t('Missing cost')} · {missing.length}</button>
        <button className={`filter${all ? ' on' : ''}`} onClick={() => { setAll(true); setMax(PAGE) }}>{t('All completed')} · {lines.length}</button>
      </div>
      {bulk.length > 0 && !all && (
        <div className="os-switch">
          <span className="small muted">{tn(bulk.length === 1 ? '%n order has a suggested cost' : '%n orders have a suggested cost', { n: bulk.length })}</span>
          <button className={`btn${sure ? ' btn-primary' : ''}`} disabled={busy} onClick={useAll}>{sure ? t('Tap again to save them all') : t('Use suggested costs')}</button>
        </div>
      )}
      {!shownList.length ? <p className="muted">{t('Every completed order in these days has a cost.')}</p> : (
        <div className="os-lines">
          {shownList.map((l) => <FixCard key={l.o.id} line={l} onSaved={onSaved} />)}
        </div>
      )}
      {(all ? lines : missing).length > max && <button className="btn" onClick={() => setMax((m) => m + PAGE)}>{t('Show more')}</button>}
    </div>
  )
}

function FixCard({ line, onSaved }: { line: OrderLine; onSaved: (e: CostEntry[]) => void }) {
  const { o, sale, lines } = line
  const lc = lines ?? []
  const start = () => o.items.map((_, i) => (lc[i]?.from === 'order' && lc[i].unit !== null ? String(lc[i].unit) : ''))
  const [vals, setVals] = useState<string[]>(start)
  const [busy, setBusy] = useState(false)
  const savedKey = lc.map((x) => `${x.from}:${x.unit}`).join('|')
  useEffect(() => { setVals(start()) }, [o.id, savedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // Each line's cost as it would be saved: typed, else what the price list says for the order's day.
  const unit = (i: number) => cleanNum(vals[i] ?? '') ?? (lc[i]?.from === 'list' ? lc[i].unit : null)
  const known = o.items.every((_, i) => unit(i) !== null)
  const cost = o.items.reduce((n, it, i) => n + (unit(i) ?? 0) * (it.qty || 1), 0)
  const dirty = vals.some((v, i) => v !== start()[i])
  async function save() {
    setBusy(true)
    const entry: CostEntry = { id: o.id, placedAt: o.placedAt, lines: o.items.map((it, i) => ({ n: it.name, c: cleanNum(vals[i] ?? '') })) }
    try {
      await orderCosts.save([entry])
      onSaved([entry])
      showToast(t('Saved'))
    } catch (e) {
      showToast(/permission/i.test(String(e)) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : String(e))
    }
    setBusy(false)
  }
  return (
    <div className="os-fix card">
      <div className="os-fix-head">
        <span><b dir="ltr">{orderNo(o)}</b> <span dir="auto">{o.customer || t('No name')}</span></span>
        <small className="muted">{new Date(o.placedAt).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Cairo' })} · {t(SOURCE_LABEL[o.source])}</small>
        <span className="num" dir="ltr">{money(sale)}</span>
      </div>
      {o.items.map((it, i) => (
        <div key={i} className="os-fix-line">
          <span dir="auto" className="os-fix-name">{it.qty > 1 ? `${it.qty} × ` : ''}{it.name || '—'} <small className="muted" dir="ltr">{money(it.total)}</small></span>
          <input inputMode="decimal" dir="ltr" value={vals[i] ?? ''} aria-label={it.qty > 1 ? t('Cost of one') : t('Cost')}
            placeholder={lc[i]?.from === 'list' ? String(lc[i].unit) : it.qty > 1 ? t('Cost of one') : t('Cost')}
            onChange={(e) => setVals((v) => v.map((x, j) => (j === i ? e.target.value : x)))} />
          {lc[i]?.unit === null && lc[i]?.suggest !== null && !vals[i] && (
            <button type="button" className="btn btn-small" onClick={() => setVals((v) => v.map((x, j) => (j === i ? String(lc[i].suggest) : x)))}>{tn('Use %m', { m: money(lc[i].suggest!) })}</button>
          )}
          {lc[i]?.from === 'list' && !vals[i] && <small className="muted">{t('From the price list')}</small>}
        </div>
      ))}
      <div className="os-fix-foot">
        <span className={`num ${known ? (sale - o.shipping - cost >= 0 ? 'good' : 'bad') : 'muted'}`} dir="ltr">
          {known ? `${t('Profit')}: ${money(sale - o.shipping - cost)}` : t('No cost')}
        </span>
        <button className="btn btn-primary btn-small" disabled={busy || !dirty} onClick={save}>{t('Save')}</button>
      </div>
    </div>
  )
}
