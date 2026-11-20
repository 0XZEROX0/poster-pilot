import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useCosts, useCostShown } from '../data/costs'
import { cairoNow } from '../data/logic'
import { monthsBetween, NO_LINKS, orderCosts, type CostEntry, type CostLinks, type CostLogs, type SavedCosts, type SavedLine } from '../data/orderCosts'
import { bestMatches, plainName } from '../data/nameMatch'
import { costKey } from '../data/costMath'
import { PERIOD_LABEL, PERIODS, periodDays, periodRange, statsOf, sumsBy, toKeep, webIndex, type CostCtx, type OrderLine, type Period, type Sums } from '../data/orderStats'
import { isManual, matchesOrder, orderNo, orders, SOURCE_LABEL, stepBy, type Order } from '../data/orders'
import { matches, usePrices, type PriceItem } from '../data/prices'
import { allowed } from '../data/store'
import { locale, t, tn } from '../i18n'
import { CostEye } from './PricesView'
import { Empty, SearchBox, showToast } from './ui'

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
        : list && (seeCost
          ? <WithCost list={list} days={days} onOpen={onOpen} onOrders={(changed) => setList((l) => l && l.map((x) => changed.find((c) => c.id === x.id) ?? x))} />
          : <Body list={list} ctx={null} onOpen={onOpen} />)}
    </div>
  )
}

/**
 * Reads the costs, the website links (to know what website lines cost) and the costs saved on orders, only for
 * roles that may see cost. Saved order costs are one document per month of the period.
 */
