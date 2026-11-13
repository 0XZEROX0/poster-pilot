import { useMemo, useState } from 'react'
import { buildCaption, duplicatesOf, formatPrice, stageOf, toNumber, whenOf } from '../data/logic'
import { backend } from '../data/store'
import type { Data, NewPost, Post, PostItem, Product } from '../data/types'
import { t } from '../i18n'
import { Sheet } from './Sheet'
import { Icon, dayLabel, showToast } from './ui'

/** Start a post: pick 1 to 3 products by searching the product list, then price, style and time. */
export function NewPostSheet({ data, onClose }: { data: Data; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Product[]>([])
  const [priceAfter, setPriceAfter] = useState('')
  const [priceBefore, setPriceBefore] = useState('')
  const [style, setStyle] = useState(data.styles[0] ?? 'Static')
  const [captionStyle, setCaptionStyle] = useState('')
  const [details, setDetails] = useState('')
  const [postDate, setPostDate] = useState('')
  const [postTime, setPostTime] = useState('')
  const [error, setError] = useState('')

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    return data.products.filter((p) => words.every((w) => `${p.category} ${p.name} ${p.company}`.toLowerCase().includes(w)) && !picked.includes(p)).slice(0, 8)
  }, [query, data.products, picked])

  /** The list price follows the picked products until the person types their own. */
  const autoBefore = picked.reduce((sum, p) => sum + toNumber(p.price), 0)
  const before = priceBefore || (autoBefore ? String(autoBefore) : '')
  function add(p: Product) {
    if (picked.length >= 3) return
    setPicked([...picked, p])
    setQuery('')
    setError('')
  }
  const draft: NewPost = {
    items: picked.map((p): PostItem => ({ category: p.category, name: p.name, manualPhoto: '', nextPhoto: false })),
    company: [...new Set(picked.map((p) => p.company).filter(Boolean))].join(' + '),
    priceBefore: before, priceAfter, style, details, captionStyle, postDate, postTime,
  }
  // Posts that already use these products, so the same offer is not made twice by accident.
  const dup = duplicatesOf(picked.map((p) => p.name), data.posts)
  const stateOf = (p: Post) => {
    const stage = stageOf(p)
    const when = whenOf(p)
    if (stage === 'posted') return `${t('Published')}${when ? ` ${dayLabel(when.date)}` : ''}`
    if (stage === 'scheduled') return when ? `${t('Scheduled')} ${dayLabel(when.date)}` : t('Approved')
    return t(stage === 'review' ? 'To review' : stage === 'fix' ? 'Needs fixing' : stage === 'skipped' ? 'Skipped' : 'Being built')
  }
  async function create() {
    if (!picked.length) return setError(t('Pick at least one product.'))
    await backend.addPost(draft)
    showToast(t('Post created'))
    onClose()
  }

  return (
    <Sheet title={t('New post')} onClose={onClose} footer={<button className="btn btn-primary" onClick={create}><Icon name="plus" size={18} />{t(dup.same.length ? 'Create anyway' : 'Create post')}</button>}>
      <div className="form narrow">
        <label>
          <span>{t('Products')}</span>
          {picked.length > 0 && (
            <div className="picked">
              {picked.map((p) => (
                <span key={p.name} className="pick" dir="auto">
                  {p.name}
                  <button onClick={() => setPicked(picked.filter((x) => x !== p))} aria-label={t('Delete')}><Icon name="close" size={14} /></button>
                </span>
              ))}
            </div>
          )}
          {picked.length < 3 && <input type="search" placeholder={t('Search products…')} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />}
        </label>
        {query.trim() && picked.length < 3 && (
          <div className="results">
            {matches.map((p) => (
              <button key={`${p.category}${p.name}`} onClick={() => add(p)}>
                <span dir="auto">{p.name}</span>
                <span className="muted small">{p.category} · {formatPrice(p.price)} EGP</span>
              </button>
            ))}
            {!matches.length && (
              <button onClick={() => add({ category: '', name: query.trim(), price: '', company: '' })}>
                <span className="muted small">{t('No product matches. Add it as typed:')}</span>
                <span dir="auto">{query.trim()}</span>
              </button>
            )}
          </div>
        )}
        <p className="hint">{error ? <b className="bad">{error}</b> : t('Add up to 3 products.')}</p>
        {(dup.same.length > 0 || dup.partly.length > 0) && (
          <div className={dup.same.length ? 'alert' : 'alert alert-info'}>
            <b><Icon name="fix" size={18} />{t(dup.same.length ? (picked.length > 1 ? 'You already made this bundle.' : 'You already made a post for this item.') : 'Some of these items are already in other posts.')}</b>
            <ul className="dup-list">
              {[...dup.same, ...dup.partly].slice(0, 5).map((p) => (
                <li key={p.id} dir="auto">{p.items.map((i) => i.name).join(' + ')} <span className="muted">· {formatPrice(p.priceAfter || p.priceBefore)} EGP · {stateOf(p)}</span></li>
              ))}
            </ul>
          </div>
        )}
        <div className="two">
          <label><span>{t('Price before')}</span><input inputMode="numeric" dir="ltr" value={before} onChange={(e) => setPriceBefore(e.target.value)} /></label>
          <label><span>{t('Offer price (optional)')}</span><input inputMode="numeric" dir="ltr" value={priceAfter} onChange={(e) => setPriceAfter(e.target.value)} /></label>
        </div>
        <div className="two">
          <label><span>{t('Style')}</span>
            <select value={style} onChange={(e) => setStyle(e.target.value)}>{data.styles.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label><span>{t('Caption style')}</span>
            <select value={captionStyle} onChange={(e) => setCaptionStyle(e.target.value)}>
              <option value="">Default</option>
              {data.templates.filter((x) => x.name.toLowerCase() !== 'default').map((x) => <option key={x.name}>{x.name}</option>)}
            </select>
          </label>
        </div>
        <label><span>{t('Details')}</span><input dir="auto" value={details} onChange={(e) => setDetails(e.target.value)} /></label>
        <div className="two">
          <label><span>{t('Date')}</span><input type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} /></label>
          <label><span>{t('Time')}</span><input type="time" value={postTime} onChange={(e) => setPostTime(e.target.value)} /></label>
        </div>
        <p className="hint">{t('Leave empty to use the next free slot.')}</p>
        {picked.length > 0 && (
          <label>
            <span>{t('Caption preview')}</span>
            <pre className="caption-preview" dir="auto">{buildCaption(draft, data.templates)}</pre>
          </label>
        )}
      </div>
    </Sheet>
  )
}
