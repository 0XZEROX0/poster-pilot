import { useState } from 'react'
import { buildCaption, nextFreeSlot, stageOf, titleOf, whenOf } from '../data/logic'
import { backend } from '../data/store'
import type { Data, Post } from '../data/types'
import { t } from '../i18n'
import { problemText } from './FixView'
import { Poster } from './Poster'
import { StageChip } from './PostRow'
import { Sheet } from './Sheet'
import { Icon, showToast } from './ui'

/** One post in full: its poster, every field that can be changed, and the actions for its stage. */
export function PostSheet({ post, data, onClose }: { post: Post; data: Data; onClose: () => void }) {
  const [draft, setDraft] = useState(post)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const stage = stageOf(post)
  const posted = stage === 'posted'
  const problem = problemText(post)
  const set = (patch: Partial<Post>) => setDraft((d) => ({ ...d, ...patch }))
  const setItem = (i: number, patch: Partial<Post['items'][number]>) => set({ items: draft.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) })

  /** Only the fields the person changed, so nothing else is touched. */
  function changes(): Partial<Post> {
    const out: Partial<Post> = {}
    for (const key of ['priceBefore', 'priceAfter', 'style', 'details', 'postDate', 'postTime', 'caption', 'captionStyle'] as const) if (draft[key] !== post[key]) out[key] = draft[key]
    if (JSON.stringify(draft.items) !== JSON.stringify(post.items)) out.items = draft.items
    return out
  }
  async function save(extra: Partial<Post>, message: string) {
    const patch = { ...changes(), ...extra }
    // A new price or style means a new poster, as in the sheet.
    if (!extra.feedback && !posted && ('priceBefore' in patch || 'priceAfter' in patch || 'style' in patch || 'items' in patch)) patch.feedback = 'Redo'
    if (Object.keys(patch).length) await backend.updatePost(post.id, patch)
    showToast(t(message))
    onClose()
  }
  async function remove() {
    await backend.removePost(post.id)
    showToast(t('Deleted'))
    onClose()
  }
  const useNextSlot = () => {
    const slot = nextFreeSlot(data.posts.filter((p) => p.id !== post.id))
    set({ postDate: slot.date, postTime: slot.time })
  }
  const when = whenOf(post)
  const dirty = Object.keys(changes()).length > 0

  const footer = posted ? (
    post.fbPostId && <a className="btn btn-primary" href={`https://www.facebook.com/${post.fbPostId}`} target="_blank" rel="noreferrer"><Icon name="link" size={18} />{t('Open on Facebook')}</a>
  ) : (
    <>
      {stage === 'fix' || stage === 'building' ? (
        <button className="btn btn-primary" onClick={() => save({ feedback: 'Redo' }, 'Sent for redo')}><Icon name="redo" size={18} />{t('Retry')}</button>
      ) : stage === 'scheduled' ? (
        <>
          <button className="btn btn-primary" disabled={!dirty} onClick={() => save({}, 'Saved')}>{t('Save')}</button>
          <button className="btn" onClick={() => save({ feedback: '' }, 'Saved')}>{t('Back to review')}</button>
        </>
      ) : (
        <>
          <button className="btn btn-primary" onClick={() => save({ feedback: 'Done' }, 'Approved')}><Icon name="check" size={18} />{t('Approve')}</button>
          <button className="btn" onClick={() => save({ feedback: 'Redo' }, 'Sent for redo')}><Icon name="redo" size={18} />{t('Redo')}</button>
          {dirty ? <button className="btn btn-ghost" onClick={() => save({}, 'Saved')}>{t('Save')}</button> : <button className="btn btn-ghost" onClick={() => save({ feedback: 'ignore' }, 'Skipped')}>{t('Skip')}</button>}
        </>
      )}
    </>
  )

  return (
    <Sheet title={titleOf(post)} onClose={onClose} footer={footer}>
      <div className="post-grid">
        <div>
          <Poster post={post} />
          <p className="post-state"><StageChip post={post} />{when && posted && <span className="muted small">{when.date} · {when.time}</span>}</p>
        </div>
        <div className="form">
          {problem && (
            <div className="alert">
              <b><Icon name="fix" size={18} />{problem.title}</b>
              <p>{problem.advice}</p>
            </div>
          )}
          {!posted && draft.items.map((it, i) => (
            <fieldset key={i} className="item-box">
              <legend dir="auto">{it.name}</legend>
              <label>
                <span>{t('Photo link')}</span>
                <input type="url" inputMode="url" dir="ltr" placeholder={t('Paste a photo link for this product')} value={it.manualPhoto} onChange={(e) => setItem(i, { manualPhoto: e.target.value.trim() })} />
              </label>
              <label className="check">
                <input type="checkbox" checked={it.nextPhoto} onChange={(e) => setItem(i, { nextPhoto: e.target.checked })} />
                <span>{t('Try the next photo')}</span>
              </label>
            </fieldset>
          ))}
          {!posted && (
            <>
              <div className="two">
                <label><span>{t('Price before')}</span><input inputMode="numeric" dir="ltr" value={draft.priceBefore} onChange={(e) => set({ priceBefore: e.target.value })} /></label>
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
              <div className="two">
                <label><span>{t('Date')}</span><input type="date" value={draft.postDate} onChange={(e) => set({ postDate: e.target.value })} /></label>
                <label><span>{t('Time')}</span><input type="time" value={draft.postTime} onChange={(e) => set({ postTime: e.target.value })} /></label>
              </div>
              <p className="hint">
                {t('Leave empty to use the next free slot.')} <button className="link" onClick={useNextSlot}>{t('Next free slot')}</button>
              </p>
            </>
          )}
          <label>
            <span>{t('Caption')}</span>
            <textarea dir="auto" rows={9} readOnly={posted} value={draft.caption} onChange={(e) => set({ caption: e.target.value })} />
          </label>
          {!posted && <button className="link" onClick={() => set({ caption: buildCaption(draft, data.templates) })}>{t('Rebuild from template')}</button>}
          {!posted && (
            <div className="danger">
              {confirmDelete ? (
                <>
                  <span>{t('Delete this post?')} {t('It will also be taken off the schedule.')}</span>
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