function WithCost({ list, days, onOpen, onOrders }: { list: Order[]; days: { from: string; to: string }; onOpen: (o: Order) => void; onOrders: (changed: Order[]) => void }) {
  const { costs, hist, loaded } = useCosts()
  const { cats } = usePrices()
  const web = useMemo(() => webIndex(cats), [cats])
  const [saved, setSaved] = useState<SavedCosts | null>(null)
  const [logs, setLogs] = useState<CostLogs>({})
  // Saved costs could not be read (rules not published): never write over them.
  const [savedOk, setSavedOk] = useState(false)
  const [links, setLinks] = useState<CostLinks | null>(null)
  useEffect(() => {
    let live = true
    setSaved(null)
    orderCosts.load(monthsBetween(days.from, days.to)).then((r) => { if (live) { setSaved(r.saved); setLogs(r.logs); setSavedOk(true) } }, () => { if (live) { setSaved({}); setSavedOk(false) } })
    return () => { live = false }
  }, [days.from, days.to])
  useEffect(() => { orderCosts.loadLinks().then(setLinks, () => setLinks(NO_LINKS)) }, [])
  const ctx = useMemo<CostCtx | null>(() => (loaded && saved && links ? { costs, hist, web, saved, links } : null), [loaded, saved, links, costs, hist, web])
  const onSaved = useCallback((entries: CostEntry[]) => {
    setSaved((s) => {
      const next = { ...(s ?? {}) }
      for (const e of entries) next[e.id] = e.lines
      return next
    })
    setLogs((l) => {
      const next = { ...l }
      for (const e of entries) if (e.note) next[e.id] = [...(next[e.id] ?? []), { at: Date.now(), byName: t('You'), note: e.note }]
      return next
    })
  }, [])
  // Every completed order keeps the price list cost it was sold with (one write per month, only when something is new),
  // so a later change of the price list cost, or removing the product, never changes its profit.
  const keeping = useRef(false)
  useEffect(() => {
    if (!ctx || !savedOk || keeping.current) return
    const todo = toKeep(statsOf(list, ctx).lines, ctx.saved)
    if (!todo.length) return
    keeping.current = true
    orderCosts.save(todo).then(() => { onSaved(todo); keeping.current = false }, () => { /* rules not published yet: try again on the next visit */ })
  }, [ctx, savedOk, list, onSaved])
  const products = useMemo<Product[]>(() => cats.flatMap((c) => c.items.map((it) => ({ key: costKey(c.id, it.id), cat: c.id, ref: it.id, name: it.name, catName: c.name, item: it }))), [cats])
  const byKey = useMemo(() => Object.fromEntries(products.map((p) => [p.key, p])), [products])

  /** An order's saved lines with some lines changed (product picked for that one line, or its name after a rename). */
  const entryOf = useCallback((o: Order, change: (j: number, was: SavedLine | undefined) => SavedLine | null, note: string): CostEntry => {
    const cur = ctx?.saved[o.id]
    return { id: o.id, placedAt: o.placedAt, note, lines: o.items.map((x, j) => {
      const was = cur?.[j]?.n === x.name ? cur[j] : undefined
      return change(j, was) ?? (was ? { ...was } : { n: x.name, c: null })
    }) }
  }, [ctx])

  /**
   * One line is the price list product p. For one line the choice is kept with the order's costs (and corrects any
   * other match); for every line of that website product, or with that name, it goes into orderCosts/links (also for
   * orders still to come). Lines of orders added in the app or from the old sheet are renamed to the product (with an
   * "edited" step) when the role may change order details; website orders keep the website's name (changing it would
   * change the website order). Every change is written to the order's cost history.
   */
  const pick = useCallback(async (target: OrderLine, i: number, p: Product | null, every: boolean) => {
    if (!ctx) return
    const it = target.o.items[i]
    const before = target.lines?.[i]?.key ? byKey[target.lines[i].key!]?.name ?? '?' : t('none')
    const kind: 'web' | 'names' = it.pid ? 'web' : 'names'
    const linkKey = it.pid ? `${it.pid}:${it.vid}` : plainName(it.name)
    const same = (x: Order['items'][number]) => (it.pid ? x.pid === it.pid && x.vid === it.vid : plainName(x.name) === plainName(it.name))
    const what = p ? `${t('Product')}: ${it.name}: ${before} → ${p.name}` : `${t('Product')}: ${it.name}: ${before} → ${t('none')}`
    if (every || (!p && target.lines?.[i]?.via === 'all')) {
      await orderCosts.link(kind, linkKey, p ? p.key : '')
      setLinks((l) => {
        const cur = l ?? NO_LINKS
        const m = { ...cur[kind] }
        if (p) m[linkKey] = p.key
        else delete m[linkKey]
        return { ...cur, [kind]: m }
      })
      const e = entryOf(target.o, (j, was) => (j === i && was?.k ? { n: was.n, c: was.c } : null), `${what} (${t('every order')})`)
      await orderCosts.save([e])
      onSaved([e])
    } else {
      const e = entryOf(target.o, (j, was) => (j === i ? (p ? { n: it.name, c: was?.c ?? null, k: p.key } : { n: it.name, c: was?.c ?? null }) : null), what)
      await orderCosts.save([e])
      onSaved([e])
    }
    if (!p || !allowed('orders.change')) return
    const targets = (every ? list : [target.o]).filter((o) => isManual(o) && o.items.some((x, j) => (every ? same(x) : j === i) && x.name !== p.name))
    const changed: Order[] = []
    for (const o of targets) {
      const hit = (x: Order['items'][number], j: number) => (every ? same(x) : j === i)
      // The order's saved costs follow the new name, so a typed cost is not lost.
      const cur = ctx.saved[o.id]
      if (cur) {
        const e: CostEntry = { id: o.id, placedAt: o.placedAt, lines: o.items.map((x, j) => {
          const was = cur[j]?.n === x.name ? cur[j] : undefined
          const n = hit(x, j) ? p.name : x.name
          return was?.k ? { n, c: was.c, k: was.k } : { n, c: was?.c ?? null }
        }) }
        await orderCosts.save([e])
        onSaved([e])
      }
      const items = o.items.map((x, j) => (hit(x, j) ? { ...x, name: p.name, cat: p.cat, ref: p.ref, pid: 0, vid: 0 } : x))
      const step = stepBy('edited', `${t('Product')}: ${it.name} → ${p.name}`)
      await orders.relink(o, items, step)
      changed.push({ ...o, items, steps: [...o.steps, step] })
    }
    if (changed.length) onOrders(changed)
  }, [ctx, list, onSaved, onOrders, byKey, entryOf])
  const kit = useMemo<Kit | null>(() => (ctx ? { products, byKey, pick, saved: ctx.saved, logs, onSaved, list } : null), [ctx, products, byKey, pick, onSaved, list, logs])
  return <Body list={list} ctx={ctx} onOpen={onOpen} costRole kit={kit} />
}

type Product = { key: string; cat: string; ref: string; name: string; catName: string; item: PriceItem }
type Kit = {
  products: Product[]
  byKey: Record<string, Product>
  /** p null: forget the product picked for the line. */
  pick: (target: OrderLine, i: number, p: Product | null, every: boolean) => Promise<void>
  saved: SavedCosts
  logs: CostLogs
  onSaved: (e: CostEntry[]) => void
  list: Order[]
}

