import { lazy, Suspense, useState } from 'react'
import { buildCaption, cairoNow, formatPrice, itemName, listPriceOf, maxItems, nextFreeSlot, placesOf, postsFromApp, priceIssues, stageOf, titleOf, waitsInApp, whenOf } from '../data/logic'
import { allowed, backend, isOwner, myId, myName, ownOffer } from '../data/store'
import type { Data, Post, PostItem, PostPlaces, Product } from '../data/types'
import { t } from '../i18n'
import { customProblem, MediaPicker, PlacesPicker } from './CustomPost'
import { problemText } from './FixView'
import { PostHistory } from './History'
import { ResultsBox } from './Results'
import { PhotoPicker } from './PhotoPicker'
import { Poster } from './Poster'
import { ProductSearch } from './ProductSearch'
import { ignorePrice, mayIgnorePrice, unignorePrice } from './PriceCheck'
import { StageChip } from './PostRow'
import { STORIES_ON, StoryBox } from './StoryBox'
import { Sheet } from './Sheet'
import { Icon, showToast } from './ui'

// The story editor (and its drawing library) loads only when it is opened.
const StoryEditor = lazy(() => import('./StoryEditor'))

/** One post in full: its poster, every field that can be changed, and the actions for its stage. */
export function PostSheet({ post, data, onClose }: { post: Post; data: Data; onClose: () => void }) {
  const [draft, setDraft] = useState(post)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmPost, setConfirmPost] = useState(false)
  const [confirmTakeDown, setConfirmTakeDown] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [designing, setDesigning] = useState(false)
  // The offer editor: which item is being swapped for another product (-1: none), and whether a product is being added.
  const [swapping, setSwapping] = useState(-1)
  const [adding, setAdding] = useState(false)
  // Price before follows the products until the person types their own.
  const [ownBefore, setOwnBefore] = useState(false)
  const stage = stageOf(post)
  // A text, photo or video post: no poster, no prices; its caption, files and places are edited here.
  const custom = post.kind
  const posted = stage === 'posted'
  const problem = problemText(post)
  // Only a post that Facebook does not hold yet can be deleted from here.
  const onFacebook = /^scheduled/i.test(post.fbStatus) || post.fbPostId !== ''
  const locked = !posted && (/^scheduled/i.test(post.fbStatus) || post.fbPostId !== '')
  const set = (patch: Partial<Post>) => setDraft((d) => ({ ...d, ...patch }))
  const setItem = (i: number, patch: Partial<Post['items'][number]>) => set({ items: draft.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) })
  /**
   * A new list of products for the offer. Each item gets its place again (1, 2, 3...), so the poster shows them in this
   * order, and Price before is worked out from the price list the same way the engine does (unless the person typed one).
   */
  function setItems(items: PostItem[]) {
    const next = items.map((it, i) => ({ ...it, slot: i + 1 }))
    const same = JSON.stringify(next.map(({ category, name }) => [category, name])) === JSON.stringify(post.items.map(({ category, name }) => [category, name]))
    const auto = same ? post.priceBefore : listPriceOf(next, data.products, post.variants).priceBefore
    setDraft((d) => ({ ...d, items: same ? post.items : next, ...(ownBefore ? {} : { priceBefore: auto }) }))
    setSwapping(-1)
    setAdding(false)
  }
  // A product from the list in place of item i: its photo choices start again; a version name is kept only for the same product.
  const fresh = (p: Product, old?: PostItem): PostItem => ({ category: p.category, name: p.name, manualPhoto: '', nextPhoto: false, ...(old?.label !== undefined && old.name === p.name ? { label: old.label } : {}) })
  // The same product under its price list name (it was renamed in the list): photo, version name and place are kept.
  const relink = (i: number, p: Product) => setItems(draft.items.map((it, k) => {
    if (k !== i) return it
    const { photoMissing: _gone, ...rest } = it
    return { ...rest, category: p.category, name: p.name }
  }))
  const swapItem = (i: number, p: Product) => setItems(draft.items.map((it, k) => (k === i ? fresh(p, it) : it)))
  const removeItem = (i: number) => setItems(draft.items.filter((_, k) => k !== i))
  const addItem = (p: Product) => setItems([...draft.items, fresh(p)])

  /** Only the fields the person changed, so nothing else is touched. */
  function changes(): Partial<Post> {
    const out: Partial<Post> = {}
    for (const key of ['priceBefore', 'priceAfter', 'style', 'details', 'postDate', 'postTime', 'caption', 'captionStyle'] as const) if (draft[key] !== post[key]) out[key] = draft[key]
    if (JSON.stringify(draft.items) !== JSON.stringify(post.items)) out.items = draft.items
    // A new date or time replaces a "Post now" the engine has not carried out yet.
    if (post.postNow && ('postDate' in out || 'postTime' in out)) out.postNow = ''
    if (post.variants && (draft.title ?? '') !== (post.title ?? '')) out.title = draft.title ?? ''
    if (custom && JSON.stringify(draft.media ?? []) !== JSON.stringify(post.media ?? [])) out.media = draft.media ?? []
    if (custom && (draft.places ?? 'fb+ig') !== (post.places ?? 'fb+ig')) out.places = draft.places ?? 'fb+ig'
    // The story choice: where it goes and how long after the post.
    if ((draft.story ?? '') !== (post.story ?? '')) out.story = draft.story ?? ''
    if ((draft.storyDelay ?? '') !== (post.storyDelay ?? '')) out.storyDelay = draft.storyDelay ?? ''
    return out
  }
  async function save(extra: Partial<Post>, message: string) {
    const patch = { ...changes(), ...extra }
    if (custom) {
      const missing = customProblem(custom, draft.caption, draft.media ?? [])
      if (missing) return showToast(t(missing))
    }
    // A new price or style means a new poster, as in the sheet.
    if (!extra.feedback && !posted && stage !== 'offer' && ('priceBefore' in patch || 'priceAfter' in patch || 'style' in patch || 'items' in patch || 'title' in patch)) patch.feedback = 'Redo'
    if (Object.keys(patch).length) await backend.updatePost(post.id, patch)
    showToast(t(message))
    onClose()
  }
  /**
   * "Post now": after the person confirms, the engine publishes the post on Facebook and Instagram at once instead of
   * scheduling it. The time sent is the moment of the press; the engine replaces it with the minute it really went out.
   * Only unsaved-free, approved posts that Facebook does not hold yet can be posted this way (the button is hidden otherwise).
   */
  async function postNow() {
    setBusy(true)
    try {
      const now = cairoNow()
      await backend.updatePost(post.id, { postNow: 'yes', postDate: now.date, postTime: now.time })
      showToast(t('Posting now on Facebook and Instagram'))
      onClose()
    } catch {
      showToast(t('Could not ask for Post now. Try again.'))
      setBusy(false)
    }
  }
  /**
   * "Delete from Facebook and Instagram": after the person types the confirm word, the engine deletes the published
   * Page post and the Instagram post. The post itself stays in the app, marked as removed.
   */
  async function takeDown() {
    setBusy(true)
    try {
      await backend.updatePost(post.id, { takeDown: 'asked', takeDownAt: Date.now(), takeDownBy: myName() })
      showToast(t('Being removed from Facebook and Instagram'))
      setConfirmTakeDown(false)
      setTyped('')
    } catch {
      showToast(t('Could not ask for the delete. Try again.'))
    } finally {
      setBusy(false)
    }
  }
  /** A story that failed: the same choice is sent again, and the engine tries the places that did not get it. */
  async function retryStory() {
    await backend.updatePost(post.id, { story: post.story ?? '', storyDelay: post.storyDelay ?? '' })
    showToast(t('The story will be tried again'))
  }
  async function remove() {
    await backend.removePost(post.id)
    showToast(t('Deleted'))
    onClose()
  }
  /** The website photo chosen in the picker becomes the item's photo link, and the poster is made again with it. */
  async function choosePhoto(i: number, src: string) {
    setBusy(true)
    const items = draft.items.map((it, k) => (k === i ? { ...it, manualPhoto: src, nextPhoto: false } : it))
    try {
      if (stage === 'offer') await save({ items }, 'Photo saved. The poster will use it.')
      else await save({ items, feedback: 'Redo' }, 'The poster is being made again with this photo')
    } finally {
      setBusy(false)
    }
  }
  const useNextSlot = () => {
    const slot = nextFreeSlot(data.posts.filter((p) => p.id !== post.id))
    set({ postDate: slot.date, postTime: slot.time })
  }
  const when = whenOf(post)
  const mayReview = allowed('designs.approve')
  const mayPlan = allowed('schedule')
  // Management ('Manage all offers') may edit and delete any offer at any stage before it is posted.
  const mayManage = allowed('offers.manage')
  const mayEdit = allowed('offers.create') || allowed('fix') || mayReview || mayManage || (!!custom && mayPlan)
  const dirty = Object.keys(changes()).length > 0
  // Changing which products are in the offer: the maker (or anyone who may make offers) while it waits for approval;
  // after approval only someone who may approve offers or posters, or management, so an approved offer is not changed behind their back.
  const mayChangeItems = !posted && !custom && (stage === 'offer' ? mayEdit : allowed('offers.approve') || mayReview || mayManage)
  const itemsChanged = JSON.stringify(draft.items.map((it) => [it.category, it.name])) !== JSON.stringify(post.items.map((it) => [it.category, it.name]))
  const priceChanged = draft.priceBefore !== post.priceBefore || draft.priceAfter !== post.priceAfter
  // Items the price list cannot price, worked out on the unsaved changes so the warning goes away once fixed.
  const prices = priceIssues({ ...post, items: draft.items, priceBefore: draft.priceBefore }, data.products)
  const listBefore = listPriceOf(draft.items, data.products, post.variants).priceBefore
  // Post now: an approved post with its poster, not on Facebook yet, no unsaved changes, not already asked for.
  const mayPostNow = mayPlan && stage === 'scheduled' && post.feedback === 'Done' && !onFacebook && post.postNow !== 'yes' && (custom ? !/^posting/i.test(post.igStatus) : !!post.posterUrl) && !dirty
  const where = custom ? placesOf(draft).map((w) => (w === 'fb' ? 'Facebook' : 'Instagram')).join(t(' and ')) : t('Facebook and Instagram')
  // Delete from Facebook and Instagram: a published post, not asked for already (a failed try can be asked again).
  const removing = post.takeDown === 'asked' || post.takeDown === 'working'
  const removed = post.takeDown === 'done'
  // The engine finds the post by its Facebook post; a post that went to Instagram only is not taken down from here.
  const mayTakeDown = posted && allowed('social.delete') && !removing && !removed && post.fbStatus.trim() === 'Published'
  const confirmWord = /^(delete|حذف)$/i.test(typed.trim())

  const footer = posted ? (
    <>
      {dirty && <button className="btn btn-primary" onClick={() => save({}, 'Saved')}>{t('Save')}</button>}
      {post.fbPostId && !removed && <a className={dirty ? 'btn' : 'btn btn-primary'} href={`https://www.facebook.com/${post.fbPostId}`} target="_blank" rel="noreferrer"><Icon name="link" size={18} />{t('Open on Facebook')}</a>}
    </>
  ) : (
    <>
      {stage === 'offer' ? (
        <>
          {mayEdit && <button className="btn btn-primary" disabled={!dirty} onClick={() => save({}, 'Saved')}>{t('Save')}</button>}
          {post.offer !== 'Rejected' && allowed('offers.approve') && !ownOffer(post) && (
            <button className="btn" onClick={() => save({ offer: 'Approved', offerBy: myName(), offerNote: '' }, 'Offer approved. The poster is being made.')}><Icon name="check" size={18} />{t('Approve offer')}</button>
          )}
          {post.offer === 'Rejected' && (isOwner() || post.createdBy === myId()) && (
            <button className="btn" onClick={() => save({ offer: '' }, 'Sent for approval again')}><Icon name="redo" size={18} />{t('Send again')}</button>
          )}
        </>
      ) : stage === 'fix' || stage === 'building' ? (
        <>
          {mayEdit && !custom && <button className="btn btn-primary" onClick={() => save({ feedback: 'Redo' }, 'Sent for redo')}><Icon name="redo" size={18} />{t('Retry')}</button>}
          {/* The engine clears the error when the post is approved again, and tries once more. */}
          {custom && (mayReview || mayPlan) && <button className="btn btn-primary" onClick={() => save({ feedback: 'Done' }, 'It will be tried again')}><Icon name="redo" size={18} />{t('Try again')}</button>}
          {dirty && <button className="btn" onClick={() => save({}, 'Saved')}>{t('Save')}</button>}
          {mayPlan && post.feedback === 'Done' && (onFacebook || when) && (
            <button className="btn" onClick={() => save({ feedback: 'Cancel' }, 'Schedule cancelled. The post stays approved.')}>{t('Cancel schedule')}</button>
          )}
        </>
      ) : stage === 'scheduled' && confirmPost ? (
        <div className="confirm-post" role="alertdialog" aria-labelledby="confirm-post-q">
          <p id="confirm-post-q"><b>{custom ? `${t('Publish now on')} ${where}?` : t('Publish to Facebook and Instagram now?')}</b><br /><span className="muted small">{t('It goes out within a minute and cannot be taken back from here.')}{STORIES_ON && post.story ? ` ${t('Its story goes out too.')}` : ''}</span></p>
          <div className="confirm-post-actions">
            <button className="btn btn-primary" disabled={busy} onClick={postNow}><Icon name="send" size={18} />{t('Yes, post now')}</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirmPost(false)}>{t('Cancel')}</button>
          </div>
        </div>
      ) : stage === 'scheduled' ? (
        <>
          <button className="btn btn-primary" disabled={!dirty} onClick={() => save({}, 'Saved')}>{t('Save')}</button>
          {mayPostNow && <button className="btn" onClick={() => setConfirmPost(true)}><Icon name="send" size={18} />{t('Post now')}</button>}
          {/* The engine takes the post off Facebook, empties its date and time and leaves it approved. */}
          {mayPlan && post.feedback !== 'Cancel' && (onFacebook || when) && (
            <button className="btn" onClick={() => save({ feedback: 'Cancel' }, 'Schedule cancelled. The post stays approved.')}>{t('Cancel schedule')}</button>
          )}
          {mayReview && post.feedback !== 'Cancel' && !onFacebook && (
            <button className="btn btn-ghost" onClick={() => save({ feedback: '' }, 'Saved')}>{t('Back to review')}</button>
          )}
        </>
      ) : (
        <>
          {mayReview && <button className="btn btn-primary" onClick={() => save({ feedback: 'Done' }, draft.postDate && draft.postTime ? 'Approved' : 'Approved. Give it a time in the Planner.')}><Icon name="check" size={18} />{t('Approve')}</button>}
          {mayEdit && !custom && <button className="btn" onClick={() => save({ feedback: 'Redo' }, 'Sent for redo')}><Icon name="redo" size={18} />{t('Redo')}</button>}
          {dirty ? <button className="btn btn-ghost" onClick={() => save({}, 'Saved')}>{t('Save')}</button> : mayReview && <button className="btn btn-ghost" onClick={() => save({ feedback: 'ignore' }, 'Skipped')}>{t('Skip')}</button>}
        </>
      )}
    </>
  )

  return (
    <Sheet title={titleOf(post)} onClose={onClose} footer={footer}>
      <div className="post-grid">
        <div>
          <Poster post={post} zoom />
          <p className="post-state"><StageChip post={post} />{when && posted && <span className="muted small">{when.date} · {when.time}</span>}</p>
        </div>
        <div className="form">
          {posted && <ResultsBox postId={post.id} results={data.results} />}
          {post.offer === 'Rejected' && <div className="alert"><b><Icon name="fix" size={18} />{t('Offer sent back')}{post.offerBy ? ` · ${post.offerBy}` : ''}</b>{post.offerNote && <p dir="auto">{post.offerNote}</p>}</div>}
          {problem && (
            <div className="alert">
              <b><Icon name="fix" size={18} />{problem.title}</b>
              <p>{problem.advice}</p>
            </div>
          )}
          {prices.ignored && !itemsChanged && (
            <p className="hint">
              {t('No Price before, ignored.')}{' '}
              {mayIgnorePrice() && <button type="button" className="link" onClick={() => unignorePrice(post)}>{t('Show the warning again')}</button>}
            </p>
          )}
          {prices.missing && (
            <div className="alert" role="status">
              <b><Icon name="fix" size={18} />{t('Price before is missing')}</b>
              {prices.items.length > 0 ? (
                <>
                  <p>{t('The price list has no product with this exact name, so the old price cannot show on the poster.')}</p>
                  <ul className="price-fixes">
                    {prices.items.map(({ index, item, reason, suggestion }) => (
                      <li key={index}>
                        <span dir="auto"><b>{itemName(item)}</b> · {t(reason === 'no-price' ? 'in the price list without a price' : 'not in the price list')}</span>
                        {mayChangeItems && suggestion && (
                          <button type="button" className="btn btn-small" onClick={() => relink(index, suggestion)}>
                            <Icon name="check" size={16} /><span dir="auto">{t('Use')} {suggestion.name} · {formatPrice(suggestion.price)} EGP</span>
                          </button>
                        )}
                        {mayChangeItems && <button type="button" className="link" onClick={() => { setSwapping(index); setAdding(false) }}>{t(suggestion ? 'Pick another product' : 'Pick the product from the list')}</button>}
                      </li>
                    ))}
                  </ul>
                  {!mayChangeItems && <p className="muted small">{t('Ask someone who approves offers to fix the product name.')}</p>}
                </>
              ) : (
                <p>
                  {t('Type the Price before below.')}{' '}
                  {/[1-9]/.test(listBefore) && <button type="button" className="link" onClick={() => set({ priceBefore: listBefore })}>{t('Use the list price')} {formatPrice(listBefore)} EGP</button>}
                </p>
              )}
              {mayIgnorePrice() && !itemsChanged && <button type="button" className="link price-ignore" onClick={() => ignorePrice(post)}><Icon name="close" size={16} />{t('Ignore: this post is fine without a Price before')}</button>}
            </div>
          )}
          {!posted && post.variants && (
            <label><span>{t('Name on the poster')}</span><input dir="auto" value={draft.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></label>
          )}
          {!posted && draft.items.map((it, i) => (
            <fieldset key={i} className={`item-box${it.photoMissing && problem ? ' item-missing' : ''}`}>
              <legend dir="auto">{itemName(it)}</legend>
              {mayChangeItems && (
                <div className="item-tools">
                  <button type="button" className="link" onClick={() => { setSwapping(swapping === i ? -1 : i); setAdding(false) }}><Icon name="redo" size={16} />{t(swapping === i ? 'Keep this product' : 'Change product')}</button>
                  {draft.items.length > 1 && <button type="button" className="link link-danger" onClick={() => removeItem(i)}><Icon name="close" size={16} />{t('Remove from the offer')}</button>}
                </div>
              )}
              {swapping === i && <ProductSearch products={data.products} skip={draft.items.filter((_, k) => k !== i).map((x) => x.name)} onPick={(p) => swapItem(i, p)} autoFocus placeholder={t('Search the product to put in its place…')} />}
              {post.variants && it.label !== undefined && (
                <label><span>{t('Version name')}</span><input dir="auto" value={it.label} placeholder={t('Colour or name, e.g. Jungle Panda')} onChange={(e) => setItem(i, { label: e.target.value })} /></label>
              )}
              {it.photoMissing && problem && <p className="problem-title"><Icon name="fix" size={16} />{t('No photo was found for this item.')}</p>}
              <label>
                <span>{t('Photo link')}</span>
                <input type="url" inputMode="url" dir="ltr" placeholder={t('Paste a photo link for this product')} value={it.manualPhoto} onChange={(e) => setItem(i, { manualPhoto: e.target.value.trim() })} />
              </label>
              <label className="check">
                <input type="checkbox" checked={it.nextPhoto} onChange={(e) => setItem(i, { nextPhoto: e.target.checked })} />
                <span>{t('Try the next photo')}</span>
              </label>
              {/* The website photos are looked up for the saved product, so a product just swapped in waits for Save. */}
              {mayEdit && post.items[i]?.name === it.name && post.items[i]?.category === it.category && <PhotoPicker post={post} index={i} current={photoInUse(post, i)} busy={busy} onPick={(src) => choosePhoto(i, src)} />}
            </fieldset>
          ))}
          {mayChangeItems && draft.items.length < maxItems(post.variants) && (
            adding ? (
              <div className="form-group">
                <ProductSearch products={data.products} skip={draft.items.map((x) => x.name)} onPick={addItem} autoFocus />
                <button type="button" className="link" onClick={() => setAdding(false)}>{t('Cancel')}</button>
              </div>
            ) : (
              <button type="button" className="btn btn-ghost add-item" onClick={() => { setAdding(true); setSwapping(-1) }}><Icon name="plus" size={18} />{t('Add a product')}</button>
            )
          )}
          {mayChangeItems && stage !== 'offer' && (itemsChanged || priceChanged) && (
            <p className="hint">{t(onFacebook ? 'Saving makes a new poster. It comes back to Review, and its old version is taken off the Facebook schedule. Approve it again to keep its time.' : 'Saving makes a new poster. It comes back to Review; its date and time stay.')}</p>
          )}
          {!posted && custom && (
            <>
              {custom !== 'text' && <MediaPicker kind={custom} toInstagram={placesOf(draft).includes('ig')} value={draft.media ?? []} disabled={!mayEdit} onChange={(media) => set({ media })} />}
              <PlacesPicker kind={custom} value={draft.places ?? 'fb+ig'} disabled={!mayEdit} onChange={(places: PostPlaces) => set({ places })} />
              {locked && <p className="hint">{t('A change here takes the post off the Facebook schedule and schedules it again with the change.')}</p>}
            </>
          )}
          {!posted && (
            <>
              {!custom && <>
              <div className="two">
                <label><span>{t('Price before')}</span><input inputMode="numeric" dir="ltr" value={draft.priceBefore} onChange={(e) => { setOwnBefore(true); set({ priceBefore: e.target.value }) }} /></label>
                <label><span>{t('Price after')}</span><input inputMode="numeric" dir="ltr" value={draft.priceAfter} onChange={(e) => set({ priceAfter: e.target.value })} /></label>
              </div>
              <div className="two">
                <label><span>{t('Style')}</span>
                  <select value={draft.style} onChange={(e) => set({ style: e.target.value })}>
                    {[...new Set([draft.style, ...data.styles])].filter(Boolean).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label><span>{t('Caption style')}</span>
                  <select value={draft.captionStyle} onChange={(e) => set({ captionStyle: e.target.value })}>
                    <option value="">Default</option>
                    {data.templates.filter((x) => x.name.toLowerCase() !== 'default').map((x) => <option key={x.name}>{x.name}</option>)}
                  </select>
                </label>
              </div>
              </>}
              <div className="two">
                <label><span>{t('Date')}</span><input type="date" disabled={!mayPlan} value={draft.postDate} onChange={(e) => set({ postDate: e.target.value })} /></label>
                <label><span>{t('Time')}</span><input type="time" disabled={!mayPlan} value={draft.postTime} onChange={(e) => set({ postTime: e.target.value })} /></label>
              </div>
              <p className="hint">
                {t('A post goes out only when it has a date and a time. You can also set them in the Planner.')} {mayPlan && <button className="link" onClick={useNextSlot}>{t('Next free slot')}</button>}
              </p>
              {!posted && (waitsInApp(post) || postsFromApp(draft.postDate, draft.postTime)) && (
                <p className="hint">{t("Less than 30 minutes away: Facebook won't hold it on its schedule, so the app posts it on Facebook and Instagram at that minute.")}</p>
              )}
            </>
          )}
          {STORIES_ON && !custom && stage !== 'offer' && (mayPlan || post.story) && <StoryBox post={post} draft={draft} canEdit={mayPlan} onChange={set} onRetry={retryStory} onDesign={() => setDesigning(true)} />}
          {designing && <Suspense fallback={null}><StoryEditor post={post} onClose={() => setDesigning(false)} /></Suspense>}
          <label>
            <span>{t(custom === 'text' ? 'Text' : 'Caption')}</span>
            <textarea dir="auto" rows={9} readOnly={posted} value={draft.caption} onChange={(e) => set({ caption: e.target.value })} />
          </label>
          {!posted && !custom && <button className="link" onClick={() => set({ caption: buildCaption(draft, data.templates) })}>{t('Rebuild from template')}</button>}
          {posted && (removing || removed || post.takeDown === 'failed') && (
            <div className={post.takeDown === 'failed' ? 'alert' : 'note-box'} role="status">
              <b><Icon name={removed ? 'check' : post.takeDown === 'failed' ? 'fix' : 'send'} size={18} />{t(removed ? 'Removed from Facebook and Instagram' : post.takeDown === 'failed' ? 'Not fully removed from Facebook and Instagram' : 'Being removed from Facebook and Instagram')}</b>
              {post.takeDownNote && <p className="small" dir="ltr">{post.takeDownNote}</p>}
              {post.takeDownBy && <p className="muted small">{t('Asked by')} {post.takeDownBy}</p>}
            </div>
          )}
          <PostHistory postId={post.id} />
          {mayTakeDown && (
            <div className="danger danger-social">
              {confirmTakeDown ? (
                <div className="confirm-takedown" role="alertdialog" aria-labelledby="confirm-takedown-q">
                  <p id="confirm-takedown-q"><b>{t('Delete this post from Facebook and Instagram?')}</b></p>
                  <p className="small">{t('It is removed from the Facebook Page and from Instagram for good, with its likes and comments. This cannot be undone. The post stays here in the app.')}</p>
                  <label>
                    <span>{t('Type DELETE to confirm')}</span>
                    <input dir="ltr" autoComplete="off" autoCapitalize="characters" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" />
                  </label>
                  <div className="confirm-post-actions">
                    <button className="btn btn-danger" disabled={busy || !confirmWord || dirty} onClick={takeDown}><Icon name="trash" size={18} />{t('Delete from Facebook and Instagram')}</button>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => { setConfirmTakeDown(false); setTyped('') }}>{t('Cancel')}</button>
                  </div>
                  {dirty && <p className="muted small">{t('Save or undo your changes first.')}</p>}
                </div>
              ) : (
                <button className="link link-danger" onClick={() => setConfirmTakeDown(true)}><Icon name="trash" size={16} />{t(post.takeDown === 'failed' ? 'Try deleting from Facebook and Instagram again' : 'Delete from Facebook and Instagram')}</button>
              )}
            </div>
          )}
          {(allowed('delete') || mayManage) && (
            <div className="danger">
              {locked ? (
                <span className="muted">{t('This post is already on the schedule, so it cannot be deleted here.')}{mayPlan ? ` ${t('Cancel its schedule first, then delete it.')}` : ''}</span>
              ) : confirmDelete ? (
                <>
                  <span>{t('Delete this post?')}{posted && !removed ? ` ${t('It stays on Facebook and Instagram.')}` : ''}</span>
                  <button className="btn btn-danger" onClick={remove}>{t('Delete')}</button>
                  <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>{t('Cancel')}</button>
                </>
              ) : (
                <button className="link link-danger" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} />{t('Delete')}</button>
              )}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}

/** The photo link the poster used for item `i`: the person's own link, else the one the engine wrote (one line per item). */
function photoInUse(post: Post, i: number) {
  const own = post.items[i]?.manualPhoto
  if (own) return own
  const lines = String((post as Post & { ex?: { productImage?: string } }).ex?.productImage ?? '').split('\n')
  return (lines[i] ?? '').trim()
}
