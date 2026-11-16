import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { bulkPatches, casePsu, fieldLabel, loadWebProducts, matches, money, newProductId, parseMoney, prices, SPEC_FIELDS, SPEC_LABEL, specChips, sameName as sameNameLoose, usePrices, webNameDiff, webNeedsOption, webPending, type ItemPatch, type PriceCategory, type PriceChange, type PriceItem, type WebOption, type WebProduct } from '../data/prices'
import { costKey, costs, lowestPrice, profitOf, profitText, setCostShown, useCosts, useCostShown, type CostMap } from '../data/costs'
import { allowed } from '../data/store'
import { locale, t, tn } from '../i18n'
import { Sheet } from './Sheet'
import { Chip, Empty, Icon, SearchBox, showToast } from './ui'

/** How many rows are drawn before "Show all": a long list of number fields is slow on a phone. */
const PAGE = 120

const fail = (e: unknown) => showToast((e as { code?: string }).code === 'permission-denied' ? t('Your role does not allow this.') : t('Could not save. Check the connection.'))

const VIEW_KEY = 'posterpilot.prices.view'
type ViewMode = 'list' | 'grid'
const savedView = (): ViewMode => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

/** Price before / Price after (the website prices) show only to roles with 'See website prices'. The owner always sees them. */
const seeWeb = () => allowed('prices.web')
const WEB_FIELDS = ['online', 'onlineSale']

/** The price list: find a product, change a price where it is shown, and see who changed what. */
export function PricesView() {
  const { loaded, cats, error } = usePrices()
  const canEdit = allowed('prices.edit')
  // What each product costs: only for roles with 'See and edit cost' (the database refuses everyone else), and
  // only on screen after the eye is pressed.
  const { costs: costMap } = useCosts()
  const canCost = allowed('cost')
  const showCost = useCostShown() && canCost
  const [cat, setCat] = useState('')
  const [search, setSearch] = useState('')
  const [hidden, setHidden] = useState(false)
  const [stock, setStock] = useState<'' | 'in' | 'out'>('')
  const [webF, setWebF] = useState<'' | 'check' | 'names' | 'linked' | 'none'>('')
  const [view, setView] = useState<ViewMode>(savedView)
  // "Show all" counts for the list it was pressed on; another category or search starts short again.
  const [allFor, setAllFor] = useState<string | null>(null)
  const all = allFor === `${cat}|${search}`
  const [open, setOpen] = useState<{ cat: string; item: PriceItem | null } | null>(null)
  const [changes, setChanges] = useState(false)
  const [bulk, setBulk] = useState(false)
  const current = cats.find((c) => c.id === cat)
  const rows = useMemo(() => {
    const out: { cat: PriceCategory; item: PriceItem }[] = []
    for (const c of current ? [current] : cats) for (const item of c.items) if ((hidden || !item.hidden) && (!stock || (stock === 'out') === Boolean(item.out)) && webOk(item, webF) && matches(item, search)) out.push({ cat: c, item })
    return out
  }, [cats, current, search, hidden, stock, webF])
  const toCheck = useMemo(() => cats.reduce((n, c) => n + c.items.filter((i) => i.web && (!i.web.ok || webNeedsOption(i))).length, 0), [cats])
  const nameDiffs = useMemo(() => cats.reduce((n, c) => n + c.items.filter((i) => i.web?.ok && webNameDiff(i)).length, 0), [cats])

  if (!loaded) return <div className="splash">{t('Loading…')}</div>
  if (error) return <p className="banner banner-bad" dir="ltr">{error}</p>
  if (!cats.length) return <div className="view"><Empty icon="prices" text={t('The price list has not been moved into the app yet.')} /></div>

  const pickView = (next: ViewMode) => {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // No storage: the choice lasts for this visit.
    }
  }
  const shown = all ? rows : rows.slice(0, PAGE)
  // A heading where the category (on "All") or the group (AIR, Liquid…) changes.
  const heads = shown.map(({ cat: c, item }, i) => {
    const prev = shown[i - 1]
    const catHead = !current && prev?.cat.id !== c.id ? c.name : ''
    const groupHead = item.group && (catHead || item.group !== prev?.item.group) ? item.group : ''
    return { catHead, groupHead }
  })
  const hiddenCount = (current ? [current] : cats).reduce((n, c) => n + c.items.filter((i) => i.hidden).length, 0)
  const total = cats.reduce((n, c) => n + c.items.length, 0)
  return (
    <div className="view prices">
      <div className="prices-layout">
        <nav className="cat-rail" aria-label={t('Category')} onWheel={(e) => {
          // A mouse wheel moves the row of categories sideways when they do not fit.
          const el = e.currentTarget
          if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY
        }}>
          <button className={cat === '' ? 'cat on' : 'cat'} aria-pressed={cat === ''} onClick={() => setCat('')}><span>{t('All')}</span><i>{total}</i></button>
          {cats.map((c) => (
            <button key={c.id} className={cat === c.id ? 'cat on' : 'cat'} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}><span>{c.name}</span><i>{c.items.length}</i></button>
          ))}
        </nav>
        <div className="prices-main">
          <div className="review-bar tools">
            <SearchBox value={search} onChange={setSearch} placeholder={t('Search name, company, socket…')} />
            <select className="sort-pick" value={stock} aria-label={t('Stock')} onChange={(e) => setStock(e.target.value as typeof stock)}>
              <option value="">{t('All stock')}</option>
              <option value="in">{t('In stock')}</option>
              <option value="out">{t('Out of stock')}</option>
            </select>
            <select className="sort-pick" value={webF} aria-label={t('Website')} onChange={(e) => setWebF(e.target.value as typeof webF)}>
              <option value="">{t('Website: all')}</option>
              <option value="check">{t('Website link to check')}{toCheck ? ` (${toCheck})` : ''}</option>
              <option value="names">{t('Name differs on the website')}{nameDiffs ? ` (${nameDiffs})` : ''}</option>
              <option value="linked">{t('On the website')}</option>
              <option value="none">{t('Not on the website')}</option>
            </select>
            <div className="seg" role="group" aria-label={t('View')}>
              <button className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} title={t('List')} onClick={() => pickView('list')}><Icon name="rows" size={18} /></button>
              <button className={view === 'grid' ? 'on' : ''} aria-pressed={view === 'grid'} title={t('Cards')} onClick={() => pickView('grid')}><Icon name="cards" size={18} /></button>
            </div>
            {canCost && <CostEye />}
            <button className="link" onClick={() => setChanges(true)}><Icon name="clock" size={16} />{t('Changes')}</button>
            {canEdit && current && <button className="link" onClick={() => setBulk(true)}><Icon name="edit" size={16} />{t('Change all by %')}</button>}
            {canEdit && <button className="btn btn-primary" onClick={() => setOpen({ cat: current?.id ?? cats[0].id, item: null })}><Icon name="plus" size={18} />{t('Product')}</button>}
          </div>
          {hiddenCount > 0 && (
            <label className="check-line"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> {t('Show hidden products')} ({hiddenCount})</label>
          )}
          {rows.length === 0 ? <Empty icon="search" text={t('Nothing matches.')} /> : view === 'list' ? (
            <div className={`ptable${showCost ? ' with-cost' : ''}${seeWeb() ? '' : ' no-web'}`} role="table">
              <div className="ptable-row ptable-head" role="row">
                <span role="columnheader">{t('Product')}</span>
                <span role="columnheader" className="ptable-specs">{t('Specs')}</span>
                <span role="columnheader" className="ptable-stock">{t('Stock')}</span>
                <span role="columnheader" className="ptable-num">{t('In build')}</span>
                <span role="columnheader" className="ptable-num">{t('Alone')}</span>
                {seeWeb() && (
                  <span className="ptable-web ptable-web-head" title={t('Website prices')}>
                    <span role="columnheader" className="ptable-num">{t('Price before')}</span>
                    <span role="columnheader" className="ptable-num">{t('Price after')}</span>
                  </span>
                )}
                {showCost && <span role="columnheader" className="ptable-num ptable-cost">{t('Cost')}</span>}
              </div>
              {shown.map(({ cat: c, item }, i) => (
                <ListRow key={`${c.id}/${item.id}`} cat={c} item={item} canEdit={canEdit} cost={showCost ? costMap : null} {...heads[i]} onOpen={() => setOpen({ cat: c.id, item })} />
              ))}
            </div>
          ) : (
            <div className="pgrid">
              {shown.map(({ cat: c, item }, i) => (
                <PriceCard key={`${c.id}/${item.id}`} cat={c} item={item} canEdit={canEdit} cost={showCost ? costMap : null} {...heads[i]} onOpen={() => setOpen({ cat: c.id, item })} />
              ))}
            </div>
          )}
          {!all && rows.length > PAGE && <button className="btn" onClick={() => setAllFor(`${cat}|${search}`)}>{t('Show all')} ({rows.length})</button>}
        </div>
      </div>
      {open && <ProductSheet cats={cats} cat={open.cat} item={open.item} canEdit={canEdit} canCost={canCost} costMap={canCost ? costMap : null} onClose={() => setOpen(null)} />}
      {changes && <ChangesSheet cats={cats} withCost={canCost} onClose={() => setChanges(false)} />}
      {bulk && current && <BulkSheet cat={current} onClose={() => setBulk(false)} />}
    </div>
  )
}

