import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { builderOpen, chosen, complete, DRAFT_KEY, edits, emptyLine, fresh, grants, live, shape, type Grant, LIVE_IDLE_MS, misfit, newBuild, pick, quoteLabel, quotes, type LiveBuild, SHOP, slotOf, SLOTS, START_SLOTS, totals, type Build, type Line, type SavedQuote } from '../data/builder'
import { casePsu, matches, money, parseMoney, specChips, usePrices, type PriceCategory, type PriceItem } from '../data/prices'
import { buildCost, costKey, profitOf, profitText, useCosts, useCostShown } from '../data/costs'
import { allowed, isOwner, myId, myName } from '../data/store'
import { CostEye } from './PricesView'
import { locale, t, tn } from '../i18n'
import { Sheet } from './Sheet'
import { Chip, Empty, Icon, SearchBox, showToast } from './ui'

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
/** The parts, grouped as a customer thinks of a PC. */
const PART_GROUPS = [
  { title: 'Main parts', slots: ['mb', 'cpu', 'ram', 'gpu', 'ssd'] },
  { title: 'Case, power and cooling', slots: ['case', 'psu', 'cooler', 'fans', 'paste'] },
  { title: 'Screen and accessories', slots: ['monitor', 'keyboard', 'mouse', 'pad', 'speaker', 'headset'] },
  { title: 'Extras', slots: ['extra'] },
]
const CORE = ['mb', 'cpu', 'ram', 'ssd', 'case', 'psu']
const SHORT: Record<string, string> = { mb: 'MB', cpu: 'CPU', ram: 'RAM', gpu: 'GPU', ssd: 'SSD', case: 'CASE', psu: 'PSU', cooler: 'COOL', fans: 'FAN', paste: 'PASTE', monitor: 'MON', keyboard: 'KB', mouse: 'MOUSE', pad: 'PAD', speaker: 'SPK', headset: 'HS', extra: '+' }

