import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { bulkPatches, fieldLabel, matches, money, newProductId, parseMoney, prices, SPEC_FIELDS, SPEC_LABEL, usePrices, type ItemPatch, type PriceCategory, type PriceChange, type PriceItem } from '../data/prices'
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

/** The price list: find a product, change a price where it is shown, and see who changed what. */
export function PricesView() {
  const { loaded, cats, error } = usePrices()
  const canEdit = allowed('prices.edit')
  const [cat, setCat] = useState('')
  const [search, setSearch] = useState('')
  const [hidden, setHidden] = useState(false)
  const [stock, setStock] = useState<'' | 'in' | 'out'>('')
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
    for (const c of current ? [current] : cats) for (const item of c.items) if ((hidden || !item.hidden) && (!stock || (stock === 'out') === Boolean(item.out)) && matches(item, search)) out.push({ cat: c, item })
    return out
  }, [cats, current, search, hidden, stock])

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
            <div className="seg" role="group" aria-label={t('View')}>
              <button className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} title={t('List')} onClick={() => pickView('list')}><Icon name="rows" size={18} /></button>
              <button className={view === 'grid' ? 'on' : ''} aria-pressed={view === 'grid'} title={t('Cards')} onClick={() => pickView('grid')}><Icon name="cards" size={18} /></button>
            </div>
            <button className="link" onClick={() => setChanges(true)}><Icon name="clock" size={16} />{t('Changes')}</button>
            {canEdit && current && <button className="link" onClick={() => setBulk(true)}><Icon name="edit" size={16} />{t('Change all by %')}</button>}
            {canEdit && <button className="btn btn-primary" onClick={() => setOpen({ cat: current?.id ?? cats[0].id, item: null })}><Icon name="plus" size={18} />{t('Product')}</button>}
          </div>
          {hiddenCount > 0 && (
            <label className="check-line"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> {t('Show hidden products')} ({hiddenCount})</label>
          )}
          {rows.length === 0 ? <Empty icon="search" text={t('Nothing matches.')} /> : view === 'list' ? (
            <div className="ptable" role="table">
              <div className="ptable-row ptable-head" role="row">
                <span role="columnheader">{t('Product')}</span>
                <span role="columnheader" className="ptable-specs">{t('Specs')}</span>
                <span role="columnheader" className="ptable-stock">{t('Stock')}</span>
                <span role="columnheader" className="ptable-num">{t('In build')}</span>
                <span role="columnheader" className="ptable-num">{t('Alone')}</span>
              </div>
              {shown.map(({ cat: c, item }, i) => (
                <ListRow key={`${c.id}/${item.id}`} cat={c} item={item} canEdit={canEdit} {...heads[i]} onOpen={() => setOpen({ cat: c.id, item })} />
              ))}
            </div>
          ) : (
            <div className="pgrid">
              {shown.map(({ cat: c, item }, i) => (
                <PriceCard key={`${c.id}/${item.id}`} cat={c} item={item} canEdit={canEdit} {...heads[i]} onOpen={() => setOpen({ cat: c.id, item })} />
              ))}
            </div>
          )}
          {!all && rows.length > PAGE && <button className="btn" onClick={() => setAllFor(`${cat}|${search}`)}>{t('Show all')} ({rows.length})</button>}
        </div>
      </div>
      {open && <ProductSheet cats={cats} cat={open.cat} item={open.item} canEdit={canEdit} onClose={() => setOpen(null)} />}
      {changes && <ChangesSheet cats={cats} onClose={() => setChanges(false)} />}
      {bulk && current && <BulkSheet cat={current} onClose={() => setBulk(false)} />}
    </div>
  )
}

type RowProps = { cat: PriceCategory; item: PriceItem; canEdit: boolean; catHead: string; groupHead: string; onOpen: () => void }

const specsOf = (item: PriceItem) => Object.values(item.specs ?? {}).filter(Boolean)
const saver = (cat: PriceCategory, item: PriceItem) => (field: 'in' | 'alone', value: number | null) => prices.save(cat.id, item.id, { [field]: value }, item).catch(fail)