/** cost: the costs when they are on screen, else null. */
type RowProps = { cat: PriceCategory; item: PriceItem; canEdit: boolean; cost: CostMap | null; catHead: string; groupHead: string; onOpen: () => void }

/** The eye that shows or hides what products cost, on the Prices page and in the Builder. Hidden each time the app opens. */
export function CostEye({ compact }: { compact?: boolean }) {
  const on = useCostShown()
  const label = on ? t('Hide cost') : t('Show cost')
  return (
    <button className={`cost-eye${on ? ' on' : ''}`} aria-pressed={on} title={label} aria-label={label} onClick={() => setCostShown(!on)}>
      <Icon name={on ? 'eye' : 'eyeOff'} size={18} />{!compact && <span>{t('Cost')}</span>}
    </button>
  )
}

/** Profit on the product's lowest price, and which price that is: "500 (6.4%) · In build". */
function ProfitLine({ item, cost }: { item: { in?: number | null; alone?: number | null; online?: number | null; onlineSale?: number | null }; cost: number | null }) {
  const low = lowestPrice(item, seeWeb())
  const p = profitOf(low?.price, cost)
  if (!low || !p) return <>—</>
  return <><b className={p.profit < 0 ? 'bad' : 'good'}>{profitText(p)}</b> <small className="muted">· {t(low.label)} {money(low.price)}</small></>
}

/** The cost of one product as its own edit box. In the list, the profit on its lowest price is under it. */
function CostCell({ cat, item, cost, withProfit }: { cat: PriceCategory; item: PriceItem; cost: CostMap; withProfit?: boolean }) {
  const value = cost[costKey(cat.id, item.id)] ?? null
  return (
    <span className="cost-cell">
      <PriceCell value={value} label={t('Cost')} canEdit onSave={(v) => costs.save(cat.id, item.id, item.name, v, value).catch(fail)} />
      {withProfit && value !== null && <span className="cost-profit"><ProfitLine item={item} cost={value} /></span>}
    </span>
  )
}

const specsOf = (item: PriceItem) => specChips(item)

const webOk = (item: PriceItem, f: '' | 'check' | 'names' | 'linked' | 'none') =>
  !f || (f === 'check' ? Boolean(item.web && (!item.web.ok || webNeedsOption(item))) : f === 'names' ? Boolean(item.web?.ok && webNameDiff(item)) : f === 'linked' ? Boolean(item.web?.ok) : !item.web?.ok)

