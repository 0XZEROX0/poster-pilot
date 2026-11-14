import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { chosen, complete, emptyLine, fresh, misfit, newBuild, pick, quotes, SHOP, slotOf, SLOTS, START_SLOTS, totals, type Build, type Line, type SavedQuote } from '../data/builder'
import { matches, money, parseMoney, usePrices, type PriceCategory, type PriceItem } from '../data/prices'
import { myName } from '../data/store'
import { locale, t, tn } from '../i18n'
import { Sheet } from './Sheet'
import { Chip, Empty, Icon, SearchBox, showToast } from './ui'

const DRAFT_KEY = 'posterpilot.builder.draft'
const loadDraft = (): Build => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) {
      const b = JSON.parse(raw) as Build
      return { ...b, lines: complete(b.lines ?? []) }
    }
  } catch {
    // A broken or missing draft: start a new one.
  }
  return newBuild(myName())
}

/** The date as the sheet writes it: 11/14/2026. */
const today = () => new Date().toLocaleDateString('en-US')

/** Build a PC from the price list, see if the parts fit, and print the quotation for the customer. */
export function BuilderView() {
  const { loaded, cats, error } = usePrices()
  const [build, setBuild] = useState<Build>(loadDraft)
  const [picking, setPicking] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(build))
    } catch {
      // No storage: the build lasts while the page is open.
    }
  }, [build])

  // Lines always show today's names and prices from the price list.
  const lines = useMemo(() => build.lines.map((l) => fresh(cats, l)), [build.lines, cats])
  const parts = useMemo(() => chosen(cats, lines), [cats, lines])
  const sum = totals(lines, build.extra, build.buildDiscount)
  const filled = lines.filter((l) => l.name)

  if (!loaded) return <div className="splash">{t('Loading…')}</div>
  if (error) return <p className="banner banner-bad" dir="ltr">{error}</p>
  if (!cats.length) return <div className="view"><Empty icon="builder" text={t('The price list has not been moved into the app yet.')} /></div>

  const patch = (p: Partial<Build>) => setBuild((b) => ({ ...b, ...p }))
  const setLine = (id: string, fn: (l: Line) => Line) => setBuild((b) => ({ ...b, lines: b.lines.map((l) => (l.id === id ? fn(l) : l)) }))
  /** Another row of the same kind right under this one, for example a second SSD. */
  const addAfter = (line: Line) => setBuild((b) => {
    const i = b.lines.findIndex((l) => l.id === line.id)
    return { ...b, lines: [...b.lines.slice(0, i + 1), emptyLine(line.slot), ...b.lines.slice(i + 1)] }
  })
  /** A row of any kind, placed with the others of its kind. */
  const addSlot = (slot: string) => setBuild((b) => {
    const order = SLOTS.findIndex((s) => s.key === slot)
    let at = b.lines.length
    for (let i = b.lines.length - 1; i >= 0; i--) if (SLOTS.findIndex((s) => s.key === b.lines[i].slot) <= order) { at = i + 1; break }
    if (at === b.lines.length && !b.lines.some((l) => SLOTS.findIndex((s) => s.key === l.slot) <= order)) at = 0
    return { ...b, lines: [...b.lines.slice(0, at), emptyLine(slot), ...b.lines.slice(at)] }
  })
  /** The last row of a kind a build starts with always stays: removing it only empties it. */
  const keeps = (line: Line) => START_SLOTS.includes(line.slot) && build.lines.filter((l) => l.slot === line.slot).length <= 1
  const removeLine = (line: Line) => setBuild((b) => {
    const last = START_SLOTS.includes(line.slot) && b.lines.filter((l) => l.slot === line.slot).length <= 1
    return last ? { ...b, lines: b.lines.map((l) => (l.id === line.id ? emptyLine(l.slot) : l)) } : { ...b, lines: b.lines.filter((l) => l.id !== line.id) }
  })
  const start = () => {
    setBuild(newBuild(myName() || build.sales))
    setSure(false)
  }
  const save = async () => {
    if (!filled.length) return showToast(t('Pick at least one product first.'))
    setBusy(true)
    try {
      const id = await quotes.save({ ...build, lines }, sum.total)
      patch({ id })
      showToast(t('Saved'))
    } catch (e) {
      showToast((e as { code?: string }).code === 'permission-denied' ? t('Your role does not allow this.') : t('Could not save. Check the connection.'))
    } finally {
      setBusy(false)
    }
  }
  const print = () => {
    if (!filled.length) return showToast(t('Pick at least one product first.'))
    const title = document.title
    document.title = ['Quotation', build.customer.trim(), today().replace(/\//g, '-')].filter(Boolean).join(' ')
    window.print()
    document.title = title
  }
  const pickingLine = lines.find((l) => l.id === picking)
  const unused = SLOTS.filter((s) => !build.lines.some((l) => l.slot === s.key))

  return (
    <div className="view builder">
      <div className="review-bar tools">
        <div className="builder-who">
          <label><span>{t('Customer')}</span><input dir="auto" value={build.customer} placeholder={t('Optional')} onChange={(e) => patch({ customer: e.target.value })} /></label>
          <label><span>{t('Sales man')}</span><input dir="auto" value={build.sales} onChange={(e) => patch({ sales: e.target.value })} /></label>
        </div>
        <button className="link" onClick={() => setSaved(true)}><Icon name="clock" size={16} />{t('Saved quotes')}</button>
        {sure ? <button className="btn btn-danger" onClick={start}>{t('Clear this build')}</button> : <button className="btn btn-ghost" onClick={() => (filled.length ? setSure(true) : start())}><Icon name="plus" size={18} />{t('New')}</button>}
      </div>

      <div className="bl">
        <div className="bl-row bl-head" aria-hidden="true">
          <span>{t('Type')}</span><span>{t('Product')}</span><span className="num">{t('QTY')}</span><span className="num">{t('Warranty')}</span><span className="num">{t('Price')}</span><span className="num">{t('Total')}</span><span />
        </div>
        {lines.map((line) => {
          const slot = slotOf(line.slot)
          const live = parts.find((p) => p.line === line.id)
          const others = parts.filter((p) => p.line !== line.id)
          const bad = live ? misfit(live.cat, live.item, others) : ''
          const gone = line.name && line.pid && !live
          return (
            <div key={line.id} className={`bl-row${line.name ? '' : ' bl-empty'}${bad ? ' bl-bad' : ''}`}>
              <span className="bl-type">{t(slot.label)}</span>
              <button className="bl-product" onClick={() => setPicking(line.id)}>
                {line.name ? <span className="row-title" dir="auto">{line.name}</span> : <span className="muted">{t('Choose…')}</span>}
                {(bad || gone || live?.item.out) && (
                  <span className="bl-notes">
                    {bad && <Chip tone="bad">{bad}</Chip>}
                    {gone && <Chip tone="warn">{t('No longer in the price list')}</Chip>}
                    {live?.item.out && <Chip tone="warn">{t('Out of stock')}</Chip>}
                  </span>
                )}
              </button>
              <span className="bl-qty">
                <button className="icon-btn" aria-label={t('Less')} disabled={line.qty <= 1} onClick={() => setLine(line.id, (l) => ({ ...l, qty: Math.max(1, l.qty - 1) }))}><Icon name="minus" size={16} /></button>
                <b>{line.qty}</b>
                <button className="icon-btn" aria-label={t('More')} onClick={() => setLine(line.id, (l) => ({ ...l, qty: Math.min(99, l.qty + 1) }))}><Icon name="plus" size={16} /></button>
              </span>
              <span className="num bl-war">{line.name && line.warranty ? tn('%n y', { n: line.warranty }) : ''}</span>
              <span className="num bl-price">{line.name ? money(line.alone ?? line.in) : ''}</span>
              <span className="num bl-total">{line.name ? money((line.alone ?? line.in ?? 0) * line.qty) : ''}</span>
              <span className="bl-acts">
                <button className="icon-btn" title={tn('Another %s', { s: t(slot.label) })} aria-label={tn('Another %s', { s: t(slot.label) })} onClick={() => addAfter(line)}><Icon name="plus" size={16} /></button>
                {keeps(line) ? (
                  <button className="icon-btn" title={t('Empty this row')} aria-label={t('Empty this row')} disabled={!line.name} onClick={() => removeLine(line)}><Icon name="close" size={16} /></button>
                ) : (
                  <button className="icon-btn" title={t('Remove')} aria-label={t('Remove')} onClick={() => removeLine(line)}><Icon name="close" size={16} /></button>
                )}
              </span>
            </div>
          )
        })}
      </div>
      {unused.length > 0 && (
        <select className="sort-pick add-row" value="" onChange={(e) => e.target.value && addSlot(e.target.value)} aria-label={t('Add a row')}>
          <option value="">{t('+ Add a row')}</option>
          {SLOTS.map((s) => <option key={s.key} value={s.key}>{t(s.label)}</option>)}
        </select>
      )}

      <div className="bl-sum">
        <div><span>{t('Price')}</span><b>{money(sum.subtotal)}</b></div>
        <label className="check"><input type="checkbox" checked={build.buildDiscount} onChange={(e) => patch({ buildDiscount: e.target.checked })} /> {t('Build discount')} <b>{money(sum.saved)}</b></label>
        <label className="bl-extra"><span>{t('Extra discount')}</span><input inputMode="numeric" value={build.extra ? String(build.extra) : ''} placeholder="0" onChange={(e) => { const v = parseMoney(e.target.value); if (v !== undefined) patch({ extra: v ?? 0 }) }} /></label>
        <div><span>{t('Discount')}</span><b>{money(sum.discount)}</b></div>
        <div className="bl-grand"><span>{t('TOTAL')}</span><b>{money(sum.total)}</b></div>
        <div className="actions">
          <button className="btn" disabled={busy} onClick={save}>{build.id ? t('Save changes') : t('Save quote')}</button>
          <button className="btn btn-primary" onClick={print}><Icon name="print" size={18} />{t('Print quotation')}</button>
        </div>
      </div>

      {pickingLine && <PickSheet cats={cats} line={pickingLine} others={parts.filter((p) => p.line !== pickingLine.id)} onPick={(cat, item) => { setLine(pickingLine.id, (l) => pick(l, cat, item)); setPicking(null) }} onClear={() => { setLine(pickingLine.id, (l) => emptyLine(l.slot)); setPicking(null) }} onClose={() => setPicking(null)} />}
      {saved && <SavedSheet onOpen={(q) => { setBuild({ ...q, lines: complete(q.lines) }); setSaved(false); setSure(false) }} onClose={() => setSaved(false)} />}
      {createPortal(<QuotePrint build={build} lines={filled} sum={sum} />, document.body)}
    </div>
  )
}

/** Pick a product for one row: the ones that fit come first, then the ones in stock. */
function PickSheet({ cats, line, others, onPick, onClear, onClose }: { cats: PriceCategory[]; line: Line; others: { cat: string; item: PriceItem }[]; onPick: (cat: string, item: PriceItem) => void; onClear: () => void; onClose: () => void }) {
  const slot = slotOf(line.slot)
  const pool = slot.cats.length ? cats.filter((c) => slot.cats.includes(c.id)) : cats
  const [cat, setCat] = useState(pool.length === 1 ? pool[0].id : '')
  const [search, setSearch] = useState('')
  const list = (() => {
    const out: { cat: PriceCategory; item: PriceItem; bad: string; n: number }[] = []
    for (const c of pool) {
      if (cat && c.id !== cat) continue
      c.items.forEach((item, n) => {
        if (item.hidden || !item.name || !matches(item, search)) return
        out.push({ cat: c, item, bad: misfit(c.id, item, others), n })
      })
    }
    return out.sort((a, b) => Number(Boolean(a.bad)) - Number(Boolean(b.bad)) || Number(Boolean(a.item.out)) - Number(Boolean(b.item.out)) || a.n - b.n)
  })()
  return (
    <Sheet title={t(slot.label)} onClose={onClose} footer={line.name ? <button className="btn btn-ghost" onClick={onClear}><Icon name="trash" size={18} />{t('Empty this row')}</button> : undefined}>
      <div className="pick-tools">
        <SearchBox value={search} onChange={setSearch} placeholder={t('Search name, company, socket…')} />
        {pool.length > 1 && (
          <select className="sort-pick" value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('Category')}>
            <option value="">{t('All')}</option>
            {pool.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      {list.length === 0 ? <Empty icon="search" text={t('Nothing matches.')} /> : (
        <ul className="pick-list">
          {list.slice(0, 300).map(({ cat: c, item, bad }) => (
            <li key={`${c.id}/${item.id}`}>
              <button className={`pick-item${item.id === line.pid ? ' on' : ''}${bad ? ' pick-bad' : ''}`} onClick={() => onPick(c.id, item)}>
                <span className="pick-main">
                  <span className="row-title" dir="auto">{item.name}</span>
                  <span className="pick-tags">
                    {!cat && pool.length > 1 && <Chip>{c.name}</Chip>}
                    {item.company && <span className="muted" dir="auto">{item.company}</span>}
                    {Object.values(item.specs ?? {}).filter(Boolean).map((s) => <Chip key={s} tone="info">{s}</Chip>)}
                    {item.out && <Chip tone="warn">{t('Out of stock')}</Chip>}
                    {bad && <Chip tone="bad">{bad}</Chip>}
                  </span>
                </span>
                <span className="pick-price">
                  <b>{money(item.alone ?? item.in)}</b>
                  {item.in !== null && item.in !== item.alone && <small className="muted">{t('In build')} {money(item.in)}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

/** Quotes saved earlier, newest first. Opening one puts it in the builder with today's prices. */
function SavedSheet({ onOpen, onClose }: { onOpen: (q: SavedQuote) => void; onClose: () => void }) {
  const [list, setList] = useState<SavedQuote[] | null>(null)
  const [max, setMax] = useState(30)
  const [search, setSearch] = useState('')
  useEffect(() => {
    quotes.list(max).then(setList, () => setList([]))
  }, [max])
  const remove = async (q: SavedQuote) => {
    try {
      await quotes.remove(q.id)
      setList((l) => (l ?? []).filter((x) => x.id !== q.id))
      showToast(t('Deleted'))
    } catch {
      showToast(t('Your role does not allow this.'))
    }
  }
  const words = search.trim().toLowerCase()
  const shown = (list ?? []).filter((q) => !words || [q.customer, q.sales, q.byName, ...q.lines.map((l) => l.name)].join(' ').toLowerCase().includes(words))
  return (
    <Sheet title={t('Saved quotes')} onClose={onClose}>
      <SearchBox value={search} onChange={setSearch} placeholder={t('Search customer, sales man, product…')} />
      {list === null ? <p className="muted">{t('Loading…')}</p> : shown.length === 0 ? <Empty icon="builder" text={t('No saved quotes yet.')} /> : (
        <ul className="changes">
          {shown.map((q) => (
            <li key={q.id} className="saved-quote">
              <button className="saved-open" onClick={() => onOpen(q)}>
                <span className="row-title" dir="auto">{q.customer || t('No customer name')}</span>
                <span className="muted">{q.sales || q.byName} · {new Date(q.at).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {tn('%n parts', { n: q.lines.length })}</span>
              </button>
              <b className="saved-total">{money(q.total)}</b>
              <button className="icon-btn" aria-label={t('Delete')} onClick={() => remove(q)}><Icon name="trash" size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {list && list.length === max && <button className="btn" onClick={() => setMax(max + 30)}>{t('Show more')}</button>}
    </Sheet>
  )
}

/** The paper the customer gets, laid out like the sheet's quotation. Only shown when printing. */
function QuotePrint({ build, lines, sum }: { build: Build; lines: Line[]; sum: ReturnType<typeof totals> }) {
  const logo = `${import.meta.env.BASE_URL}static-logo.png`
  return (
    <div className="quote-print" dir="ltr" lang="en">
      <table>
        <colgroup><col className="q-type" /><col /><col className="q-n" /><col className="q-n" /><col className="q-n" /><col className="q-n2" /></colgroup>
        <tbody>
          <tr className="q-top">
            <td><img src={logo} alt="Static" /></td>
            <td colSpan={3} className="q-title">
              {build.sales.trim() && <div>Sales Man: {build.sales.trim()}</div>}
              <div>Quotation</div>
              {build.customer.trim() && <div className="q-customer" dir="auto">{build.customer.trim()}</div>}
            </td>
            <td className="q-c"><b>Date</b></td>
            <td className="q-c"><b>{today()}</b></td>
          </tr>
          <tr className="q-head">
            <th>Type</th><th>Product</th><th>QTY</th><th>Warranty</th><th>Price</th><th>Total Price</th>
          </tr>
          {lines.map((l) => (
            <tr key={l.id}>
              <td className="q-c"><b>{slotOf(l.slot).label}</b></td>
              <td className="q-c" dir="auto">{l.name}</td>
              <td className="q-c">{l.qty}</td>
              <td className="q-c">{l.warranty ?? ''}</td>
              <td className="q-c">{money(l.alone ?? l.in)}</td>
              <td className="q-c">{money((l.alone ?? l.in ?? 0) * l.qty)}</td>
            </tr>
          ))}
          <tr className="q-sum"><th colSpan={5}>Discount</th><td className="q-c">{money(sum.discount)}</td></tr>
          <tr className="q-sum"><th colSpan={5}>TOTAL</th><td className="q-c">{money(sum.total)}</td></tr>
          <tr><td className="q-c"><b>Location</b></td><td colSpan={5} className="q-c" dir="rtl" lang="ar"><b>{SHOP.location}</b></td></tr>
          <tr><td className="q-c"><b>Website</b></td><td colSpan={5} className="q-c"><b className="q-link">{SHOP.website}</b></td></tr>
          <tr><td className="q-c"><b>Phone</b></td><td colSpan={5} className="q-c"><b>{SHOP.phone}</b></td></tr>
          <tr><td colSpan={6} className="q-c q-foot" dir="rtl" lang="ar"><b>{SHOP.footer}</b></td></tr>
        </tbody>
      </table>
    </div>
  )
}
