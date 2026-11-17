import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useCosts, useCostShown, type CostMap } from '../data/costs'
import { cairoNow } from '../data/logic'
import { PERIOD_LABEL, PERIODS, periodDays, periodRange, statsOf, webIndex, type Period, type Sums } from '../data/orderStats'
import { orderNo, orders, SOURCE_LABEL, type Order } from '../data/orders'
import { usePrices } from '../data/prices'
import { allowed } from '../data/store'
import { locale, t, tn } from '../i18n'
import { CostEye } from './PricesView'
import { Empty } from './ui'

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
        : list && (seeCost ? <WithCost list={list} onOpen={onOpen} /> : <Body list={list} costs={null} web={{}} onOpen={onOpen} />)}
    </div>
  )
}

/** Reads the costs and the website links (to know what website lines cost) only for roles that may see cost. */
function WithCost({ list, onOpen }: { list: Order[]; onOpen: (o: Order) => void }) {
  const { costs, loaded } = useCosts()
  const { cats } = usePrices()
  const web = useMemo(() => webIndex(cats), [cats])
  return <Body list={list} costs={loaded ? costs : null} web={web} onOpen={onOpen} costRole />
}

function Body({ list, costs, web, onOpen, costRole }: { list: Order[]; costs: CostMap | null; web: Record<string, string>; onOpen: (o: Order) => void; costRole?: boolean }) {
  const shown = useCostShown()
  const s = useMemo(() => statsOf(list, costs, web), [list, costs, web])
  const showProfit = Boolean(costRole && shown && costs)
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
            {s.all.uncosted > 0 && <small className="muted">{tn(s.all.uncosted === 1 ? '%n order left out: an item has no cost' : '%n orders left out: an item has no cost', { n: s.all.uncosted })}</small>}
          </div>
        )}
        <div className="tile" style={{ '--tone': 'var(--accent)' } as CSSProperties}><span>{t('Average order')}</span><b dir="ltr">{money(s.all.average)}</b><small className="muted">{tn('Delivery: %m', { m: money(s.all.delivery) })}</small></div>
        <div className="tile" style={{ '--tone': 'var(--warn)' } as CSSProperties}><span>{t('Still open')}</span><b dir="ltr">{money(s.all.openValue)}</b><small className="muted">{tn(s.all.open === 1 ? '%n order' : '%n orders', { n: s.all.open })} · {tn('%n cancelled', { n: s.all.cancelled })}</small></div>
      </div>

      <table className="or-items-table os-table">
        <thead><tr><th /><th className="num">{t('Orders')}</th><th className="num">{t('Completed')}</th><th className="num">{t('Sales')}</th>{costRole && <th className="num">{t('Profit')}</th>}</tr></thead>
        <tbody>
          {([['Website', s.website], ['Added in the app', s.manual], ['All', s.all]] as [string, Sums][]).map(([label, x]) => (
            <tr key={label} className={label === 'All' ? 'sum' : ''}>
              <td>{t(label)}</td><td className="num">{x.orders}</td><td className="num">{x.completed}</td><td className="num" dir="ltr">{money(x.sales)}</td>{costRole && <td className="num" dir="ltr">{profit(x)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

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