export function BuilderView() {
  const { loaded, cats, error } = usePrices()
  const [build, setBuild] = useState<Build>(loadDraft)
  const [picking, setPicking] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  const [watching, setWatching] = useState(false)
  const lastShared = useRef('')
  // An extra discount someone gave on this quote from Live quotes. It counts until the quote is saved or cleared.
  const [grant, setGrant] = useState<Grant | null>(null)
  const lastGrant = useRef(0)
  useEffect(() => grants.watch(myId(), (g) => {
    if (g && g.amount !== lastGrant.current) showToast(tn('%name gave an extra discount of %amount', { name: g.byName || t('Someone'), amount: money(g.amount) }))
    lastGrant.current = g?.amount ?? 0
    setGrant(g)
  }), [])

  // Editing someone else's open quote (from Live quotes): the builder shows their quote, and each change goes to their screen.
  const [editing, setEditing] = useState<{ uid: string; name: string } | null>(null)
  const editingRef = useRef(editing)
  useEffect(() => { editingRef.current = editing }, [editing])
  const mine = useRef<Build | null>(null)
  const [theirGrant, setTheirGrant] = useState(0)
  const sent = useRef<string[]>([])
  // How the editor's changes are getting to the other person: '' nothing sent yet, then sending, waiting (their builder has not taken it in), done, or an error.
  const [sync, setSync] = useState<'' | 'sending' | 'saved' | 'waiting' | 'done' | 'late' | 'denied' | 'offline'>('')
  // Their app has not been used for a while, so it takes the change in the next time it is opened.
  const idle = useRef(false)
  useEffect(() => {
    if (!editing) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = edits.watchWaiting(editing.uid, (waiting) => {
      clearTimeout(timer)
      if (waiting && idle.current) return setSync((s) => (s === '' ? s : 'saved'))
      setSync((s) => (waiting ? (s === '' ? s : 'waiting') : s === 'waiting' || s === 'late' || s === 'sending' || s === 'saved' ? 'done' : s))
      // Their builder normally takes a change in within a second or two.
      if (waiting) timer = setTimeout(() => setSync((s) => (s === 'waiting' ? 'late' : s)), 8000)
    })
    return () => { clearTimeout(timer); stop() }
  }, [editing])
  const seen = useRef('')
  const given = editing ? theirGrant : grant?.amount ?? 0

  // Changes someone made to this person's quote come in here.
  useEffect(() => {
    builderOpen.current = true
    return () => { builderOpen.current = false }
  }, [])
  useEffect(() => edits.watchMine((e) => {
    void edits.clearMine()
    const apply = (b: Build): Build => ({ ...b, customer: e.customer, lines: complete(e.lines), extra: e.extra, buildDiscount: e.buildDiscount })
    if (editingRef.current) mine.current = mine.current && apply(mine.current)
    else setBuild(apply)
    showToast(tn('%name changed your quote', { name: e.byName || t('Someone') }))
  }), [])

  // While editing, the other person's own changes come in too.
  useEffect(() => {
    if (!editing) return
    return live.watchOne(editing.uid, (d) => {
      if (!d) return
      setTheirGrant(d.grant)
      const s = shape(d, d.lines)
      if (s === seen.current || sent.current.includes(s)) return
      seen.current = s
      setBuild((b) => ({ ...b, customer: d.customer, lines: complete(d.lines), extra: d.extra, buildDiscount: d.buildDiscount }))
    })
  }, [editing])

  useEffect(() => {
    if (editing) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(build))
    } catch {
      // No storage: the build lasts while the page is open.
    }
  }, [build, editing])

  // Lines always show today's names and prices from the price list.
  const lines = useMemo(() => build.lines.map((l) => fresh(cats, slotOf(l.slot).single && l.qty !== 1 ? { ...l, qty: 1 } : l)), [build.lines, cats])
  const parts = useMemo(() => chosen(cats, lines), [cats, lines])
  const sum = totals(lines, build.extra + given, build.buildDiscount)
  // What the build costs the shop: only for roles with 'See and edit cost', and only after the eye is pressed.
  // It stays on this screen: it is never part of the shared live quote, a saved quote or the printed quotation.
  const seeCost = allowed('cost')
  // Whether the printed quotation shows each part's price. Off: only the parts, the discount and the total.
  const [printPrices, setPrintPricesState] = useState(() => { try { return localStorage.getItem(PRINT_PRICES_KEY) !== 'off' } catch { return true } })
  const setPrintPrices = (on: boolean) => { setPrintPricesState(on); try { localStorage.setItem(PRINT_PRICES_KEY, on ? 'on' : 'off') } catch { /* lasts while the page is open */ } }
  const { costs: costMap } = useCosts()
  const costOn = useCostShown() && seeCost
  const bc = buildCost(lines, costMap)

  // Share the build a moment after each change, so it can be watched live (one write per pause).
  const shared = JSON.stringify([build.customer, build.sales, build.extra, given, build.buildDiscount, lines.filter((l) => l.name).map((l) => [l.slot, l.name, l.qty, l.alone, l.in, l.warranty])])
  const now = shape(build, lines)
  useEffect(() => {
    if (!loaded) return
    if (editing) {
      if (now === seen.current || sent.current.includes(now)) return
      const id = setTimeout(() => {
        sent.current = [...sent.current.slice(-9), now]
        setSync('sending')
        edits.send(editing.uid, { ...build, lines }, sum.total, editing.name).then(() => setSync((s) => (s === 'sending' ? (idle.current ? 'saved' : 'waiting') : s)), (e) => {
          sent.current = sent.current.filter((s) => s !== now)
          setSync((e as { code?: string }).code === 'permission-denied' ? 'denied' : 'offline')
        })
      }, 800)
      return () => clearTimeout(id)
    }
    if (shared === lastShared.current) return
    const id = setTimeout(() => {
      lastShared.current = shared
      live.publish({ ...build, lines }, sum.total, given).catch(() => { lastShared.current = '' })
    }, 1500)
    return () => clearTimeout(id)
  }, [shared, now, editing, loaded, build, lines, sum.total, given])
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
    void grants.clearMine()
  }
  const save = async () => {
    if (!filled.length) return showToast(t('Pick at least one product first.'))
    setBusy(true)
    try {
      // A discount given from Live quotes becomes part of the saved quote's extra discount.
      const id = await quotes.save({ ...build, extra: build.extra + given, lines }, sum.total)
      patch(given ? { id, extra: build.extra + given } : { id })
      if (given) {
        lastGrant.current = 0
        void grants.clearMine()
      }
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
  const startEditing = (one: LiveBuild) => {
    mine.current = build
    seen.current = shape(one, one.lines)
    sent.current = []
    idle.current = Date.now() - one.at > LIVE_IDLE_MS
    setBuild({ customer: one.customer, sales: one.sales, lines: complete(one.lines), extra: one.extra, buildDiscount: one.buildDiscount })
    setTheirGrant(one.grant)
    setEditing({ uid: one.uid, name: one.byName || one.sales || t('Someone') })
    setWatching(false)
    setSure(false)
  }
  const stopEditing = () => {
    if (editing && now !== seen.current && !sent.current.includes(now)) {
      const name = editing.name
      edits.send(editing.uid, { ...build, lines }, sum.total, editing.name).then(
        () => showToast(tn("Saved in %name's quote", { name })),
        (e) => showToast((e as { code?: string }).code === 'permission-denied' ? t('Your last change was not sent: the database refused it.') : t('Your last change was not sent. Check the connection.')),
      )
    }
    setSync('')
    setBuild(mine.current ?? loadDraft())
    mine.current = null
    setEditing(null)
    setTheirGrant(0)
  }
  const misfits = lines.filter((l) => { const p = parts.find((x) => x.line === l.id); return p && misfit(p.cat, p.item, parts.filter((x) => x.line !== l.id)) }).length
  // A case that comes with a power supply: the PSU row says so and counts as done.
  const boxPsu = casePsu(parts.find((p) => p.cat === 'case')?.item)
  const coreDone = CORE.filter((k) => lines.some((l) => l.slot === k && l.name) || (k === 'psu' && boxPsu)).length
  /** Picking a case that comes with a power supply takes a picked PSU off the quote. */
  const choose = (line: Line, cat: string, item: PriceItem) => {
    const drop = cat === 'case' && casePsu(item) && build.lines.some((l) => l.slot === 'psu' && l.name)
    setBuild((b) => {
      let next = b.lines.map((l) => (l.id === line.id ? pick(l, cat, item) : l))
      if (drop) {
        const firstPsu = next.find((l) => l.slot === 'psu')
        next = next.filter((l) => l.slot !== 'psu' || l === firstPsu).map((l) => (l === firstPsu ? emptyLine('psu') : l))
      }
      return { ...b, lines: next }
    })
    if (drop) showToast(t('Took the PSU off: this case comes with its own.'))
  }
  const pickingLine = lines.find((l) => l.id === picking)
  const unused = SLOTS.filter((s) => !build.lines.some((l) => l.slot === s.key))

  return (
    <div className="view builder">
      <div className="bx">
        <div className="bx-main">
          <section className="bx-head">
            <div className="builder-who">
              <label><span>{t('Customer')}</span><input dir="auto" value={build.customer} placeholder={t('Customer name (optional)')} onChange={(e) => patch({ customer: e.target.value })} /></label>
              <label><span>{t('Sales man')}</span><input dir="auto" value={build.sales} disabled={!!editing} onChange={(e) => patch({ sales: e.target.value })} /></label>
            </div>
            {editing ? (
              <div className="bx-links">
                <p className="edit-banner"><span className="live-dot" aria-hidden="true" />{tn("You're editing %name's quote. They see each change.", { name: editing.name })}</p>
                {sync && <p className={`edit-sync edit-sync-${sync}`}>{{
                  sending: t('Sending…'),
                  saved: tn("Saved in %name's quote. Their app takes it in the next time they open it.", { name: editing.name }),
                  waiting: t('Saved. Waiting for their builder…'),
                  done: tn('%name has your changes.', { name: editing.name }),
                  late: tn("Saved in %name's quote. Their app has not taken it in yet: it will when they open it (an old version may need closing and reopening).", { name: editing.name }),
                  denied: t('The database refused your change. Make sure the latest rules are published in Firebase and that your role has Edit live quotes.'),
                  offline: t('Your change could not be sent. Check the connection.'),
                }[sync]}</p>}
                <button className="btn btn-primary" onClick={stopEditing}>{t('Done editing')}</button>
                {seeCost && <CostEye />}
              </div>
            ) : (
              <div className="bx-links">
                {seeCost && <CostEye compact />}
                {(allowed('quotes.all') || allowed('quotes.discount') || allowed('quotes.edit')) && <button className="chip-btn" onClick={() => setWatching(true)}><span className="live-dot" aria-hidden="true" />{t('Live quotes')}</button>}
                <button className="chip-btn" onClick={() => setSaved(true)}><Icon name="clock" size={16} />{t('Saved quotes')}</button>
                {sure ? (
                  <span className="clear-confirm">
                    <button className="btn btn-danger" onClick={start}><Icon name="trash" size={18} />{t('Yes, clear it')}</button>
                    <button className="btn btn-ghost" onClick={() => setSure(false)}>{t('Cancel')}</button>
                  </span>
                ) : (
                  <button className="chip-btn" disabled={!filled.length && !build.customer && !build.extra && !build.id} onClick={() => setSure(true)}><Icon name="trash" size={16} />{t('Clear')}</button>
                )}
              </div>
            )}
          </section>

          {PART_GROUPS.map((g) => {
            const rows = lines.filter((l) => g.slots.includes(slotOf(l.slot).key))
            if (!rows.length) return null
            const done = rows.filter((l) => l.name || (l.slot === 'psu' && boxPsu)).length
            return (
              <section key={g.title} className="bx-group">
                <h3 className="bx-group-title"><span>{t(g.title)}</span><span className="muted small">{tn('%a of %b chosen', { a: done, b: rows.length })}</span></h3>
                {rows.map((line) => {
                  const slot = slotOf(line.slot)
                  const live = parts.find((p) => p.line === line.id)
                  const others = parts.filter((p) => p.line !== line.id)
                  const bad = live ? misfit(live.cat, live.item, others) : ''
                  const gone = line.name && line.pid && !live
                  const specs = live ? [live.item.company, ...specChips(live.item)].filter(Boolean) : []
                  if (!line.name && slot.key === 'psu' && boxPsu) {
                    return (
                      <div key={line.id} className="bx-part bx-included">
                        <button className="bx-pick" onClick={() => setPicking(line.id)} title={t('Pick a separate PSU')}>
                          <span className="bx-tile on">{SHORT[slot.key] ?? '•'}</span>
                          <span className="bx-what">
                            <span className="bx-label">{t(slot.label)}</span>
                            <span className="bx-name">{boxPsu === 'Yes' ? t('Comes with the case') : tn('Comes with the case (%w)', { w: boxPsu })}</span>
                            <span className="bx-specs"><span className="spec">{t('Nothing to add')}</span></span>
                          </span>
                        </button>
                        <span className="bx-side-of-part"><Icon name="check" size={18} /></span>
                      </div>
                    )
                  }
                  if (!line.name) {
                    return (
                      <div key={line.id} className="bx-part bx-empty">
                        <button className="bx-pick" onClick={() => setPicking(line.id)}>
                          <span className="bx-tile">{SHORT[slot.key] ?? '+'}</span>
                          <span className="bx-what"><span className="bx-label">{t(slot.label)}</span><span className="bx-choose"><Icon name="plus" size={16} />{tn('Choose %s', { s: t(slot.label) })}</span></span>
                        </button>
                        {!keeps(line) && <button className="icon-btn" title={t('Remove')} aria-label={t('Remove')} onClick={() => removeLine(line)}><Icon name="close" size={16} /></button>}
                      </div>
                    )
                  }
                  const unit = line.alone ?? line.in ?? 0
                  const lastOfKind = !slot.single && rows.filter((l) => l.slot === line.slot).at(-1)?.id === line.id
                  return (
                    <Fragment key={line.id}>
                    <div className={`bx-part${bad ? ' bx-bad' : ''}`}>
                      <button className="bx-pick" onClick={() => setPicking(line.id)} title={t('Change')}>
                        <span className="bx-tile on">{SHORT[slot.key] ?? '•'}</span>
                        <span className="bx-what">
                          <span className="bx-label">{t(slot.label)}</span>
                          <span className="bx-name" dir="auto">{line.name}</span>
                          <span className="bx-specs">
                            {specs.map((x) => <span key={x} className="spec">{x}</span>)}
                            {line.warranty ? <span className="spec">{tn('%n y warranty', { n: line.warranty })}</span> : null}
                            {bad && <Chip tone="bad">{bad}</Chip>}
                            {gone && <Chip tone="warn">{t('No longer in the price list')}</Chip>}
                            {live?.item.out && <Chip tone="warn">{t('Out of stock')}</Chip>}
                          </span>
                        </span>
                      </button>
                      <div className="bx-side-of-part">
                        <b className="bx-price">{money(unit * line.qty)}</b>
                        {costOn && line.cat && line.pid && <span className="bx-cost-line">{t('Cost')} {money(costMap[costKey(line.cat, line.pid)] === undefined ? null : costMap[costKey(line.cat, line.pid)] * line.qty)}</span>}
                        {!slot.single && (
                          <span className="bl-qty">
                            <button className="icon-btn" aria-label={t('Less')} disabled={line.qty <= 1} onClick={() => setLine(line.id, (l) => ({ ...l, qty: Math.max(1, l.qty - 1) }))}><Icon name="minus" size={14} /></button>
                            <b>{line.qty}</b>
                            <button className="icon-btn" aria-label={t('More')} onClick={() => setLine(line.id, (l) => ({ ...l, qty: Math.min(99, l.qty + 1) }))}><Icon name="plus" size={14} /></button>
                          </span>
                        )}
                        {line.qty > 1 && <span className="muted small">{money(unit)} × {line.qty}</span>}
                        <span className="bx-acts">
                          <button className="icon-btn" title={keeps(line) ? t('Empty this row') : t('Remove')} aria-label={keeps(line) ? t('Empty this row') : t('Remove')} onClick={() => removeLine(line)}><Icon name="close" size={16} /></button>
                        </span>
                      </div>
                    </div>
                    {lastOfKind && <button className="bx-more" onClick={() => addAfter(line)}><Icon name="plus" size={14} />{tn('Another %s', { s: t(slot.label) })}</button>}
                    </Fragment>
                  )
                })}
              </section>
            )
          })}
          {unused.length > 0 && (
            <select className="sort-pick add-row" value="" onChange={(e) => e.target.value && addSlot(e.target.value)} aria-label={t('Add a row')}>
              <option value="">{t('+ Add a part')}</option>
              {unused.map((s) => <option key={s.key} value={s.key}>{t(s.label)}</option>)}
            </select>
          )}
        </div>

        <aside className="bx-sum">
          <div className={`bx-fit${misfits ? ' bad' : filled.length ? ' good' : ''}`}>
            <Icon name={misfits ? 'fix' : 'check'} size={18} />
            <span>{misfits ? tn('%n parts do not fit together', { n: misfits }) : filled.length ? t('All parts fit together') : t('Pick parts to start the quote')}</span>
          </div>
          <div className="bx-progress"><span style={{ width: `${Math.round((coreDone / CORE.length) * 100)}%` }} /></div>
          <p className="muted small">{tn('Needed for a working PC: %a of %b · %n items in total', { a: coreDone, b: CORE.length, n: filled.reduce((n, l) => n + l.qty, 0) })}</p>
          <div className="bl-sum">
            <div><span>{t('Price')}</span><b>{money(sum.subtotal)}</b></div>
            <label className="bx-switch"><input type="checkbox" checked={build.buildDiscount} onChange={(e) => patch({ buildDiscount: e.target.checked })} /><i aria-hidden="true" /><span>{t('Build discount')}</span><b>−{money(sum.saved)}</b></label>
            <label className="bl-extra"><span>{t('Extra discount')}</span><input inputMode="numeric" value={build.extra ? String(build.extra) : ''} placeholder="0" onChange={(e) => { const v = parseMoney(e.target.value); if (v !== undefined) patch({ extra: v ?? 0 }) }} /></label>
            {given > 0 && <div className="bl-grant"><span>{!editing && grant ? tn('Extra discount from %name', { name: grant.byName || t('Someone') }) : t('Extra discount given')}</span><b>−{money(given)}</b></div>}
            <div className="bl-grand"><span>{t('TOTAL')}</span><b>{money(sum.total)} <small>EGP</small></b></div>
            {sum.discount > 0 && <p className="bx-saved">{tn('The customer saves %n', { n: money(sum.discount) })}</p>}
            {seeCost && filled.length > 0 && (
              <div className={`bx-cost${costOn ? ' on' : ''}`}>
                <div className="bx-cost-head"><span>{t('Cost and profit')}</span><CostEye compact /></div>
                {costOn && (
                  <>
                    <div><span>{t('Cost')}</span><b>{money(bc.cost)}</b></div>
                    <div><span>{t('Profit')}</span><b className={sum.total - bc.cost < 0 ? 'bad' : 'good'}>{profitText(profitOf(sum.total, bc.cost))}</b></div>
                    {bc.missing > 0 && <p className="hint">{tn('%n parts have no cost yet, so the profit is higher than it really is.', { n: bc.missing })}</p>}
                  </>
                )}
              </div>
            )}
            <label className="bx-switch bx-print-prices"><input type="checkbox" checked={printPrices} onChange={(e) => setPrintPrices(e.target.checked)} /><i aria-hidden="true" /><span>{t('Prices on the printed quotation')}</span><b>{printPrices ? t('On') : t('Off')}</b></label>
            <div className="actions">
              <button className="btn btn-primary" onClick={print}><Icon name="print" size={18} />{t('Print quotation')}</button>
              {!editing && <button className="btn" disabled={busy} onClick={save}>{build.id ? t('Save changes') : t('Save quote')}</button>}
            </div>
          </div>
        </aside>
      </div>

      <div className="bx-bar">
        <span><small>{t('TOTAL')}</small><b>{money(sum.total)}</b>{costOn && filled.length > 0 && <small className="bx-bar-cost">{t('Cost')} {money(bc.cost)} · {t('Profit')} {profitText(profitOf(sum.total, bc.cost))}</small>}</span>
        {seeCost && <CostEye compact />}
        <button className="btn btn-primary" onClick={print}><Icon name="print" size={18} />{t('Print')}</button>
      </div>

      {pickingLine && <PickSheet cats={cats} line={pickingLine} others={parts.filter((p) => p.line !== pickingLine.id)} onPick={(cat, item) => { choose(pickingLine, cat, item); setPicking(null) }} onClear={() => { setLine(pickingLine.id, (l) => emptyLine(l.slot)); setPicking(null) }} onClose={() => setPicking(null)} />}
      {watching && <LiveSheet onCopy={(b) => { setBuild({ customer: b.customer, sales: build.sales, lines: complete(b.lines), extra: b.extra + b.grant, buildDiscount: b.buildDiscount }); setWatching(false); setSure(false); void grants.clearMine() }} onEdit={startEditing} onClose={() => setWatching(false)} />}
      {saved && <SavedSheet onOpen={(q) => { setBuild({ ...q, id: q.by === myId() || q.by === 'demo-you' || isOwner() ? q.id : undefined, lines: complete(q.lines) }); setSaved(false); setSure(false); void grants.clearMine() }} onClose={() => setSaved(false)} />}
      {createPortal(<QuotePrint build={build} lines={filled} sum={sum} prices={printPrices} />, document.body)}
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
                    {specChips(item).map((s) => <Chip key={s} tone="info">{s}</Chip>)}
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
  const [person, setPerson] = useState('')
  const everyone = allowed('quotes.all')
  const mine = (q: SavedQuote) => q.by === myId() || q.by === 'demo-you'
  useEffect(() => {
    quotes.list(max, everyone).then(setList, () => setList([]))
  }, [max, everyone])
  const remove = async (q: SavedQuote) => {
    try {
      await quotes.remove(q.id, quoteLabel(q.customer, q.total))
      setList((l) => (l ?? []).filter((x) => x.id !== q.id))
      showToast(t('Deleted'))
    } catch {
      showToast(t('Your role does not allow this.'))
    }
  }
  const words = search.trim().toLowerCase()
  // The people who made the quotes in the list, for the filter.
  const people = [...new Map((list ?? []).map((q) => [q.by, q.byName || q.sales || q.by])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const shown = (list ?? []).filter((q) => (!person || q.by === person) && (!words || [q.customer, q.sales, q.byName, ...q.lines.map((l) => l.name)].join(' ').toLowerCase().includes(words)))
  return (
    <Sheet title={t('Saved quotes')} onClose={onClose}>
      <div className="pick-tools">
        <SearchBox value={search} onChange={setSearch} placeholder={t('Search customer, sales man, product…')} />
        {everyone && people.length > 1 && (
          <select className="sort-pick" value={person} onChange={(e) => setPerson(e.target.value)} aria-label={t('Made by')}>
            <option value="">{t('Everyone')}</option>
            {people.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}
          </select>
        )}
      </div>
      {list === null ? <p className="muted">{t('Loading…')}</p> : shown.length === 0 ? <Empty icon="builder" text={t('No saved quotes yet.')} /> : (
        <ul className="changes">
          {shown.map((q) => (
            <li key={q.id} className="saved-quote">
              <button className="saved-open" onClick={() => onOpen(q)}>
                <span className="row-title" dir="auto">{q.customer || t('No customer name')}</span>
                {everyone && <span className="saved-by">{tn('Made by %s', { s: mine(q) ? t('you') : q.byName || q.sales || t('Someone') })}</span>}
                <span className="muted">{q.sales || q.byName} · {new Date(q.at).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {tn('%n parts', { n: q.lines.length })}</span>
              </button>
              <b className="saved-total">{money(q.total)}</b>
              {(mine(q) || isOwner()) && <button className="icon-btn" aria-label={t('Delete')} onClick={() => remove(q)}><Icon name="trash" size={16} /></button>}
            </li>
          ))}
        </ul>
      )}
      {list && list.length === max && <button className="btn" onClick={() => setMax(max + 30)}>{t('Show more')}</button>}
    </Sheet>
  )
}

/** The quote each person is building right now, updating as they work. */
function LiveSheet({ onCopy, onEdit, onClose }: { onCopy: (b: LiveBuild) => void; onEdit: (b: LiveBuild) => void; onClose: () => void }) {
  const [list, setList] = useState<LiveBuild[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState('')
  useEffect(() => live.watch(setList, setError), [])
  // A minute tick, so "2 min ago" and idle marks stay right.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const others = (list ?? []).filter((b) => b.uid !== myId())
  const ago = (at: number) => {
    const m = Math.max(0, Math.round((now - at) / 60_000))
    return m < 1 ? t('just now') : m < 60 ? tn('%n min ago', { n: m }) : new Date(at).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  }
  const one = others.find((b) => b.uid === open)
  if (one) {
    const sum = totals(one.lines, one.extra + one.grant, one.buildDiscount)
    return (
      <Sheet title={one.byName || one.sales || t('Someone')} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={() => setOpen('')}>{t('Back')}</button><button className="btn" onClick={() => onCopy(one)}>{t('Copy into my builder')}</button>{allowed('quotes.edit') && <button className="btn btn-primary" onClick={() => onEdit(one)}>{t('Edit this quote')}</button>}</>}>
        <p className="live-head"><span className={now - one.at < LIVE_IDLE_MS ? 'live-dot' : 'live-dot idle'} aria-hidden="true" />{t('Updated')} {ago(one.at)}{one.customer ? ` · ${one.customer}` : ''}</p>
        {one.lines.length === 0 ? <Empty icon="builder" text={t('Nothing picked yet.')} /> : (
          <ul className="changes live-lines">
            {one.lines.map((l, i) => (
              <li key={i}>
                <div className="row-sub"><b>{t(slotOf(l.slot).label)}</b>{l.qty > 1 && <Chip>×{l.qty}</Chip>}</div>
                <div className="live-line"><span dir="auto">{l.name}</span><b>{money((l.alone ?? l.in ?? 0) * l.qty)}</b></div>
              </li>
            ))}
          </ul>
        )}
        <div className="bl-sum live-sum">
          <div><span>{t('Price')}</span><b>{money(sum.subtotal)}</b></div>
          <div><span>{t('Discount')}</span><b>{money(sum.discount)}</b></div>
          <div className="bl-grand"><span>{t('TOTAL')}</span><b>{money(sum.total)}</b></div>
        </div>
        <GiveDiscount uid={one.uid} whose={one.byName || one.sales} />
      </Sheet>
    )
  }
  return (
    <Sheet title={t('Live quotes')} onClose={onClose}>
      {error ? <p className="banner banner-bad" dir="ltr">{error}</p> : list === null ? <p className="muted">{t('Loading…')}</p> : others.length === 0 ? <Empty icon="builder" text={t('Nobody else is building a quote right now.')} /> : (
        <ul className="changes">
          {others.map((b) => (
            <li key={b.uid} className="saved-quote">
              <button className="saved-open" onClick={() => setOpen(b.uid)}>
                <span className="row-title"><span className={now - b.at < LIVE_IDLE_MS ? 'live-dot' : 'live-dot idle'} aria-hidden="true" />{b.byName || b.sales || t('Someone')}</span>
                <span className="muted">{b.customer ? `${b.customer} · ` : ''}{tn('%n parts', { n: b.lines.length })} · {ago(b.at)}</span>
              </button>
              <b className="saved-total">{money(b.total)}</b>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

/** Shows the extra discount given on someone's open quote, and lets people with 'Give extra discount' set it. */
function GiveDiscount({ uid, whose }: { uid: string; whose: string }) {
  const [grant, setGrant] = useState<Grant | null | undefined>(undefined)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => grants.watch(uid, (g) => {
    setGrant(g)
    setValue(g ? String(g.amount) : '')
  }), [uid])
  const can = allowed('quotes.discount')
  if (grant === undefined || (!can && !grant)) return null
  const give = async (amount: number) => {
    setBusy(true)
    try {
      await grants.give(uid, amount, whose)
      showToast(amount > 0 ? t('Discount sent. It shows in their quote now.') : t('Discount removed.'))
    } catch (e) {
      showToast((e as { code?: string }).code === 'permission-denied' ? t('Your role does not allow this.') : t('Could not save. Check the connection.'))
    } finally {
      setBusy(false)
    }
  }
  const amount = parseMoney(value) ?? 0
  return (
    <div className="give-discount">
      {grant && <p className="muted">{tn('Extra discount from %name', { name: grant.byName || t('Someone') })}: <b>{money(grant.amount)}</b> ({t('already in the total')})</p>}
      {can && (
        <div className="give-row">
          <label className="bl-extra"><span>{t('Extra discount from you')}</span><input inputMode="numeric" value={value} placeholder="0" onChange={(e) => setValue(e.target.value)} /></label>
          <button className="btn btn-primary" disabled={busy || amount === (grant?.amount ?? 0)} onClick={() => give(amount)}>{grant ? t('Change discount') : t('Give discount')}</button>
          {grant && <button className="btn btn-ghost" disabled={busy} onClick={() => give(0)}>{t('Remove')}</button>}
        </div>
      )}
    </div>
  )
}

/** The paper the customer gets, laid out like the sheet's quotation. Only shown when printing. */
const PRINT_PRICES_KEY = 'posterpilot.builder.printPrices'

function QuotePrint({ build, lines, sum, prices }: { build: Build; lines: Line[]; sum: ReturnType<typeof totals>; prices: boolean }) {
  const logo = `${import.meta.env.BASE_URL}static-logo.png`
  // Without prices: its own four-column layout (type, product, quantity, warranty), no money anywhere on the paper.
  const cols = prices ? 6 : 4
  return (
    <div className={`quote-print${prices ? '' : ' q-plain'}`} dir="ltr" lang="en">
      <table>
        {prices
          ? <colgroup><col className="q-type" /><col /><col className="q-n" /><col className="q-n" /><col className="q-n" /><col className="q-n2" /></colgroup>
          : <colgroup><col className="q-type" /><col /><col className="q-qty" /><col className="q-war" /></colgroup>}
        <tbody>
          <tr className="q-top">
            <td><img src={logo} alt="Static" /></td>
            <td colSpan={prices ? 3 : 1} className="q-title">
              {build.sales.trim() && <div>Sales Man: {build.sales.trim()}</div>}
              <div>Quotation</div>
              {build.customer.trim() && <div className="q-customer" dir="auto">{build.customer.trim()}</div>}
            </td>
            <td className="q-c"><b>Date</b></td>
            <td className="q-c"><b>{today()}</b></td>
          </tr>
          <tr className="q-head">
            <th>Type</th><th>Product</th><th>QTY</th><th>Warranty</th>{prices && <><th>Price</th><th>Total Price</th></>}
          </tr>
          {lines.map((l) => (
            <tr key={l.id}>
              <td className="q-c"><b>{slotOf(l.slot).label}</b></td>
              <td className="q-c" dir="auto">{l.name}</td>
              <td className="q-c">{l.qty}</td>
              <td className="q-c">{prices ? l.warranty ?? '' : l.warranty ? `${l.warranty} ${l.warranty === 1 ? 'Year' : 'Years'}` : ''}</td>
              {prices && <td className="q-c">{money(l.alone ?? l.in)}</td>}
              {prices && <td className="q-c">{money((l.alone ?? l.in ?? 0) * l.qty)}</td>}
            </tr>
          ))}
          {prices && <tr className="q-sum"><th colSpan={5}>Discount</th><td className="q-c">{money(sum.discount)}</td></tr>}
          {prices && <tr className="q-sum"><th colSpan={5}>TOTAL</th><td className="q-c">{money(sum.total)}</td></tr>}
          <tr className="q-info"><td className="q-c"><b>Location</b></td><td colSpan={cols - 1} className="q-c" dir="rtl" lang="ar"><b>{SHOP.location}</b></td></tr>
          <tr className="q-info"><td className="q-c"><b>Website</b></td><td colSpan={cols - 1} className="q-c"><b className="q-link">{SHOP.website}</b></td></tr>
          <tr className="q-info"><td className="q-c"><b>Phone</b></td><td colSpan={cols - 1} className="q-c"><b>{SHOP.phone}</b></td></tr>
          <tr><td colSpan={cols} className="q-c q-foot" dir="rtl" lang="ar"><b>{SHOP.footer}</b></td></tr>
        </tbody>
      </table>
    </div>
  )
}