/** Where the product stands with the website, as a small chip next to its name. */
function WebChip({ item }: { item: PriceItem }) {
  const w = item.web
  if (!w) return null
  if (!w.ok) return <Chip tone="warn">{t('Check website link')}</Chip>
  if (webNeedsOption(item)) return <Chip tone="warn">{t('Choose website option')}</Chip>
  if (w.error) return <Chip tone="bad">{t('Website error')}</Chip>
  if (webPending(item).length) return <Chip tone="info">{t('Sending to website…')}</Chip>
  if (webNameDiff(item)) return <Chip tone="warn">{t('Name differs')}</Chip>
  return <Chip tone="good">{t('Website')}</Chip>
}
const saver = (cat: PriceCategory, item: PriceItem) => (field: 'in' | 'alone' | 'online' | 'onlineSale', value: number | null) => prices.save(cat.id, item.id, { [field]: value }, item).catch(fail)

/** One line of the table: name and company, specs, then the two prices you can type into. */
function ListRow({ cat, item, canEdit, cost, catHead, groupHead, onOpen }: RowProps) {
  const save = saver(cat, item)
  return (
    <>
      {catHead && <div className="ptable-cat" role="row"><span role="cell">{catHead}</span></div>}
      {groupHead && <div className="ptable-group" role="row"><span role="cell">{groupHead}</span></div>}
      <div className={`ptable-row${item.hidden ? ' price-hidden' : ''}`} role="row">
        <button className="ptable-name" role="cell" onClick={onOpen}>
          <span className="row-title" dir="auto">{item.name || t('(no name)')}</span>
          <span className="ptable-meta">
            {item.company && <span dir="auto">{item.company}</span>}
            {item.warranty ? <span>{tn('%n y', { n: item.warranty })}</span> : null}
            {item.hidden && <Chip tone="warn">{t('Hidden')}</Chip>}
            <WebChip item={item} />
          </span>
        </button>
        <span className="ptable-specs" role="cell">{specsOf(item).map((s) => <Chip key={s} tone="info">{s}</Chip>)}</span>
        <span className="ptable-stock" role="cell"><StockToggle cat={cat} item={item} canEdit={canEdit} /></span>
        <PriceCell value={item.in} label={t('In build')} canEdit={canEdit} onSave={(v) => save('in', v)} />
        <PriceCell value={item.alone} label={t('Alone')} canEdit={canEdit} onSave={(v) => save('alone', v)} />
        {seeWeb() && (
          <span className="ptable-web" title={t('Website prices')}>
            <PriceCell value={item.online ?? null} label={t('Price before')} canEdit={canEdit} onSave={(v) => save('online', v)} />
            <PriceCell value={item.onlineSale ?? null} label={t('Price after')} canEdit={canEdit} onSave={(v) => save('onlineSale', v)} />
          </span>
        )}
        {cost && <CostCell cat={cat} item={item} cost={cost} withProfit />}
      </div>
    </>
  )
}

/** The same product as a card: tap the top to open it, type into either price at the bottom. */
function PriceCard({ cat, item, canEdit, cost, catHead, groupHead, onOpen }: RowProps) {
  const save = saver(cat, item)
  return (
    <>
      {catHead && <h3 className="pgrid-head">{catHead}</h3>}
      {groupHead && <h4 className="pgrid-group">{groupHead}</h4>}
      <article className={`pcard${item.hidden ? ' price-hidden' : ''}${item.out ? ' pcard-out' : ''}`}>
        <span className="pcard-stock"><StockToggle cat={cat} item={item} canEdit={canEdit} /></span>
        <button className="pcard-top" onClick={onOpen}>
          <span className="pcard-company" dir="auto">{item.company || cat.name}</span>
          <span className="row-title" dir="auto">{item.name || t('(no name)')}</span>
          <span className="pcard-tags">
            {specsOf(item).map((s) => <Chip key={s} tone="info">{s}</Chip>)}
            {item.warranty ? <Chip>{tn('%n y', { n: item.warranty })}</Chip> : null}
            {item.hidden && <Chip tone="warn">{t('Hidden')}</Chip>}
            <WebChip item={item} />
          </span>
        </button>
        <div className="pcard-prices">
          <label><span>{t('In build')}</span><PriceCell value={item.in} label={t('In build')} canEdit={canEdit} onSave={(v) => save('in', v)} /></label>
          <label><span>{t('Alone')}</span><PriceCell value={item.alone} label={t('Alone')} canEdit={canEdit} onSave={(v) => save('alone', v)} /></label>
          {seeWeb() && <div className="pcard-web">
            <span className="pcard-web-tag"><Icon name="globe" size={12} />{t('Website')}</span>
            <label><span>{t('Price before')}</span><PriceCell value={item.online ?? null} label={t('Price before')} canEdit={canEdit} onSave={(v) => save('online', v)} /></label>
            <label><span>{t('Price after')}</span><PriceCell value={item.onlineSale ?? null} label={t('Price after')} canEdit={canEdit} onSave={(v) => save('onlineSale', v)} /></label>
          </div>}
          {cost && <label className="pcard-cost"><span>{t('Cost')}</span><CostCell cat={cat} item={item} cost={cost} /></label>}
          {cost && <div className="pcard-profit"><span>{t('Profit')}</span><span className="cost-profit"><ProfitLine item={item} cost={cost[costKey(cat.id, item.id)] ?? null} /></span></div>}
        </div>
      </article>
    </>
  )
}

/** In stock or out of stock: one click switches it, and it is saved and logged like a price. */
function StockToggle({ cat, item, canEdit }: { cat: PriceCategory; item: PriceItem; canEdit: boolean }) {
  const label = item.out ? t('Out of stock') : t('In stock')
  const cls = `stock ${item.out ? 'stock-out' : 'stock-in'}`
  if (!canEdit) return <span className={cls} title={label}><i aria-hidden="true" /><span>{label}</span></span>
  return (
    <button
      className={cls}
      title={item.out ? t('Click to mark in stock') : t('Click to mark out of stock')}
      aria-pressed={!item.out}
      onClick={() => prices.save(cat.id, item.id, { out: item.out ? undefined : true }, item).catch(fail)}
    >
      <i aria-hidden="true" /><span>{label}</span>
    </button>
  )
}

