import { BulkBar, BulkToggle, Pick, useBulk, type BulkAction } from './Bulk'
import { CardSize } from './CardSize'
import { useState } from 'react'
import { formatPrice, hasOffer, marketOf, offerOf, priceOf, stageOf, titleOf } from '../data/logic'
import { allowed, backend, isOwner, myId, myName, ownOffer } from '../data/store'
import type { Data, MarketHit, Post } from '../data/types'
import { t } from '../i18n'
import { Empty, Icon, showToast } from './ui'

const egp = (n: number) => `${n.toLocaleString('en-US')} EGP`
const stockOf = (h: MarketHit) => (h.inStock === false ? t('out of stock') : h.inStock === null ? t('stock unknown') : '')
const ago = (ms: number) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** Competitor prices for an offer: the cheapest same product at each item, their total, and how this offer compares. */
function MarketBox({ post: p }: { post: Post }) {
  const [open, setOpen] = useState(false)
  const view = marketOf(p)
  const again = () => backend.updatePost(p.id, { marketAsk: Date.now() }).then(() => showToast(t('Checking competitor prices again')))
  if (view.state === 'checking') return <div className="market"><p className="muted small">{t('Checking competitor prices…')}</p></div>
  const m = p.market!
  const diff = view.state === 'done' ? view.ours - view.total : 0
  const pct = view.state === 'done' && view.total ? Math.round((Math.abs(diff) / view.total) * 1000) / 10 : 0
  return (
    <div className={`market market-${view.state === 'done' ? view.tone : 'partial'}`}>
      <div className="market-head">
        <b>{t('Competitor prices')}</b>
        <button className="btn btn-ghost btn-small" onClick={again}><Icon name="redo" size={16} />{t('Check again')}</button>
      </div>
      {view.state === 'error' && <p className="small">{t('The check did not work this time.')} <span className="muted" dir="auto">{view.error}</span></p>}
      {view.state === 'done' && view.tone !== 'partial' && (
        <p className="market-verdict" dir="auto">
          <span>{t('Competitors')}: <b dir="ltr">{egp(view.total)}</b> · {t('Yours')}: <b dir="ltr">{egp(view.ours)}</b></span>
          <span>{diff <= 0 ? t('You are cheaper by') : t('You are more expensive by')} <b dir="ltr">{egp(Math.abs(diff))} ({pct}%)</b></span>
          {view.tone === 'high' && <span className="market-warn"><Icon name="fix" size={16} />{t('Check this price before approving.')}</span>}
        </p>
      )}
      {view.state === 'done' && view.tone === 'partial' && <p className="small">{t('Found {n} of {m} items, so there is no total.').replace('{n}', String(view.found)).replace('{m}', String(view.count))}</p>}
      <ul className="market-items">
        {m.items.map((it, i) => (
          <li key={i}>
            <span dir="auto" className="market-name">{it.name}</span>
            {it.best ? (
              <span><a href={it.best.url} target="_blank" rel="noreferrer" dir="ltr">{egp(it.best.price)}</a> {it.best.shop}{stockOf(it.best) && <span className="muted"> · {stockOf(it.best)}</span>}{it.best.note && <span className="muted" dir="auto"> · {it.best.note}</span>}</span>
            ) : <span className="muted">{t('Not found at the shops')}</span>}
            {open && [...it.others.map((h) => ({ h, similar: false })), ...it.similar.map((h) => ({ h, similar: true }))].map(({ h, similar }, j) => (
              <span key={j} className="market-other small"><a href={h.url} target="_blank" rel="noreferrer" dir="ltr">{egp(h.price)}</a> {h.shop}{stockOf(h) && ` · ${stockOf(h)}`}{similar && ` · ${t('similar, not counted')}`} <span className="muted" dir="auto">{h.title}</span></span>
            ))}
          </li>
        ))}
      </ul>
      <p className="muted small market-foot">
        <span>{t('Checked')} {ago(m.checkedAt)} · {m.shops.join(', ')}</span>
        {m.items.some((it) => it.others.length || it.similar.length) && <button className="link" onClick={() => setOpen(!open)}>{open ? t('Less') : t('All shops')}</button>}
      </p>
    </div>
  )
}