function Body({ list, ctx, onOpen, costRole, kit }: { list: Order[]; ctx: CostCtx | null; onOpen: (o: Order) => void; costRole?: boolean; kit?: Kit | null }) {
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
        <div className="tile" style={{ '--tone': 'var(--accent)' } as CSSProperties}><span>{t('Average order')}</span><b dir="ltr">{money(s.all.average)}</b><small className="muted">{tn('Delivery not counted: %m', { m: money(s.all.delivery) })}</small></div>
        <div className="tile" style={{ '--tone': 'var(--warn)' } as CSSProperties}><span>{t('Still open')}</span><b dir="ltr">{money(s.all.openValue)}</b><small className="muted">{tn(s.all.open === 1 ? '%n order' : '%n orders', { n: s.all.open })} · {tn('%n cancelled', { n: s.all.cancelled })}</small></div>
      </div>

      <Split title="Where orders came from" rows={[['Website', s.website], ['Added in the app', s.manual], ['All', s.all]]} profit={profit} costRole={costRole} total />
      <Split title="By where the customer ordered" rows={sumsBy(list, ctx, (o) => SOURCE_LABEL[o.source])} profit={profit} costRole={costRole} />
      <Split title="By sales rep" rows={sumsBy(list, ctx, (o) => o.rep).map(([k, x]) => [k || 'No sales rep', x] as [string, Sums])} profit={profit} costRole={costRole} />
      <Split title="By category" rows={sumsBy(list, ctx, (o) => (o.category === 'ACC' ? 'Accessories' : o.category)).map(([k, x]) => [k || 'No category', x] as [string, Sums])} profit={profit} costRole={costRole} />

      {showProfit && kit && s.lines.length > 0 && <CostFix lines={s.lines} kit={kit} />}

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
function CostFix({ lines, kit }: { lines: OrderLine[]; kit: Kit }) {
  const { onSaved } = kit
  const [all, setAll] = useState(false)
  const [max, setMax] = useState(PAGE)
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [find, setFind] = useState('')
  const hit = (l: OrderLine) => !find.trim() || matchesOrder(l.o, find) || l.o.items.some((x) => plainName(x.name).includes(plainName(find)))
  const missing = lines.filter((l) => l.missing > 0 && hit(l))
  const pool = all ? lines.filter(hit) : missing
  const shownList = pool.slice(0, max)
  // Orders where a suggestion fills at least one missing line.
  const bulk = missing.filter((l) => l.lines?.some((c) => c.unit === null && c.suggest !== null))
  async function useAll() {
    if (!sure) { setSure(true); return }
    setBusy(true)
    const entries: CostEntry[] = bulk.map(({ o, lines: lc }) => ({ id: o.id, placedAt: o.placedAt, note: t('Suggested costs used'), lines: o.items.map((_, i) => withK(kit, o, i, lc![i].from === 'order' ? lc![i].unit : lc![i].unit === null ? lc![i].suggest : null)) }))
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
        <button className={`filter${all ? ' on' : ''}`} onClick={() => { setAll(true); setMax(PAGE) }}>{t('All completed')} · {lines.filter(hit).length}</button>
      </div>
      <SearchBox value={find} onChange={(v) => { setFind(v); setMax(PAGE) }} placeholder={t('Find an order: number, name, phone or item')} />
      {bulk.length > 0 && !all && (
        <div className="os-switch">
          <span className="small muted">{tn(bulk.length === 1 ? '%n order has a suggested cost' : '%n orders have a suggested cost', { n: bulk.length })}</span>
          <button className={`btn${sure ? ' btn-primary' : ''}`} disabled={busy} onClick={useAll}>{sure ? t('Tap again to save them all') : t('Use suggested costs')}</button>
        </div>
      )}
      {!shownList.length ? <p className="muted">{t('Every completed order in these days has a cost.')}</p> : (
        <div className="os-lines">
          {shownList.map((l) => <FixCard key={l.o.id} line={l} kit={kit} />)}
        </div>
      )}
      {pool.length > max && <button className="btn" onClick={() => setMax((m) => m + PAGE)}>{t('Show more')}</button>}
    </div>
  )
}

/**
 * A line as saved: its name, cost and the product picked for that one line (kept when the cost changes). With no
 * cost typed, a cost already kept from the price list stays kept.
 */
function withK(kit: Kit, o: Order, i: number, c: number | null): SavedLine {
  const was = kit.saved[o.id]?.[i]
  const same = was && was.n === o.items[i].name ? was : undefined
  if (c === null && same?.a) return { ...same }
  return same?.k ? { n: o.items[i].name, c, k: same.k } : { n: o.items[i].name, c }
}

function FixCard({ line, kit }: { line: OrderLine; kit: Kit }) {
  const { onSaved } = kit
  const { o, sale, lines } = line
  const [picking, setPicking] = useState<number | null>(null)
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
    const show = (n: number | null) => (n === null ? t('none') : money(n))
    const note = o.items.map((it, i) => {
      const from = lc[i]?.unit ?? null
      const to = unit(i)
      return from === to ? '' : `${t('Cost')}: ${it.name}: ${show(from)} → ${show(to)}`
    }).filter(Boolean).join(' · ')
    const entry: CostEntry = { id: o.id, placedAt: o.placedAt, note: note || t('Costs saved'), lines: o.items.map((_, i) => withK(kit, o, i, cleanNum(vals[i] ?? ''))) }
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
          {lc[i]?.from === 'list' && !vals[i] && <small className="muted">{lc[i].kept ? t('Kept with the order') : t('From the price list')}</small>}
          <div className="os-fix-link">
            {lc[i]?.key && kit.byKey[lc[i].key!]
              ? <small className="muted" dir="auto">= {kit.byKey[lc[i].key!].name} · <button type="button" className="linkish" onClick={() => setPicking(picking === i ? null : i)}>{t('Change')}</button></small>
              : <button type="button" className="btn btn-small" onClick={() => setPicking(picking === i ? null : i)}>{t('Pick the product')}</button>}
          </div>
          {picking === i && <ProductPick line={line} i={i} kit={kit} onDone={() => setPicking(null)} />}
        </div>
      ))}
      {(kit.logs[o.id]?.length ?? 0) > 0 && (
        <details className="os-fix-log">
          <summary className="small muted">{tn('Cost history · %n', { n: kit.logs[o.id].length })}</summary>
          {kit.logs[o.id].slice().reverse().map((l, j) => (
            <small key={j} className="muted" dir="auto">{new Date(l.at).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' })} · {l.byName}: {l.note}</small>
          ))}
        </details>
      )}
      <div className="os-fix-foot">
        <span className={`num ${known ? (sale - cost >= 0 ? 'good' : 'bad') : 'muted'}`} dir="ltr">
          {known ? `${t('Profit')}: ${money(sale - cost)}` : t('No cost')}
        </span>
        <button className="btn btn-primary btn-small" disabled={busy || !dirty} onClick={save}>{t('Save')}</button>
      </div>
    </div>
  )
}