/** A price that is also its own edit box: type, then Enter or tap away. Escape puts it back. */
function PriceCell({ value, label, canEdit, onSave }: { value: number | null; label: string; canEdit: boolean; onSave: (v: number | null) => void }) {
  const [text, setText] = useState<string | null>(null)
  if (!canEdit) return <span className="price-cell" aria-label={label}>{money(value)}</span>
  const done = () => {
    if (text === null) return
    const v = parseMoney(text)
    setText(null)
    if (v === undefined) return showToast(t('Not a number.'))
    if (v !== value) onSave(v)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
    if (e.key === 'Escape') { setText(null); (e.target as HTMLInputElement).blur() }
  }
  return (
    <input
      className="price-cell price-input"
      inputMode="numeric"
      aria-label={label}
      value={text ?? money(value).replace('—', '')}
      placeholder="—"
      onFocus={(e) => { setText(value === null ? '' : String(value)); requestAnimationFrame(() => e.target.select()) }}
      onChange={(e) => setText(e.target.value)}
      onBlur={done}
      onKeyDown={onKey}
    />
  )
}

/** One product: every field, its history, hide or delete. Also used to add a product. */
function ProductSheet({ cats, cat: startCat, item, canEdit, canCost, costMap, onClose }: { cats: PriceCategory[]; cat: string; item: PriceItem | null; canEdit: boolean; canCost: boolean; costMap: CostMap | null; onClose: () => void }) {
  const [cat, setCat] = useState(startCat)
  const [name, setName] = useState(item?.name ?? '')
  const [company, setCompany] = useState(item?.company ?? '')
  const [inb, setIn] = useState(item?.in === null || item?.in === undefined ? '' : String(item.in))
  const [alone, setAlone] = useState(item?.alone === null || item?.alone === undefined ? '' : String(item.alone))
  const [online, setOnline] = useState(item?.online === null || item?.online === undefined ? '' : String(item.online))
  const [onlineSale, setOnlineSale] = useState(item?.onlineSale === null || item?.onlineSale === undefined ? '' : String(item.onlineSale))
  // The cost as it was when the sheet opened, and as typed. Only for roles with 'See and edit cost'.
  const cost0 = item && costMap ? costMap[costKey(startCat, item.id)] ?? null : null
  const [cost, setCost] = useState(cost0 === null ? '' : String(cost0))
  const costOn = useCostShown()
  // The online prices can also change while this is open (linking to the website fills them), so Save only
  // writes them when they were typed here.
  const [online0, onlineSale0] = useState(() => [online, onlineSale])[0]
  const [warranty, setWarranty] = useState(item?.warranty === null || item?.warranty === undefined ? '' : String(item.warranty))
  const [group, setGroup] = useState(item?.group ?? '')
  const [specs, setSpecs] = useState<Record<string, string>>(item?.specs ?? {})
  const [hiddenOn, setHidden] = useState(item?.hidden ?? false)
  const [outOn, setOut] = useState(item?.out ?? false)
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  const [log, setLog] = useState<PriceChange[] | null>(null)
  useEffect(() => {
    if (!item) return
    const one = { cat: startCat, pid: item.id }
    // Cost changes are in their own log that only roles with 'See and edit cost' can read.
    Promise.all([prices.history(20, one), canCost ? costs.history(20, one).catch(() => []) : Promise.resolve([])])
      .then(([a, b]) => setLog([...a, ...b].sort((x, y) => y.at - x.at).slice(0, 20)), () => setLog([]))
  }, [item, startCat, canCost])
  const specFields = SPEC_FIELDS[cat] ?? []
  const guessedPsu = cat === 'case' ? casePsu({ id: '', name, in: null, alone: null, warranty: null, company: '' }) : ''
  // Suggestions for specs and companies come from what the list already uses.
  const known = (key: string) => [...new Set(cats.flatMap((c) => c.items.map((i) => i.specs?.[key] ?? '')).filter(Boolean))].sort()
  // Companies of this category first, then the ones used elsewhere in the list.
  const companies = [...new Set((cats.find((c) => c.id === cat)?.items ?? []).map((i) => i.company.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const otherCompanies = [...new Set(cats.flatMap((c) => c.items.map((i) => i.company.trim())).filter((c) => c && !companies.includes(c)))].sort((a, b) => a.localeCompare(b))

  const save = async () => {
    const nums = [inb, alone, warranty, online, onlineSale].map(parseMoney)
    const costNow = canCost ? parseMoney(cost) : cost0
    if (costNow === undefined) return showToast(t('Not a number.'))
    if (!canEdit) {
      // A role that may change cost but not prices: only the cost is saved.
      if (!item || costNow === cost0) return onClose()
      setBusy(true)
      try {
        await costs.save(startCat, item.id, item.name, costNow, cost0)
        showToast(t('Saved'))
        onClose()
      } catch (e) {
        fail(e)
        setBusy(false)
      }
      return
    }
    if (nums.some((n) => n === undefined)) return showToast(t('Not a number.'))
    if (!name.trim()) return showToast(t('Give the product a name.'))
    const patch: ItemPatch = { name: name.trim(), company: company.trim(), in: nums[0]!, alone: nums[1]!, warranty: nums[2]!, group: group.trim() || undefined, hidden: hiddenOn || undefined, out: outOn || undefined }
    if (online !== online0) patch.online = nums[3] ?? undefined
    if (onlineSale !== onlineSale0) patch.onlineSale = nums[4] ?? undefined
    const cleanSpecs = Object.fromEntries(specFields.map((k) => [k, (specs[k] ?? '').trim()]))
    if (specFields.length) patch.specs = cleanSpecs
    setBusy(true)
    try {
      if (item && cat !== startCat) {
        // Moving to another category: add it there, then take it out of the old one. Its cost follows.
        const keep = live(cats, startCat, item)
        const id = newProductId()
        await prices.save(cat, id, { online: keep.online, onlineSale: keep.onlineSale, web: keep.web && (JSON.parse(JSON.stringify(keep.web)) as typeof keep.web), ...patch }, null)
        await prices.remove(startCat, item)
        if (cost0 !== null) await costs.move({ cat: startCat, pid: item.id }, { cat, pid: id }, cost0)
        if (canCost && costNow !== cost0) await costs.save(cat, id, patch.name!, costNow, cost0)
      } else {
        const id = item?.id ?? newProductId()
        await prices.save(cat, id, patch, item)
        if (canCost && costNow !== cost0) await costs.save(cat, id, patch.name!, costNow, cost0)
      }
      showToast(t('Saved'))
      onClose()
    } catch (e) {
      fail(e)
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!item) return
    setBusy(true)
    try {
      await prices.remove(startCat, item)
      if (cost0 !== null) await costs.remove(startCat, item.id).catch(() => {})
      showToast(t('Deleted'))
      onClose()
    } catch (e) {
      fail(e)
      setBusy(false)
    }
  }
  const ro = !canEdit
  return (
    <Sheet
      title={item ? item.name : t('New product')}
      onClose={onClose}
      footer={canEdit || (canCost && item) ? (
        <>
          {canEdit && item && (sure ? <button className="btn btn-danger" disabled={busy} onClick={remove}>{t('Delete for good')}</button> : <button className="btn btn-ghost" onClick={() => setSure(true)}><Icon name="trash" size={18} />{t('Delete')}</button>)}
          <button className="btn btn-primary" disabled={busy} onClick={save}>{t('Save')}</button>
        </>
      ) : undefined}
    >
      <div className="form">
        <label><span>{t('Category')}</span>
          <select value={cat} disabled={ro} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label><span>{t('Name')}</span><input dir="auto" value={name} readOnly={ro} onChange={(e) => setName(e.target.value)} /></label>
        <div className="form-row two">
          <label><span>{t('In build')}</span><input inputMode="numeric" value={inb} readOnly={ro} onChange={(e) => setIn(e.target.value)} /></label>
          <label><span>{t('Alone')}</span><input inputMode="numeric" value={alone} readOnly={ro} onChange={(e) => setAlone(e.target.value)} /></label>
        </div>
        {seeWeb() && <fieldset className="web-prices">
          <legend><Icon name="globe" size={14} />{t('Website prices')}</legend>
          <div className="form-row two">
            <label><span>{t('Price before')}</span><input inputMode="numeric" value={online} readOnly={ro} placeholder={t('Website price')} onChange={(e) => setOnline(e.target.value)} /></label>
            <label><span>{t('Price after')}</span><input inputMode="numeric" value={onlineSale} readOnly={ro} placeholder={t('Empty = no sale')} onChange={(e) => setOnlineSale(e.target.value)} /></label>
          </div>
        </fieldset>}
        {canCost && (
          <div className="cost-field">
            <label><span>{t('Cost')} <small className="muted">({t('only people allowed to see cost see this')})</small></span>
              <span className="cost-input">
                {costOn
                  ? <input inputMode="numeric" value={cost} placeholder={t('What it costs the shop')} onChange={(e) => setCost(e.target.value)} />
                  : <input readOnly value={cost ? '•••••' : ''} placeholder="—" aria-label={t('Cost (hidden)')} onFocus={() => setCostShown(true)} />}
                <CostEye compact />
              </span>
            </label>
            {costOn && (() => {
              const c = parseMoney(cost) ?? null
              if (c === null) return null
              const typed = { in: parseMoney(inb) ?? null, alone: parseMoney(alone) ?? null, online: parseMoney(online) ?? null, onlineSale: parseMoney(onlineSale) ?? null }
              return <p className="hint cost-profit">{t('Profit on the lowest price')}: <ProfitLine item={typed} cost={c} /></p>
            })()}
          </div>
        )}
        <label><span>{t('Warranty (years)')}</span><input inputMode="numeric" value={warranty} readOnly={ro} onChange={(e) => setWarranty(e.target.value)} /></label>
        <ChoiceField label={t('Company')} value={company} options={companies} more={otherCompanies} moreLabel={t('Other companies')} readOnly={ro} onChange={setCompany} />
        {specFields.length > 0 && (
          <div className="form-row two">
            {specFields.map((k) => (
              <ChoiceField key={k} label={t(SPEC_LABEL[k])} value={specs[k] ?? ''} options={k === 'psu' ? [...new Set(['No', ...known(k)])] : known(k)} readOnly={ro} onChange={(v) => setSpecs({ ...specs, [k]: v })} />
            ))}
          </div>
        )}
        {cat === 'case' && !(specs.psu ?? '').trim() && <p className="hint">{guessedPsu ? tn('Comes with a %w power supply, going by the name. The Builder will not ask for another one.', { w: guessedPsu }) : t('No power supply, going by the name. Pick a wattage above if this case comes with one.')}</p>}
        <label><span>{t('Group')}</span><input dir="auto" value={group} readOnly={ro} placeholder={t('Optional, for example AIR or Liquid')} onChange={(e) => setGroup(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={outOn} disabled={ro} onChange={(e) => setOut(e.target.checked)} /> {t('Out of stock')}</label>
        <label className="check"><input type="checkbox" checked={hiddenOn} disabled={ro} onChange={(e) => setHidden(e.target.checked)} /> {t('Hidden (not offered in builds)')}</label>
        {sure && <p className="hint bad">{t('Deleting removes the product from the price list. Builds and posts that already use it keep their copy.')}</p>}
      </div>
      {item && <WebSection cat={startCat} item={live(cats, startCat, item)} canEdit={canEdit} onName={setName} />}
      {item && (
        <section className="price-history">
          <h3>{t('History')}</h3>
          {log === null ? <p className="muted">{t('Loading…')}</p> : log.length === 0 ? <p className="muted">{t('No changes since it came into the app.')}</p> : <ChangeList log={log} />}
          {item.at ? <p className="hint">{t('Last change')}: {new Date(item.at).toLocaleString(locale())}{item.byName ? ` · ${item.byName}` : ''}</p> : null}
        </section>
      )}
    </Sheet>
  )
}

/** The product as it is now in the live list (the sheet was opened with a copy). */
const live = (cats: PriceCategory[], cat: string, item: PriceItem) => cats.find((c) => c.id === cat)?.items.find((i) => i.id === item.id) ?? item

/**
 * The website product this one is linked to. A suggested link must be confirmed before anything is sent;
 * a confirmed one gets Online price, Online sale and stock sent to static-eg.com within a minute of a change.
 */
function WebSection({ cat, item, canEdit, onName }: { cat: string; item: PriceItem; canEdit: boolean; onName: (n: string) => void }) {
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const w = item.web
  const save = async (web: PriceItem['web']) => {
    setBusy(true)
    try {
      // Firestore takes no undefined inside a map, so the link is copied without empty fields.
      const patch: ItemPatch = { web: web && (JSON.parse(JSON.stringify(web)) as typeof web) }
      // Online prices still empty start from what the website has, so linking never wipes a website price or sale.
      if (web && (item.online === undefined || item.online === null) && web.price != null) patch.online = web.price
      if (web && (item.onlineSale === undefined || item.onlineSale === null) && web.sale != null) patch.onlineSale = web.sale
      await prices.save(cat, item.id, patch, item)
      setPicking(false)
    } catch (e) {
      fail(e)
    }
    setBusy(false)
  }
  const pick = (p: WebProduct, o?: WebOption) => save(o
    ? { id: p.id, name: p.name, ok: true, url: p.url, type: p.type, variation: o.id, option: o.name, price: o.price, sale: o.sale, stock: o.stock }
    : { id: p.id, name: p.name, ok: true, url: p.url, type: p.type, price: p.price, sale: p.sale, stock: p.stock })
  // A website product with options: its options, to show which one this is and to choose it.
  const [opts, setOpts] = useState<WebOption[] | null>(null)
  const wid = w?.type === 'variable' ? w.id : 0
  useEffect(() => {
    if (!wid) return
    let live = true
    loadWebProducts().then((l) => { if (live) setOpts(l.find((p) => p.id === wid)?.options ?? []) }, () => live && setOpts([]))
    return () => { live = false }
  }, [wid])
  const choose = (o: WebOption) => w && save({ ...w, variation: o.id, option: o.name, price: o.price, sale: o.sale, stock: o.stock, error: undefined })
  const pending = webPending(item)
  // What confirming would change on the website (the app's prices and stock win).
  const onConfirm = w && !w.ok ? webPending({ ...item, online: item.online ?? w.price, onlineSale: item.onlineSale ?? w.sale }, true) : []
  const what = (x: string) => t(x === 'price' ? 'Price before' : x === 'sale' ? 'Price after' : x === 'name' ? 'Name' : 'Stock')
  return (
    <section className="web-link">
      <h3>{t('Website')}</h3>
      {!w ? <p className="muted">{t('Not linked to a website product. Nothing is sent to the website for it.')}</p> : (
        <div className="web-card">
          <div className="row-sub">
            {w.ok ? <Chip tone="good">{t('Linked')}</Chip> : <Chip tone="warn">{tn('Suggested by name (%n% sure)', { n: w.score ?? 0 })}</Chip>}
            {w.type === 'variable' && (w.option ? <Chip tone="info">{t('Option')}: {w.option}</Chip> : <Chip tone="warn">{t('Option not chosen')}</Chip>)}
          </div>
          <div dir="auto" className="web-name">{w.url ? <a href={w.url} target="_blank" rel="noreferrer">{w.name}</a> : w.name}</div>
          <div className="muted">
            {t('On the website')}: {seeWeb() && <>{money(w.price ?? null)}{w.sale != null ? ` · ${t('Sale')} ${money(w.sale)}` : ''} · </>}{w.stock === 'outofstock' ? t('Out of stock') : w.stock ? t('In stock') : '—'}
          </div>
          {w.ok && w.error && <p className="hint bad">{t('Last send failed')}: {w.error}</p>}
          {w.ok && !w.error && pending.length > 0 && <p className="hint">{t('Waiting to send to the website')}: {pending.map(what).join(', ')}</p>}
          {w.ok && w.sentAt && <p className="hint">{t('Last sent')}: {new Date(w.sentAt).toLocaleString(locale())}</p>}
          {!w.ok && <p className="hint">{t('Check that this is the same product. Nothing is sent to the website until you confirm.')}</p>}
          {w.type === 'variable' && (
            <div className="web-options">
              <p className="hint">{w.option ? t('This website page has options. This product is the one marked:') : t('This website page has options. Choose the one this product is:')}</p>
              {opts === null ? <p className="muted">{t('Loading…')}</p> : opts.length === 0 ? <p className="muted">{t('The options of this page have not been read yet.')}</p> : (
                <OptionList options={opts} current={w.variation} disabled={!canEdit || busy} onPick={choose} />
              )}
              {opts !== null && opts.length > 0 && !w.variation && <p className="hint">{t('If this product is not one of these options, it is not on the website yet: unlink it.')}</p>}
            </div>
          )}
          {!w.ok && onConfirm.length > 0 && <p className="hint bad">{t('Confirming will change on the website')}: {onConfirm.map(what).join(', ')}{onConfirm.includes('stock') ? ` (${item.out ? t('Out of stock') : t('In stock')})` : ''}</p>}
        </div>
      )}
      {w && <NameChoice cat={cat} item={item} canEdit={canEdit} onName={onName} />}
      {canEdit && (
        <div className="web-actions">
          {w && !w.ok && <button className="btn btn-primary" disabled={busy} onClick={() => save({ ...w, ok: true, score: undefined })}><Icon name="check" size={18} />{t('Confirm link')}</button>}
          <button className="btn btn-ghost" disabled={busy} onClick={() => setPicking((x) => !x)}><Icon name="link" size={18} />{w ? t('Change') : t('Link to a website product')}</button>
          {w && <button className="btn btn-ghost" disabled={busy} onClick={() => save(undefined)}><Icon name="close" size={18} />{t('Unlink')}</button>}
        </div>
      )}
      {picking && <WebPicker start={item.name} onPick={pick} />}
    </section>
  )
}

/**
 * When the app and the website call a linked product by different names: keep the app's name (it is sent to the
 * website), take the website's name (only the app changes), or type a new one for both.
 */
function NameChoice({ cat, item, canEdit, onName }: { cat: string; item: PriceItem; canEdit: boolean; onName: (n: string) => void }) {
  const [typing, setTyping] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const w = item.web
  if (!w) return null
  const options = w.type === 'variable'
  const there = options ? (w.rename && !sameNameLoose(w.rename, w.name) ? w.rename : null) : webNameDiff(item)
  // A product with options: the website name is shared by its options, so it is only changed on purpose, never matched to the app's name.
  if (!there && !(options && canEdit)) return null
  const save = async (patch: ItemPatch, done: string) => {
    setBusy(true)
    try {
      if (patch.web) patch.web = JSON.parse(JSON.stringify(patch.web)) as typeof patch.web
      await prices.save(cat, item.id, patch, item)
      // The sheet's Name box follows, so its Save does not put the old name back.
      if (patch.name) onName(patch.name)
      setTyping(false)
      showToast(done)
    } catch (e) {
      fail(e)
    }
    setBusy(false)
  }
  const forWeb = (n: string) => (sameNameLoose(n, w.name) ? { ...w, rename: undefined } : { ...w, rename: n })
  const typed = name.replace(/\s+/g, ' ').trim()
  const form = (
    <div className="form">
      <label><span>{options ? t('New name for the website product') : t('New name for both')}</span><input dir="auto" value={name} autoFocus onChange={(e) => setName(e.target.value)} /></label>
      <div className="web-actions">
        <button className="btn btn-primary" disabled={busy || !typed} onClick={() => save(options ? { web: forWeb(typed) } : { name: typed, web: forWeb(typed) }, t('Saved'))}>{t('Save')}</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => setTyping(false)}>{t('Cancel')}</button>
      </div>
    </div>
  )
  if (options) {
    return (
      <div className="web-actions">
        {there && <p className="hint">{t('Website name')}: <span dir="auto">{there}</span> ({t('waiting to send')})</p>}
        {canEdit && !typing && <button className="btn btn-ghost" disabled={busy} onClick={() => { setName(w.rename || w.name); setTyping(true) }}><Icon name="edit" size={18} />{t('Rename on the website')}</button>}
        {canEdit && typing && <><p className="hint">{t('This website product has options. A new name there is the name of all its options.')}</p>{form}</>}
      </div>
    )
  }
  return (
    <div className="web-card web-names">
      <strong>{t('The name is different on the website')}</strong>
      <div className="web-names-grid">
        <span className="muted">{t('Price list')}</span><span dir="auto">{item.name}</span>
        <span className="muted">{t('Website')}</span><span dir="auto">{there}{w.rename ? ` (${t('waiting to send')})` : ''}</span>
      </div>
      {!w.ok && <p className="hint">{t('A name for the website is sent once the link is confirmed.')}</p>}
      {canEdit && !typing && (
        <div className="web-actions">
          <button className="btn btn-ghost" disabled={busy} onClick={() => save({ web: forWeb(item.name) }, t('The website will get this name'))}>{t('Keep the price list name')}</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => save({ name: w.name, web: { ...w, rename: undefined } }, t('Saved'))}>{t('Use the website name')}</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => { setName(item.name); setTyping(true) }}><Icon name="edit" size={18} />{t('New name')}</button>
        </div>
      )}
      {canEdit && typing && form}
    </div>
  )
}

/** The options of a website page (Box, Tray, colours), each with its price and stock; the chosen one is marked. */
function OptionList({ options, current, disabled, onPick }: { options: WebOption[]; current?: number; disabled?: boolean; onPick: (o: WebOption) => void }) {
  return (
    <div className="web-option-list">
      {options.map((o) => (
        <button key={o.id} type="button" className={o.id === current ? 'on' : ''} aria-pressed={o.id === current} disabled={disabled} onClick={() => onPick(o)}>
          <strong dir="auto">{o.name || '—'}</strong>
          <span className="muted">{seeWeb() && <>{money(o.price)}{o.sale != null ? ` · ${t('Sale')} ${money(o.sale)}` : ''} · </>}{o.stock === 'outofstock' ? t('Out of stock') : t('In stock')}</span>
        </button>
      ))}
    </div>
  )
}

/** Search the website's products and pick one (and, for a page with options, the option). */
function WebPicker({ start, onPick }: { start: string; onPick: (p: WebProduct, o?: WebOption) => void }) {
  const [open, setOpen] = useState<number | null>(null)
  const [list, setList] = useState<WebProduct[] | null>(null)
  const [q, setQ] = useState(start.split(' ').slice(0, 3).join(' '))
  useEffect(() => { loadWebProducts().then(setList, () => setList([])) }, [])
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const found = (list ?? []).filter((p) => words.every((w) => p.name.toLowerCase().includes(w))).slice(0, 30)
  return (
    <div className="web-picker">
      <SearchBox value={q} onChange={setQ} placeholder={t('Search the website products…')} />
      {list === null ? <p className="muted">{t('Loading…')}</p> : list.length === 0 ? <p className="muted">{t('The website product list has not been read yet.')}</p> : found.length === 0 ? <p className="muted">{t('Nothing matches.')}</p> : (
        <ul>
          {found.map((p) => (
            <li key={p.id}>
              <button onClick={() => (p.options?.length ? setOpen(open === p.id ? null : p.id) : onPick(p))}>
                <span dir="auto">{p.name}</span>
                <span className="muted">{p.options?.length ? tn('%n options: %o', { n: p.options.length, o: p.options.map((o) => o.name).join(', ') }) : <>{seeWeb() && <>{money(p.price)}{p.sale != null ? ` · ${t('Sale')} ${money(p.sale)}` : ''} · </>}{p.stock === 'outofstock' ? t('Out of stock') : t('In stock')}</>}</span>
              </button>
              {open === p.id && p.options && <div className="web-picker-opts"><p className="hint">{t('Choose the option this product is:')}</p><OptionList options={p.options} onPick={(o) => onPick(p, o)} /></div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * A dropdown of the values the price list already uses (so "AM5" is never typed as "am 5"), with
 * "Add new…" to type one that is not there yet. It is in the list once a product is saved with it.
 */
function ChoiceField({ label, value, options, more = [], moreLabel, readOnly, onChange }: { label: string; value: string; options: string[]; more?: string[]; moreLabel?: string; readOnly?: boolean; onChange: (v: string) => void }) {
  const known = options.includes(value) || more.includes(value)
  const [typing, setTyping] = useState(false)
  const NEW = '\u0000new'
  if (typing || (value && !known)) {
    return (
      <label><span>{label}</span>
        <span className="choice-new">
          <input dir="auto" value={value} readOnly={readOnly} autoFocus={typing} placeholder={t('Add new…')} onChange={(e) => onChange(e.target.value)} />
          {!readOnly && (options.length > 0 || more.length > 0) && <button type="button" className="link" onClick={() => { setTyping(false); if (!known) onChange('') }}>{t('Back to the list')}</button>}
        </span>
      </label>
    )
  }
  return (
    <label><span>{label}</span>
      <select value={value} disabled={readOnly} onChange={(e) => (e.target.value === NEW ? (setTyping(true), onChange('')) : onChange(e.target.value))}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        {more.length > 0 && <optgroup label={moreLabel}>{more.map((o) => <option key={o} value={o}>{o}</option>)}</optgroup>}
        {!readOnly && <option value={NEW}>{t('Add new…')}</option>}
      </select>
    </label>
  )
}

function ChangeList({ log, cats }: { log: PriceChange[]; cats?: PriceCategory[] }) {
  // Cost lines only show the numbers while the cost eye is open.
  const costOn = useCostShown()
  const ACT: Record<string, string> = { add: 'Added', remove: 'Deleted', bulk: 'Changed all by %', cost: 'Cost' }
  // Without 'See website prices' the Price before / after changes are left out, and a line with nothing else goes.
  const web = seeWeb()
  const shown = web ? log : log.flatMap((l) => {
    const changes = l.changes.filter((c) => !WEB_FIELDS.includes(c.f))
    return changes.length || !l.changes.length || l.act === 'add' || l.act === 'remove' ? [{ ...l, changes }] : []
  })
  return (
    <ul className="changes">
      {shown.map((l) => (
        <li key={l.id}>
          <div className="row-sub">
            <b>{l.byName || t('Someone')}</b>
            <span className="muted">{new Date(l.at).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
            {ACT[l.act] && <Chip>{t(ACT[l.act])}</Chip>}
            {cats && <Chip>{cats.find((c) => c.id === l.cat)?.name ?? l.cat}</Chip>}
          </div>
          {cats && <div dir="auto">{l.name}</div>}
          {l.act !== 'remove' && l.act !== 'add' && (
            <div className="muted">{l.changes.map((c) => { const v = (x: string) => (c.f === 'cost' && !costOn ? (x ? '•••••' : '—') : (c.f === 'out' ? t(x) : x) || '—'); return `${t(fieldLabel(c.f))}: ${v(c.from)} → ${v(c.to)}` }).join(' · ')}</div>
          )}
        </li>
      ))}
    </ul>
  )
}

/** The latest changes to the whole list, newest first. */
function ChangesSheet({ cats, withCost, onClose }: { cats: PriceCategory[]; withCost: boolean; onClose: () => void }) {
  const [log, setLog] = useState<PriceChange[] | null>(null)
  const [max, setMax] = useState(40)
  useEffect(() => {
    // Cost changes come from their own log, for those who may see cost.
    Promise.all([prices.history(max), withCost ? costs.history(max).catch(() => []) : Promise.resolve([])])
      .then(([a, b]) => setLog([...a, ...b].sort((x, y) => y.at - x.at).slice(0, max)), () => setLog([]))
  }, [max, withCost])
  return (
    <Sheet title={t('Price changes')} onClose={onClose}>
      {log === null ? <p className="muted">{t('Loading…')}</p> : log.length === 0 ? <Empty icon="clock" text={t('No changes yet.')} /> : <ChangeList log={log} cats={cats} />}
      {log && log.length === max && <button className="btn" onClick={() => setMax(max + 40)}>{t('Show more')}</button>}
    </Sheet>
  )
}

/** Every product of one category up or down by a percent, rounded, with a preview first. */
function BulkSheet({ cat, onClose }: { cat: PriceCategory; onClose: () => void }) {
  const [percent, setPercent] = useState('')
  const [which, setWhich] = useState<'both' | 'in' | 'alone'>('both')
  const [step, setStep] = useState(50)
  const [busy, setBusy] = useState(false)
  const p = Number(percent.replace(',', '.'))
  const valid = percent.trim() !== '' && Number.isFinite(p) && p !== 0 && p > -90 && p < 300
  const list = valid ? bulkPatches(cat.items, p, which, step) : []
  const apply = async () => {
    setBusy(true)
    try {
      await prices.bulk(cat.id, list)
      showToast(t('Saved'))
      onClose()
    } catch (e) {
      fail(e)
      setBusy(false)
    }
  }
  return (
    <Sheet title={`${t('Change all by %')}: ${cat.name}`} onClose={onClose} footer={<button className="btn btn-primary" disabled={!list.length || busy} onClick={apply}>{tn('Change %n products', { n: list.length })}</button>}>
      <div className="form">
        <div className="form-row two">
          <label><span>{t('Percent (use - to lower)')}</span><input inputMode="decimal" value={percent} placeholder="3" onChange={(e) => setPercent(e.target.value)} /></label>
          <label><span>{t('Round to')}</span><select value={step} onChange={(e) => setStep(Number(e.target.value))}>{[1, 10, 50, 100].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        </div>
        <label><span>{t('Prices')}</span>
          <select value={which} onChange={(e) => setWhich(e.target.value as typeof which)}>
            <option value="both">{t('In build and alone')}</option>
            <option value="in">{t('In build only')}</option>
            <option value="alone">{t('Alone only')}</option>
          </select>
        </label>
      </div>
      {list.length > 0 && (
        <ul className="changes">
          {list.slice(0, 8).map(({ item, patch }) => (
            <li key={item.id}>
              <div dir="auto">{item.name}</div>
              <div className="muted">
                {patch.in !== undefined && `${t('In build')}: ${money(item.in)} → ${money(patch.in)}`}
                {patch.in !== undefined && patch.alone !== undefined && ' · '}
                {patch.alone !== undefined && `${t('Alone')}: ${money(item.alone)} → ${money(patch.alone)}`}
              </div>
            </li>
          ))}
          {list.length > 8 && <li className="muted">{tn('and %n more', { n: list.length - 8 })}</li>}
        </ul>
      )}
    </Sheet>
  )
}
