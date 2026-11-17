import { previewUrl, STORY_DELAYS, storyDelayOf, storyStateOf, storyTo, storyWhenOf, titleOf } from '../data/logic'
import type { Post, StoryWhere } from '../data/types'
import { t } from '../i18n'
import { Poster } from './Poster'
import { Chip, dayLabel, timeLabel } from './ui'

/**
 * The story picture, 9:16. Once the engine has made it, the real picture; before that a drawing of the same layout
 * (the poster on a blurred copy of itself, the website and the shop's address under it), so the person sees what
 * goes out.
 */
export function StoryPreview({ post }: { post: Post }) {
  if (post.storyImage) {
    return (
      <div className="story-frame">
        <img src={previewUrl(post.storyImage, 600)} alt={`${t('Story')}: ${titleOf(post)}`} loading="lazy" referrerPolicy="no-referrer" />
      </div>
    )
  }
  const bg = post.posterUrl ? previewUrl(post.posterUrl, 300) : ''
  return (
    <div className="story-frame story-drawn" aria-label={`${t('Story')}: ${titleOf(post)}`}>
      {bg && <img className="story-bg" src={bg} alt="" referrerPolicy="no-referrer" />}
      <div className="story-poster"><Poster post={post} /></div>
      <div className="story-foot" dir="ltr"><b>static-eg.com</b><span>Al Bustan Mall · 10th floor</span></div>
    </div>
  )
}

const DEFAULT_KEY = 'pp-story-default'
/** This person's choice in Settings: new posts start with "Also post as a story" ticked. Off unless they turned it on. */
export function storyByDefault(): boolean {
  try { return localStorage.getItem(DEFAULT_KEY) === 'yes' } catch { return false }
}
export function setStoryByDefault(on: boolean): void {
  try { localStorage.setItem(DEFAULT_KEY, on ? 'yes' : 'no') } catch { /* only remembered when storage works */ }
}

const label = (where: 'fb' | 'ig') => (where === 'fb' ? 'Facebook' : 'Instagram')

/** One place's story state as a small chip. */
function StoryChip({ post, where }: { post: Post; where: 'fb' | 'ig' }) {
  const s = storyStateOf(post, where)
  if (s.state === 'off') return null
  if (s.state === 'posted') return <Chip tone="good">{label(where)} · {t('Story posted')}</Chip>
  if (s.state === 'failed') return <Chip tone="bad">{label(where)} · {t('Story failed')}</Chip>
  return <Chip tone="info">{label(where)} · {t('Story waiting')}</Chip>
}

/** The story chips of a post (nothing when it has no story). */
export function StoryChips({ post }: { post: Post }) {
  if (!post.story) return null
  return <span className="story-chips"><StoryChip post={post} where="fb" /><StoryChip post={post} where="ig" /></span>
}

/**
 * The "Also post as a story" part of the post editor. `draft` holds the person's unsaved choice; `post` is what is
 * saved (its statuses tell which places already have the story, and those cannot be changed any more).
 */
export function StoryBox({ post, draft, canEdit, onChange, onRetry }: { post: Post; draft: Post; canEdit: boolean; onChange: (patch: Partial<Post>) => void; onRetry: () => void }) {
  const on = !!draft.story
  const done = { fb: storyStateOf(post, 'fb').state === 'posted', ig: storyStateOf(post, 'ig').state === 'posted' }
  const setWhere = (where: 'fb' | 'ig', yes: boolean) => {
    const fb = where === 'fb' ? yes : storyTo(draft, 'fb')
    const ig = where === 'ig' ? yes : storyTo(draft, 'ig')
    onChange({ story: ((fb && ig) ? 'fb+ig' : fb ? 'fb' : ig ? 'ig' : '') as StoryWhere })
  }
  const when = storyWhenOf(draft)
  const failed = (['fb', 'ig'] as const).map((w) => ({ w, s: storyStateOf(post, w) })).filter((x) => x.s.state === 'failed')
  const locked = !canEdit || (done.fb && done.ig)
  return (
    <fieldset className="story-box">
      <legend>{t('Story')}</legend>
      <div className="story-grid">
        {on && <StoryPreview post={post} />}
        <div className="story-form">
          <label className="check">
            <input type="checkbox" checked={on} disabled={locked || done.fb || done.ig} onChange={(e) => onChange({ story: e.target.checked ? 'fb+ig' : '' })} />
            <span>{t('Also post as a story')}</span>
          </label>
          {on && (
            <>
              <div className="story-where">
                {(['fb', 'ig'] as const).map((w) => (
                  <label key={w} className="check">
                    <input type="checkbox" checked={storyTo(draft, w)} disabled={locked || done[w]} onChange={(e) => setWhere(w, e.target.checked)} />
                    <span>{label(w)}</span>
                  </label>
                ))}
              </div>
              <label>
                <span>{t('When')}</span>
                <select disabled={locked} value={String(storyDelayOf(draft))} onChange={(e) => onChange({ storyDelay: e.target.value === '0' ? '' : e.target.value })}>
                  {STORY_DELAYS.map((m) => <option key={m} value={m}>{m === 0 ? t('Same time as the post') : m < 60 ? `${m} ${t('minutes after the post')}` : `${m / 60} ${t(m === 60 ? 'hour after the post' : 'hours after the post')}`}</option>)}
                </select>
              </label>
              <p className="hint">
                {when ? `${t('The story goes out')} ${dayLabel(when.date)} · ${timeLabel(when.time)}. ` : `${t('The story goes out when the post has a date and a time.')} `}
                {t('It stays for 24 hours. Tappable stickers (links, polls, mentions) can only be added from the phone.')}
              </p>
              <StoryChips post={post} />
              {failed.map(({ w, s }) => <p key={w} className="problem-title" dir="auto">{label(w)}: {s.text}</p>)}
              {failed.length > 0 && canEdit && <button type="button" className="link" onClick={onRetry}>{t('Try the story again')}</button>}
            </>
          )}
        </div>
      </div>
    </fieldset>
  )
}