/**
 * Picks the price list product an order line is: the names most like the line's first, or search. "Every item
 * like this" links all lines of the same website product (or with the same name), in other orders too.
 */
function ProductPick({ line, i, kit, onDone }: { line: OrderLine; i: number; kit: Kit; onDone: () => void }) {
  const it = line.o.items[i]
  const [q, setQ] = useState('')
  const via = line.lines?.[i]?.via
  // A line linked by the order itself or a confirmed website link can only be corrected for this one sale (the
  // website link is fixed in Prices); a line picked for this sale alone starts with "this sale only".
  const canEvery = via !== 'own'
  const [every, setEvery] = useState(canEvery && via !== 'line')
  const [busy, setBusy] = useState(false)
  const likely = useMemo(() => bestMatches(it.name, kit.products, 4), [it.name, kit.products])
  const found = useMemo(() => (q.trim() ? kit.products.filter((p) => matches(p.item, q)).slice(0, 8) : []), [q, kit.products])
  const same = kit.list.filter((o) => o.items.some((x) => (it.pid ? x.pid === it.pid && x.vid === it.vid : plainName(x.name) === plainName(it.name)))).length
  async function choose(p: Product | null) {
    setBusy(true)
    try {
      await kit.pick(line, i, p, canEvery && every)
      showToast(t('Saved'))
      onDone()
    } catch (e) {
      showToast(/permission/i.test(String(e)) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : String(e))
    }
    setBusy(false)
  }
  const row = (p: Product, score?: number) => (
    <button key={p.key} type="button" className="os-pick-row" disabled={busy} onClick={() => choose(p)}>
      <span dir="auto">{p.name}</span>
      <small className="muted">{p.catName}{score !== undefined ? ` · ${Math.round(score * 100)}%` : ''}</small>
    </button>
  )
  return (
    <div className="os-pick">
      {likely.length > 0 && !q.trim() && <><small className="muted">{t('Looks like')}</small>{likely.map((m) => row(m.item, m.score))}</>}
      <SearchBox value={q} onChange={setQ} placeholder={t('Search the price list')} />
      {found.map((p) => row(p))}
      {q.trim() && !found.length && <small className="muted">{t('Nothing found')}</small>}
      {canEvery ? (
        <label className="os-pick-all">
          <input type="checkbox" checked={every} onChange={(e) => setEvery(e.target.checked)} />
          <span>{it.pid ? t('Every order of this website product') : t('Every item with this name')}{same > 1 ? ` · ${tn('%n orders in these days', { n: same })}` : ''}</span>
        </label>
      ) : <small className="muted">{t('This changes the product for this sale only.')}</small>}
      {(via === 'line' || via === 'all') && (
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => choose(null)}>
          {via === 'all' ? t('Remove this match from every order') : t('Remove the match')}
        </button>
      )}
      <small className="muted">{isManual(line.o) ? (allowed('orders.change') ? t('The item is renamed to the product in the order.') : t('Your role cannot change orders, so the name stays; the cost still uses the product.')) : t('Website orders keep the website\'s name; the cost uses the product.')}</small>
    </div>
  )
}
