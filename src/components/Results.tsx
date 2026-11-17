import type { FbResults, IgResults, PostResults, Results } from '../data/types'
import { t } from '../i18n'
import { agoLabel } from './SettingsSheet'
import { Icon } from './ui'

/** 1234 -> "1,234", 15400 -> "15.4K". */
export function count(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—'
  if (n >= 10000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}K`
  return n.toLocaleString('en-US')
}

/** People reached on both places, and likes/reactions on both, for a small card. Undefined when nothing is known. */
export function totals(r: PostResults | undefined) {
  if (!r) return undefined
  const add = (...v: (number | undefined)[]) => (v.some((x) => x !== undefined) ? v.reduce<number>((s, x) => s + (x ?? 0), 0) : undefined)
  const reach = add(r.fb?.reach, r.ig?.reach)
  const likes = add(r.fb?.reactions, r.ig?.likes)
  return reach === undefined && likes === undefined ? undefined : { reach, likes }
}

/** The short line on a published post's card: reach and likes, when the engine has them. */
export function ResultsLine({ r }: { r: PostResults | undefined }) {
  const sum = totals(r)
  if (!sum) return null
  return (
    <span className="results-line" dir="ltr">
      {sum.reach !== undefined && <span title={t('Reach')}><Icon name="eye" size={14} />{count(sum.reach)}</span>}
      {sum.likes !== undefined && <span title={t('Likes')}><Icon name="heart" size={14} />{count(sum.likes)}</span>}
    </span>
  )
}

const FB_ROWS: [keyof FbResults, string][] = [['reach', 'Reach'], ['reactions', 'Reactions'], ['comments', 'Comments'], ['shares', 'Shares']]
const IG_ROWS: [keyof IgResults, string][] = [['reach', 'Reach'], ['likes', 'Likes'], ['comments', 'Comments'], ['saved', 'Saves'], ['shares', 'Shares']]

/** A published post's Facebook and Instagram numbers, in the post editor. */
export function ResultsBox({ postId, results }: { postId: string; results: Results | null }) {
  const r = results?.posts?.[postId]
  const need = results?.need ?? []
  const fbMissing = need.includes('fbIns') || need.includes('fbEng')
  const igMissing = need.includes('igIns')
  return (
    <section className="results-box" aria-label={t('Results')}>
      <header><b>{t('Results')}</b>{results?.at ? <span className="muted small">{t('Updated')} {agoLabel(r?.at ?? results.at)}</span> : null}</header>
      {!r ? (
        <p className="hint">{t('The numbers come from Facebook and Instagram twice a day (10 AM and 10 PM).')}</p>
      ) : (
        <>
          <Side name="Facebook" rows={FB_ROWS.map(([k, label]) => [label, r.fb?.[k]])} />
          <Side name="Instagram" rows={IG_ROWS.map(([k, label]) => [label, r.ig?.[k]])} link={r.igLink} />
          {(fbMissing || igMissing) && (
            <p className="hint">{t(fbMissing && igMissing ? 'Facebook numbers and Instagram reach show once the Meta token has the insights permissions.' : fbMissing ? 'Facebook numbers show once the Meta token has the insights permissions.' : 'Instagram reach and saves show once the Meta token has the insights permission.')}</p>
          )}
        </>
      )}
    </section>
  )
}

function Side({ name, rows, link }: { name: string; rows: [string, number | undefined][]; link?: string }) {
  const shown = rows.filter(([, v]) => v !== undefined)
  return (
    <div className="results-side">
      <span className="results-name">{name}{link && <a href={link} target="_blank" rel="noreferrer" aria-label={t('Open on Instagram')}><Icon name="link" size={14} /></a>}</span>
      {shown.length ? (
        <div className="results-nums">
          {shown.map(([label, v]) => <span key={label}><b dir="ltr">{count(v)}</b><small>{t(label)}</small></span>)}
        </div>
      ) : <span className="muted small">{t('Not available yet')}</span>}
    </div>
  )
}
