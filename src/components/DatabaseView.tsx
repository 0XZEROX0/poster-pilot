import { useState } from 'react'
import { categoryOf, matchesSearch, onFacebook, stageOf } from '../data/logic'
import { allowed, backend } from '../data/store'
import type { Data } from '../data/types'
import { t } from '../i18n'
import { BulkBar, BulkToggle, Pick, useBulk, type BulkAction } from './Bulk'
import { CardSize } from './CardSize'
import { PostCard } from './PostRow'
import { CategoryChips, categoryOn, Empty, SearchBox, StyleChips, styleOn } from './ui'

const STAGES = ['review', 'fix', 'scheduled', 'posted'] as const
const STAGE_LABEL: Record<string, string> = { review: 'Review', fix: 'Fix', scheduled: 'Approved', posted: 'Posted' }

/** Every post that has a design, whatever its state, in one place to look through and clean up. */
export function DatabaseView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [style, setStyle] = useState('')
  const [stage, setStage] = useState('')
  const [category, setCategory] = useState('')
  const all = data.posts.filter((p) => p.posterUrl !== '')
  const inStage = all.filter((p) => !stage || stageOf(p) === stage)
  const byStage = inStage.filter((p) => !categoryOn(inStage, category) || categoryOf(p) === category)
  const shown = byStage.filter((p) => (!styleOn(byStage, style) || p.style === style) && matchesSearch(p, query))
  const bulk = useBulk(shown.map((p) => p.id))
  if (!all.length) return <div className="view"><Empty icon="database" text={t('No designs yet. Every post that has a poster shows up here.')} /></div>
  const post = (id: string) => data.posts.find((p) => p.id === id)
  // A post still waiting on Facebook's schedule has to be cancelled first, so nothing is left behind there.
  const free = (id: string) => { const p = post(id); return p && (stageOf(p) === 'posted' || !onFacebook(p)) ? p : null }
  const actions: BulkAction[] = allowed('delete') ? [{ label: 'Delete', icon: 'trash', tone: 'danger', confirm: true, run: (id) => (free(id) ? backend.removePost(id) : false) }] : []
  const count = (s: string) => all.filter((p) => stageOf(p) === s).length
  return (
    <div className="view">
      <div className="filters" role="group" aria-label={t('Stage')}>
        <button className={stage === '' ? 'filter on' : 'filter'} onClick={() => setStage('')}>{t('All')} <i>{all.length}</i></button>
        {STAGES.filter((s) => count(s) > 0).map((s) => (
          <button key={s} className={stage === s ? 'filter on' : 'filter'} onClick={() => setStage(s)}>{t(STAGE_LABEL[s])} <i>{count(s)}</i></button>
        ))}
      </div>
      <CategoryChips posts={inStage} value={category} onChange={setCategory} />
      <StyleChips posts={byStage} value={style} onChange={setStyle} />
      <div className="review-bar tools">
        <SearchBox value={query} onChange={setQuery} />
        {actions.length > 0 && <BulkToggle bulk={bulk} />}
        <CardSize />
      </div>
      {actions.length > 0 && <p className="hint">{t('Deleting removes the post from the app, empties its row in the sheet and moves its poster to the Google Drive bin. Facebook and Instagram are not touched.')}</p>}
      {shown.length === 0 ? <Empty icon="search" text={t('Nothing matches.')} /> : (
        <div className="cards cards-sm">{shown.map((p) => <Pick key={p.id} bulk={bulk} id={p.id} show={actions.length > 0}><PostCard post={p} onOpen={onOpen} /></Pick>)}</div>
      )}
      <BulkBar bulk={bulk} actions={actions} />
    </div>
  )
}
