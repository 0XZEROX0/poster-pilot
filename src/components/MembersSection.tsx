import { useCallback, useEffect, useState } from 'react'
import { firestore } from '../data/firebase'
import type { Session } from '../data/store'
import { accept, decline, loadTeam, removeMember, resetCode, setRole, type Member, type Team } from '../data/team'
import { t } from '../i18n'
import { Chip, Icon, showToast } from './ui'

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const

/** The system code, the people asking to join and the people inside. Owner and admins only. */
export function MembersSection({ session }: { session: Session }) {
  const [team, setTeam] = useState<Team | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState('')
  const owner = session.access === 'owner'
  const me = session.user?.uid

  const load = useCallback(() => {
    if (!firestore) return
    loadTeam(firestore).then(setTeam, (e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  /** Runs one change, says so, and reads the lists again. */
  const run = (work: Promise<unknown>, message: string) =>
    work.then(() => { showToast(t(message)); setConfirm(''); load() }, (e: Error) => setError(e.message))
  const db = firestore!
  const copy = () => navigator.clipboard.writeText(team?.code ?? '').then(() => showToast(t('Code copied')), () => setError(t('Could not copy. Select the code and copy it by hand.')))
  const canRemove = (m: Member) => m.uid !== me && m.role !== 'owner' && (owner || m.role === 'member')

  if (error && !team) return <section className="set"><h3>{t('People')}</h3><p className="bad">{error}</p></section>
  if (!team) return <section className="set"><h3>{t('People')}</h3><p className="hint">{t('Loading…')}</p></section>
  return (
    <section className="set people">
      <h3>{t('People')}</h3>
      <div className="item-box">
        <b>{t('System code')}</b>
        <p className="hint">{t('Give this code only to people you want in. It lets someone ask to join; you still have to accept them.')}</p>
        <code className="code" dir="ltr">{team.code || '—'}</code>
        <div className="actions">
          <button className="btn btn-primary" onClick={copy} disabled={!team.code}><Icon name="link" size={18} />{t('Copy')}</button>
          {owner && (confirm === 'reset' ? (
            <>
              <button className="btn btn-danger" onClick={() => run(resetCode(db), 'New code made')}>{t('Yes, make a new code')}</button>
              <button className="btn btn-ghost" onClick={() => setConfirm('')}>{t('Cancel')}</button>
            </>
          ) : (
            <button className="btn" onClick={() => setConfirm('reset')}><Icon name="redo" size={18} />{t('New code')}</button>
          ))}
        </div>
        {confirm === 'reset' && <p className="hint">{t('The old code stops working, and requests made with it can no longer be accepted.')}</p>}
      </div>

      <div className="item-box">
        <b>{t('Asking to join')} <span className="group-count">{team.requests.length}</span></b>
        {!team.requests.length && <p className="hint">{t('Nobody is waiting.')}</p>}
        {team.requests.map((r) => (
          <div key={r.uid} className="person">
            <span className="person-main"><b dir="auto">{r.name || r.email}</b><span className="muted small" dir="ltr">{r.email}</span></span>
            <button className="btn btn-primary" onClick={() => run(accept(db, r), 'Accepted')}>{t('Accept')}</button>
            <button className="btn" onClick={() => run(decline(db, r.uid), 'Declined')}>{t('Decline')}</button>
          </div>
        ))}
      </div>

      <div className="item-box">
        <b>{t('Members')} <span className="group-count">{team.members.length}</span></b>
        {team.members.map((m) => (
          <div key={m.uid} className="person">
            <span className="person-main"><b dir="auto">{m.name || m.email}{m.uid === me && ` (${t('you')})`}</b><span className="muted small" dir="ltr">{m.email}</span></span>
            <Chip tone={m.role === 'owner' ? 'good' : m.role === 'admin' ? 'info' : 'neutral'}>{t(ROLE_LABEL[m.role])}</Chip>
            {owner && m.role !== 'owner' && <button className="btn" onClick={() => run(setRole(db, m.uid, m.role === 'admin' ? 'member' : 'admin'), 'Saved')}>{t(m.role === 'admin' ? 'Make member' : 'Make admin')}</button>}
            {canRemove(m) && (confirm === m.uid ? (
              <button className="btn btn-danger" onClick={() => run(removeMember(db, m), 'Removed')}>{t('Yes, remove')}</button>
            ) : (
              <button className="btn btn-ghost" onClick={() => setConfirm(m.uid)} aria-label={t('Remove')}><Icon name="trash" size={18} /></button>
            ))}
          </div>
        ))}
      </div>
      {error && <p className="bad">{error}</p>}
    </section>
  )
}
