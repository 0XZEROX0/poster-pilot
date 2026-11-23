import { webOn, webStateOf } from '../data/logic'
import type { Post } from '../data/types'
import { t } from '../i18n'
import { Chip, dayLabel, Icon, timeLabel } from './ui'

/**
 * "Also add to the website": the offer goes on static-eg.com under Static Friday, like the bundle offers added by hand
 * (name = the products, Price before crossed out, Price after as the price, the poster as its photo). It goes live
 * when the post goes out; a post already out goes live at once. Turning it off hides the website product again.
 * The choice is part of the editor's unsaved changes and goes out with Save (or Approve).
 */
export function WebsiteBox({ post, draft, canEdit, onChange, onRetry }: {
  post: Post
  draft: Post
  canEdit: boolean
  onChange: (patch: Partial<Post>) => void
  onRetry: () => void
}) {
  const on = webOn(draft)
  const saved = webOn(post)
  const state = webStateOf(post)
  const at = post.webAt ? post.webAt.split(' ') : null
  return (
    <fieldset className="story-box web-box">
      <legend>{t('Website')}</legend>
      <label className="check">
        <input type="checkbox" checked={on} disabled={!canEdit} onChange={(e) => onChange({ webAdd: e.target.checked ? 'asked' : (post.webProductId || post.webAdd === 'working' ? 'remove' : '') })} />
        <span>{t('Also add to the website')}</span>
      </label>
      {on && !saved && <p className="hint">{t('After saving, the offer is added to static-eg.com under Static Friday with the poster as its photo. It goes live when the post goes out.')}</p>}
      {!on && saved && post.webProductId ? <p className="hint">{t('After saving, the offer is hidden on the website again (kept as a draft there).')}</p> : null}
      {state && on === saved && (
        <p className="post-state">
          <Chip tone={state.tone}>
            {t(state.text)}
            {post.webAdd === 'scheduled' && at ? ` ${dayLabel(at[0])} · ${timeLabel(at[1] ?? '')}` : ''}
          </Chip>
          {post.webLink && (post.webAdd === 'live' || post.webAdd === 'scheduled') && (
            <a className="link" href={post.webLink} target="_blank" rel="noreferrer"><Icon name="globe" size={16} />{t(post.webAdd === 'live' ? 'Open on the website' : 'Website page')}</a>
          )}
        </p>
      )}
      {post.webNote && on === saved && <p className="muted small" dir="auto">{post.webNote}</p>}
      {post.webAdd === 'failed' && canEdit && on && <button type="button" className="link" onClick={onRetry}><Icon name="redo" size={16} />{t('Try again')}</button>}
    </fieldset>
  )
}