/** One line of the table: name and company, specs, then the two prices you can type into. */
function ListRow({ cat, item, canEdit, catHead, groupHead, onOpen }: RowProps) {
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
          </span>
        </button>
        <span className="ptable-specs" role="cell">{specsOf(item).map((s) => <Chip key={s} tone="info">{s}</Chip>)}</span>
        <span className="ptable-stock" role="cell"><StockToggle cat={cat} item={item} canEdit={canEdit} /></span>
        <PriceCell value={item.in} label={t('In build')} canEdit={canEdit} onSave={(v) => save('in', v)} />
        <PriceCell value={item.alone} label={t('Alone')} canEdit={canEdit} onSave={(v) => save('alone', v)} />
      </div>
    </>
  )
}

/** The same product as a card: tap the top to open it, type into either price at the bottom. */
function PriceCard({ cat, item, canEdit, catHead, groupHead, onOpen }: RowProps) {
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
          </span>
        </button>
        <div className="pcard-prices">
          <label><span>{t('In build')}</span><PriceCell value={item.in} label={t('In build')} canEdit={canEdit} onSave={(v) => save('in', v)} /></label>
          <label><span>{t('Alone')}</span><PriceCell value={item.alone} label={t('Alone')} canEdit={canEdit} onSave={(v) => save('alone', v)} /></label>
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
function ProductSheet({ cats, cat: startCat, item, canEdit, onClose }: { cats: PriceCategory[]; cat: string; item: PriceItem | null; canEdit: boolean; onClose: () => void }) {
  const [cat, setCat] = useState(startCat)
  const [name, setName] = useState(item?.name ?? '')
  const [company, setCompany] = useState(item?.company ?? '')
  const [inb, setIn] = useState(item?.in === null || item?.in === undefined ? '' : String(item.in))
  const [alone, setAlone] = useState(item?.alone === null || item?.alone === undefined ? '' : String(item.alone))
  const [warranty, setWarranty] = useState(item?.warranty === null || item?.warranty === undefined ? '' : String(item.warranty))
  const [group, setGroup] = useState(item?.group ?? '')
  const [specs, setSpecs] = useState<Record<string, string>>(item?.specs ?? {})
  const [hiddenOn, setHidden] = useState(item?.hidden ?? false)
  const [outOn, setOut] = useState(item?.out ?? false)
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  const [log, setLog] = useState<PriceChange[] | null>(null)
  useEffect(() => {
    if (item) prices.history(20, { cat: startCat, pid: item.id }).then(setLog, () => setLog([]))
  }, [item, startCat])
  const specFields = SPEC_FIELDS[cat] ?? []
  // Suggestions for specs and companies come from what the list already uses.
  const known = (key: string) => [...new Set(cats.flatMap((c) => c.items.map((i) => i.specs?.[key] ?? '')).filter(Boolean))].sort()
  const companies = [...new Set((cats.find((c) => c.id === cat)?.items ?? []).map((i) => i.company).filter(Boolean))].sort()

  const save = async () => {
    const nums = [inb, alone, warranty].map(parseMoney)
    if (nums.some((n) => n === undefined)) return showToast(t('Not a number.'))
    if (!name.trim()) return showToast(t('Give the product a name.'))
    const patch: ItemPatch = { name: name.trim(), company: company.trim(), in: nums[0]!, alone: nums[1]!, warranty: nums[2]!, group: group.trim() || undefined, hidden: hiddenOn || undefined, out: outOn || undefined }
    const cleanSpecs = Object.fromEntries(specFields.map((k) => [k, (specs[k] ?? '').trim()]))
    if (specFields.length) patch.specs = cleanSpecs
    setBusy(true)
    try {
      if (item && cat !== startCat) {
        // Moving to another category: add it there, then take it out of the old one.
        await prices.save(cat, newProductId(), patch, null)
        await prices.remove(startCat, item)
      } else await prices.save(cat, item?.id ?? newProductId(), patch, item)
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
      footer={canEdit ? (
        <>
          {item && (sure ? <button className="btn btn-danger" disabled={busy} onClick={remove}>{t('Delete for good')}</button> : <button className="btn btn-ghost" onClick={() => setSure(true)}><Icon name="trash" size={18} />{t('Delete')}</button>)}
          <button className="btn btn-primary" disabled={busy} onClick={save}>{t('Save')}</button>
        </>
      ) : undefined}
    >
      <div className="form">
        <label><span>{t('Category')}</span>
          <select value={cat} disabled={ro} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label><span>{t('Name')}</span><input dir="auto" value={name} readOnly={ro} onChange={(e) => setName(e.target.value)} /></label>
        <div className="form-row three">
          <label><span>{t('In build')}</span><input inputMode="numeric" value={inb} readOnly={ro} onChange={(e) => setIn(e.target.value)} /></label>
          <label><span>{t('Alone')}</span><input inputMode="numeric" value={alone} readOnly={ro} onChange={(e) => setAlone(e.target.value)} /></label>
          <label><span>{t('Warranty (years)')}</span><input inputMode="numeric" value={warranty} readOnly={ro} onChange={(e) => setWarranty(e.target.value)} /></label>
        </div>
        <label><span>{t('Company')}</span><input dir="auto" list="pp-companies" value={company} readOnly={ro} onChange={(e) => setCompany(e.target.value)} /></label>
        <datalist id="pp-companies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
        {specFields.length > 0 && (
          <div className="form-row two">
            {specFields.map((k) => (
              <label key={k}><span>{t(SPEC_LABEL[k])}</span>
                <input list={`pp-spec-${k}`} value={specs[k] ?? ''} readOnly={ro} onChange={(e) => setSpecs({ ...specs, [k]: e.target.value })} />
                <datalist id={`pp-spec-${k}`}>{known(k).map((v) => <option key={v} value={v} />)}</datalist>
              </label>
            ))}
          </div>
        )}
        <label><span>{t('Group')}</span><input dir="auto" value={group} readOnly={ro} placeholder={t('Optional, for example AIR or Liquid')} onChange={(e) => setGroup(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={outOn} disabled={ro} onChange={(e) => setOut(e.target.checked)} /> {t('Out of stock')}</label>
        <label className="check"><input type="checkbox" checked={hiddenOn} disabled={ro} onChange={(e) => setHidden(e.target.checked)} /> {t('Hidden (not offered in builds)')}</label>
        {sure && <p className="hint bad">{t('Deleting removes the product from the price list. Builds and posts that already use it keep their copy.')}</p>}
      </div>
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

function ChangeList({ log, cats }: { log: PriceChange[]; cats?: PriceCategory[] }) {
  const ACT: Record<string, string> = { add: 'Added', remove: 'Deleted', bulk: 'Changed all by %' }
  return (
    <ul className="changes">
      {log.map((l) => (
        <li key={l.id}>
          <div className="row-sub">
            <b>{l.byName || t('Someone')}</b>
            <span className="muted">{new Date(l.at).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
            {ACT[l.act] && <Chip>{t(ACT[l.act])}</Chip>}
            {cats && <Chip>{cats.find((c) => c.id === l.cat)?.name ?? l.cat}</Chip>}
          </div>
          {cats && <div dir="auto">{l.name}</div>}
          {l.act !== 'remove' && l.act !== 'add' && (
            <div className="muted">{l.changes.map((c) => { const v = (x: string) => (c.f === 'out' ? t(x) : x) || '—'; return `${t(fieldLabel(c.f))}: ${v(c.from)} → ${v(c.to)}` }).join(' · ')}</div>
          )}
        </li>
      ))}
    </ul>
  )
}

/** The latest changes to the whole list, newest first. */
function ChangesSheet({ cats, onClose }: { cats: PriceCategory[]; onClose: () => void }) {
  const [log, setLog] = useState<PriceChange[] | null>(null)
  const [max, setMax] = useState(40)
  useEffect(() => {
    prices.history(max).then(setLog, () => setLog([]))
  }, [max])
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
