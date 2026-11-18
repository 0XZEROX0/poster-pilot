import { useState } from 'react'
import { buildCaption, commonTitle, duplicatesOf, formatPrice, maxItems, stageOf, toNumber, whenOf } from '../data/logic'
import { allowed, backend } from '../data/store'
import type { Data, NewPost, Post, PostItem, Product } from '../data/types'
import { t } from '../i18n'
import { ProductSearch } from './ProductSearch'
import { Sheet } from './Sheet'
import { STORIES_ON, storyByDefault } from './StoryBox'
import { Icon, dayLabel, showToast } from './ui'
import { VersionPicker, type PickedVersion } from './VersionPicker'

/** Start a post: pick 1 to 3 products (or up to 4 versions of one product) by searching the product list, then price, style and time. */
// Text, photo and video posts are made in the Planner (NewCustomPostSheet), by the people who schedule.
export function NewPostSheet({ data, onClose }: { data: Data; onClose: () => void }) {
  const [picked, setPicked] = useState<Product[]>([])
  // Versions of one product (colours, switches...): one name and one price on the poster, up to 4 items.
  const [variants, setVariants] = useState(false)
  const [title, setTitle] = useState('')
  // Versions tapped on the website photos of the first picked product. When there are any, they are the post's items.
  const [versions, setVersions] = useState<PickedVersion[]>([])
  const max = maxItems(variants)
  const [priceAfter, setPriceAfter] = useState('')
  const [priceBefore, setPriceBefore] = useState('')
  const [style, setStyle] = useState(data.styles[0] ?? 'Static')
  const [captionStyle, setCaptionStyle] = useState('')
  const [details, setDetails] = useState('')
  const [postDate, setPostDate] = useState('')
  const [postTime, setPostTime] = useState('')
  const [story, setStory] = useState(() => allowed('schedule') && storyByDefault())
  const [error, setError] = useState('')

  /** The list price follows the picked products until the person types their own. */
  // Versions: the poster shows one price, the highest of them (same rule as the engine).
  const fromPhotos = variants && versions.length > 0 && picked.length > 0
  const autoBefore = fromPhotos ? toNumber(picked[0].price) : variants ? Math.max(0, ...picked.map((p) => toNumber(p.price))) : picked.reduce((sum, p) => sum + toNumber(p.price), 0)
  const before = priceBefore || (autoBefore ? String(autoBefore) : '')
  function add(p: Product) {
    if (picked.length >= max) return
    setPicked([...picked, p])
    setError('')
  }
  // From photos: every version keeps the price list name (so the price check finds it), its own photo and its version name.
  const items: PostItem[] = fromPhotos
    ? versions.map((v) => ({ category: picked[0].category, name: picked[0].name, manualPhoto: v.src, nextPhoto: false, ...(v.label.trim() ? { label: v.label.trim() } : {}) }))
    : picked.map((p): PostItem => ({ category: p.category, name: p.name, manualPhoto: '', nextPhoto: false }))
  const draft: NewPost = {
    items,
    ...(variants ? { variants: true, title: title.trim() || (fromPhotos ? picked[0].name : commonTitle(picked.map((p) => p.name))) } : {}),
    company: [...new Set((fromPhotos ? picked.slice(0, 1) : picked).map((p) => p.company).filter(Boolean))].join(' + '),
    priceBefore: before, priceAfter, style, details, captionStyle, postDate, postTime,
    ...(STORIES_ON && story ? { story: 'fb+ig' as const } : {}),
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
    if (variants && items.length < 2) return setError(t(picked.length === 1 ? 'Tap at least 2 versions on the website photos.' : 'Pick at least 2 versions.'))
    if (picked.length > max) return setError(t('Up to 3 products. Tick "Versions of one product" for 4.'))
    await backend.addPost(draft)
    showToast(t('Post created'))
    onClose()
  }

  return (
    <Sheet title={t('New offer')} onClose={onClose} footer={<button className="btn btn-primary" onClick={create}><Icon name="plus" size={18} />{t(dup.same.length ? 'Create anyway' : 'Create offer')}</button>}>
      <div className="form narrow">
        <label>
          <span>{t('Products')}</span>
          {picked.length > 0 && (
            <div className="picked">
              {picked.map((p) => (
                <span key={p.name} className="pick" dir="auto">
                  {p.name}
                  <button onClick={() => { setPicked(picked.filter((x) => x !== p)); if (p === picked[0]) setVersions([]) }} aria-label={t('Delete')}><Icon name="close" size={14} /></button>
                </span>
              ))}
            </div>
          )}
          {picked.length < max && !fromPhotos && <ProductSearch products={data.products} skip={picked.map((p) => p.name)} onPick={add} autoFocus />}
        </label>
        <p className="hint">{error ? <b className="bad">{error}</b> : t(variants ? 'Pick the product, then tap its versions on the website photos. Or add up to 4 products from the list.' : 'Add up to 3 products.')}</p>
        <label className="check">
          <input type="checkbox" checked={variants} onChange={(e) => { setVariants(e.target.checked); setError('') }} />
          <span>{t('Versions of one product (colours, switches…): one name and one price, up to 4')}</span>
        </label>
        {variants && picked.length > 0 && (picked.length === 1 || fromPhotos) && (
          <VersionPicker product={picked[0].name} max={max} value={versions} onChange={(v) => { setVersions(v); setError('') }} />
        )}
        {variants && (
          <label><span>{t('Name on the poster')}</span><input dir="auto" value={title} placeholder={(fromPhotos ? picked[0].name : commonTitle(picked.map((p) => p.name))) || t('Product name')} onChange={(e) => setTitle(e.target.value)} /></label>
        )}
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
        <p className="hint">{t('A post goes out only when it has a date and a time. You can also set them in the Planner.')}</p>
        {STORIES_ON && allowed('schedule') && (
          <label className="check">
            <input type="checkbox" checked={story} onChange={(e) => setStory(e.target.checked)} />
            <span>{t('Also post as a story')} (Facebook + Instagram)</span>
          </label>
        )}
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
