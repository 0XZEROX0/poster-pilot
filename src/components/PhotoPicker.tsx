import { useEffect, useState } from 'react'
import { backend } from '../data/store'
import { choicesFor } from '../data/logic'
import type { Post, WebPhoto } from '../data/types'
import { t } from '../i18n'
import { Icon } from './ui'

/** How long the picker waits for the engine before it says so. */
const PATIENCE = 2 * 60 * 1000

/**
 * Shows every photo the website has for one item, so the person can choose the one the poster uses.
 * The engine looks them up when asked (about half a minute). `onPick` gets the full-size link.
 */
export function PhotoPicker({ post, index, current, busy, onPick }: { post: Post; index: number; current: string; busy: boolean; onPick: (src: string) => void }) {
  const [open, setOpen] = useState(false)
  const [askedAt, setAskedAt] = useState(0)
  const [chosen, setChosen] = useState('')
  const [, tick] = useState(0)
  const found = choicesFor(post, index)
  const answered = !!post.photoChoices && post.photoChoices.asked >= askedAt && !post.photoAsk
  const waiting = askedAt > 0 && !answered
  const late = waiting && Date.now() - askedAt > PATIENCE

  // Re-render now and then while waiting, so "taking longer" can show up.
  useEffect(() => {
    if (!waiting) return
    const id = setInterval(() => tick((n) => n + 1), 5000)
    return () => clearInterval(id)
  }, [waiting])

  async function ask() {
    const at = Date.now()
    setAskedAt(at)
    await backend.updatePost(post.id, { photoAsk: at })
  }
  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !found && !waiting) void ask()
  }

  const grid = (photos: WebPhoto[]) => (
    <div className="photo-grid">
      {photos.map((p) => (
        <button key={p.src} type="button" className={`photo-pick${chosen === p.src ? ' chosen' : ''}${current === p.src ? ' current' : ''}`} onClick={() => setChosen(chosen === p.src ? '' : p.src)} aria-pressed={chosen === p.src}>
          <img src={p.thumb || p.src} alt="" loading="lazy" referrerPolicy="no-referrer" />
          {current === p.src && <span className="photo-tag">{t('In use')}</span>}
        </button>
      ))}
    </div>
  )

  let body = null
  if (open) {
    if (waiting || (!found && !answered)) {
      body = <p className="hint">{late ? t('The website check is taking longer than usual. It will show up here when it is done.') : t('Looking for this product on the website…')}</p>
    } else if (found?.error) {
      body = <p className="hint">{t('The website did not answer. Try again in a minute.')} <button type="button" className="link" onClick={ask}>{t('Retry')}</button></p>
    } else if (found && found.photos.length) {
      body = (
        <>
          <p className="hint">
            {found.photos.length === 1 ? t('The website has one photo of this product.') : `${t('Photos on the website')}: ${found.photos.length}`}
            {found.page && <> · <a href={found.page} target="_blank" rel="noreferrer">{found.product || t('Open on the website')}</a></>}
          </p>
          {grid(found.photos)}
        </>
      )
    } else if (found && found.near?.length) {
      body = (
        <>
          <p className="hint">{t('This exact product is not on the website. These are the closest ones:')}</p>
          {found.near.map((n) => (
            <div key={n.page || n.product} className="photo-near">
              <p className="small" dir="auto">{n.page ? <a href={n.page} target="_blank" rel="noreferrer">{n.product}</a> : n.product}</p>
              {grid(n.photos)}
            </div>
          ))}
        </>
      )
    } else {
      body = <p className="hint">{t('The website has no photos of this product.')}</p>
    }
  }

  return (
    <div className="photo-picker">
      <button type="button" className="btn btn-ghost btn-small" onClick={toggle} aria-expanded={open}>
        <Icon name="image" size={16} />{open ? t('Hide website photos') : t('Choose a photo from the website')}
      </button>
      {body}
      {open && chosen && (
        <div className="photo-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onPick(chosen)}><Icon name="check" size={18} />{t('Use this photo')}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setChosen('')}>{t('Cancel')}</button>
        </div>
      )}
      {open && answered && found && !found.error && <button type="button" className="link small" onClick={ask}>{t('Look again')}</button>}
    </div>
  )
}
