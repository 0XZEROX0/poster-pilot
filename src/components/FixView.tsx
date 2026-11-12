import { problemOf, stageOf, titleOf } from '../data/logic'
import type { Data, Post } from '../data/types'
import { t } from '../i18n'
import { Poster } from './Poster'
import { Empty, Icon } from './ui'

/** What went wrong, in plain words, and what to do about it. */
export function problemText(post: Post): { title: string; advice: string } | null {
  const problem = problemOf(post)
  if (!problem) return null
  switch (problem.kind) {
    case 'photo':
      return { title: t('Product photo not found'), advice: t('Paste a photo link below, or try the next search result, then retry.') }
    case 'background':
      return { title: t('Background not found'), advice: t('Add a background image with this style name to the Backgrounds folder, or pick another style, then retry.') }
    case 'ai':
      return { title: t('The poster could not be built'), advice: t('This is usually temporary. Retry, or paste a photo link first.') }
    case 'facebook':
      return { title: t('Facebook refused the post'), advice: t('Change the post time, then approve again.') }
    case 'instagram':
      return { title: t('Instagram refused the post'), advice: t('Change the post time, then approve again.') }
  }
}

/** Every post with a problem, each with its reason. Tapping one opens it with the fix ready. */
export function FixView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const posts = data.posts.filter((p) => stageOf(p) === 'fix')
  if (!posts.length) return <div className="view"><Empty icon="posted" text={t('No problems. Everything is running.')} /></div>
  return (
    <div className="view">
      <div className="list">
        {posts.map((p) => {
          const text = problemText(p)!
          return (
            <button key={p.id} className="row row-problem" onClick={() => onOpen(p.id)}>
              <Poster post={p} small />
              <span className="row-main">
                <span className="row-title" dir="auto">{titleOf(p)}</span>
                <span className="problem-title"><Icon name="fix" size={16} />{text.title}</span>
                <span className="muted small" dir="auto">{problemOf(p)?.text}</span>
              </span>
              <Icon name="right" size={18} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
