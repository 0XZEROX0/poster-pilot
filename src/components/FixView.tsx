import { problemOf, stageOf, titleOf } from '../data/logic'
import { backend } from '../data/store'
import type { Data, Post } from '../data/types'
import { t } from '../i18n'
import { Poster } from './Poster'
import { Empty, Icon, showToast } from './ui'

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

/** One post with a problem: what went wrong, and the ways out. */
function FixCard({ post: p, onOpen }: { post: Post; onOpen: (id: string) => void }) {
  const problem = problemOf(p)!
  const text = problemText(p)!
  // The engine marks the items it found no photo for, which matters in a bundle.
  const missing = p.items.filter((it) => it.photoMissing)
  // A publishing problem is fixed inside the post (a new time); a poster problem can simply be tried again.
  const publishing = problem.kind === 'facebook' || problem.kind === 'instagram'
  const retry = () => backend.updatePost(p.id, { feedback: 'Redo' }).then(() => showToast(t('Sent for redo')))
  // The exact error text is remembered, so the same error stays hidden and a new one shows up again.
  const ignore = () => backend.updatePost(p.id, { ignoredProblem: problem.text }).then(() => showToast(t('Error ignored')))
  return (
    <article className="card card-problem">
      <button className="card-poster" onClick={() => onOpen(p.id)} aria-label={t('Edit')}>
        <Poster post={p} />
      </button>
      <div className="card-body">
        <h3 dir="auto">{titleOf(p)}</h3>
        <p className="problem-title"><Icon name="fix" size={16} />{text.title}</p>
        {problem.kind === 'photo' && missing.length > 0 ? (
          <ul className="missing">
            {missing.map((it) => <li key={it.name} dir="auto"><b>{t('No photo for')}</b> {it.name}</li>)}
          </ul>
        ) : (
          <p className="muted small problem-raw" dir="auto">{problem.text}</p>
        )}
        <div className="actions">
          {publishing ? (
            <button className="btn btn-primary" onClick={() => onOpen(p.id)}><Icon name="clock" size={18} />{t('Change time')}</button>
          ) : (
            <>
              <button className="btn btn-primary" onClick={retry}><Icon name="redo" size={18} />{t('Retry')}</button>
              <button className="btn" onClick={() => onOpen(p.id)}><Icon name="edit" size={18} />{t('Edit')}</button>
            </>
          )}
          <button className="btn btn-ghost" onClick={ignore}><Icon name="close" size={18} />{t('Ignore')}</button>
        </div>
      </div>
    </article>
  )
}

/** Every post with a problem, each with its reason and a way to retry, edit or ignore it. */
export function FixView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const posts = data.posts.filter((p) => stageOf(p) === 'fix')
  if (!posts.length) return <div className="view"><Empty icon="posted" text={t('No problems. Everything is running.')} /></div>
  return (
    <div className="view">
      <div className="cards">{posts.map((p) => <FixCard key={p.id} post={p} onOpen={onOpen} />)}</div>
    </div>
  )
}