/** One offer before any poster exists: what is in it, who made it, and the decision buttons. */
function OfferCard({ post: p, onOpen }: { post: Post; onOpen: (id: string) => void }) {
  const [note, setNote] = useState<string | null>(null)
  const mine = ownOffer(p)
  const rejected = offerOf(p) === 'rejected'
  const mayDecide = allowed('offers.approve') && !mine
  const mayEdit = allowed('offers.create') || allowed('fix') || allowed('designs.approve')
  const approve = () => backend.updatePost(p.id, { offer: 'Approved', offerBy: myName(), offerNote: '' }).then(() => showToast(t('Offer approved. The poster is being made.')))
  const sendBack = () => backend.updatePost(p.id, { offer: 'Rejected', offerBy: myName(), offerNote: (note ?? '').trim() }).then(() => showToast(t('Offer sent back')))
  const again = () => backend.updatePost(p.id, { offer: '' }).then(() => showToast(t('Sent for approval again')))
  return (
    <article className={`card offer${rejected ? ' card-problem' : ''}`}>
      <div className="card-body">
        <h3 dir="auto">{titleOf(p)}</h3>
        {p.items.length > 1 && <ul className="offer-items">{p.items.map((it, i) => <li key={i} dir="auto">{it.name}</li>)}</ul>}
        <p className="price">
          <span dir="ltr">{hasOffer(p) && <s>{formatPrice(p.priceBefore)}</s>} {formatPrice(priceOf(p))} EGP</span> <span className="muted">· {p.style}</span>
        </p>
        {p.details && <p className="muted small" dir="auto">{p.details}</p>}
        {!rejected && <MarketBox post={p} />}
        <p className="muted small">{p.createdByName ? `${t('Made by')} ${p.createdByName}` : t('Added in the sheet')}</p>
        {rejected && <p className="alert"><b><Icon name="fix" size={18} />{t('Offer sent back')}{p.offerBy ? ` · ${p.offerBy}` : ''}</b>{p.offerNote && <span dir="auto">{p.offerNote}</span>}</p>}
        {note !== null ? (
          <>
            <label><span>{t('Why is it sent back?')}</span><textarea dir="auto" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="actions">
              <button className="btn btn-danger" onClick={sendBack}>{t('Send back')}</button>
              <button className="btn btn-ghost" onClick={() => setNote(null)}>{t('Cancel')}</button>
            </div>
          </>
        ) : (
          <div className="actions">
            {!rejected && mayDecide && <button className="btn btn-primary" onClick={approve}><Icon name="check" size={18} />{t('Approve offer')}</button>}
            {!rejected && mayDecide && <button className="btn" onClick={() => setNote('')}>{t('Send back')}</button>}
            {rejected && (p.createdBy === myId() || isOwner()) && <button className="btn btn-primary" onClick={again}><Icon name="redo" size={18} />{t('Send again')}</button>}
            <button className="btn btn-ghost" onClick={() => onOpen(p.id)}><Icon name={mayEdit ? 'edit' : 'expand'} size={18} />{t(mayEdit ? 'Edit' : 'View')}</button>
          </div>
        )}
        {!rejected && mine && <p className="hint">{t('Someone else has to approve your offer.')}</p>}
      </div>
    </article>
  )
}

/** Offers waiting for approval, and the ones that were sent back to their maker. */
export function OffersView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const offers = data.posts.filter((p) => stageOf(p) === 'offer')
  const waiting = offers.filter((p) => offerOf(p) === 'waiting')
  const back = offers.filter((p) => offerOf(p) === 'rejected')
  const bulk = useBulk(offers.map((p) => p.id))
  if (!offers.length) return <Empty icon="offer" text={t('No offers are waiting. A new post shows up here until someone approves it.')} />
  const post = (id: string) => offers.find((p) => p.id === id)
  // Only a waiting offer that someone else made can be decided, the same as on its card.
  const mine = ownOffer
  const open = (id: string) => { const p = post(id); return p && offerOf(p) === 'waiting' && !mine(p) ? p : null }
  const actions: BulkAction[] = [
    ...(allowed('offers.approve') ? [
      { label: 'Approve offer', icon: 'check', tone: 'primary' as const, run: (id: string) => (open(id) ? backend.updatePost(id, { offer: 'Approved', offerBy: myName(), offerNote: '' }) : false) },
      { label: 'Send back', run: (id: string) => (open(id) ? backend.updatePost(id, { offer: 'Rejected', offerBy: myName(), offerNote: '' }) : false) },
    ] : []),
    ...(allowed('delete') ? [{ label: 'Delete', icon: 'trash', tone: 'danger' as const, confirm: true, run: (id: string) => backend.removePost(id) }] : []),
  ]
  const cards = (list: Post[]) => <div className="cards">{list.map((p) => <Pick key={p.id} bulk={bulk} id={p.id} show={actions.length > 0}><OfferCard post={p} onOpen={onOpen} /></Pick>)}</div>
  return (
    <div className="view">
      <div className="review-bar tools">
        {actions.length > 0 && <BulkToggle bulk={bulk} />}
        <CardSize />
      </div>
      {waiting.length > 0 && (
        <section>
          <h2 className="group">{t('Waiting for approval')} <span className="group-count">{waiting.length}</span></h2>
          {cards(waiting)}
        </section>
      )}
      {back.length > 0 && (
        <section>
          <h2 className="group">{t('Sent back')} <span className="group-count">{back.length}</span></h2>
          {cards(back)}
        </section>
      )}
      <BulkBar bulk={bulk} actions={actions} />
    </div>
  )
}
