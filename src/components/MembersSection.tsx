import { useCallback, useEffect, useState } from 'react'
import { firestore } from '../data/firebase'
import type { Session } from '../data/store'
import { accept, BUILT_IN, decline, deleteRole, loadTeam, newRoleId, PAGE_LABEL, PAGES, PERM_LABEL, PERMS, removeMember, resetCode, saveRole, setRole, type Member, type Page, type Perm, type RoleDef, type Team } from '../data/team'
import { t } from '../i18n'
import { Chip, Icon, showToast } from './ui'


/** The system code, the people asking to join and the people inside. Owner and admins only. */
export function MembersSection({ session }: { session: Session }) {
  const [team, setTeam] = useState<Team | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState('')
  const [roles, setRoles] = useState<RoleDef[] | null>(null)
  const owner = session.role === 'owner'
  const me = session.user?.uid

  const load = useCallback(() => {
    if (!firestore) return
    loadTeam(firestore).then((x) => { setTeam(x); setRoles(x.roles) }, (e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  /** Runs one change, says so, and reads the lists again. */
  const run = (work: Promise<unknown>, message: string) =>
    work.then(() => { showToast(t(message)); setConfirm(''); load() }, (e: Error) => setError(e.message))
  const db = firestore!
  const copy = () => navigator.clipboard.writeText(team?.code ?? '').then(() => showToast(t('Code copied')), () => setError(t('Could not copy. Select the code and copy it by hand.')))
  const permsOf = (role: string) => team?.roles.find((r) => r.id === role)?.perms ?? []
  const canRemove = (m: Member) => m.uid !== me && m.role !== 'owner' && (owner || !permsOf(m.role).includes('people'))
  const roleName = (role: string) => (role === 'owner' ? t('Owner') : (team?.roles.find((r) => r.id === role)?.name ?? t('No role')))
  const editRole = (id: string, patch: Partial<RoleDef>) => setRoles((list) => list!.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const tick = (r: RoleDef, p: Perm, on: boolean) => editRole(r.id, { perms: PERMS.filter((x) => (x === p ? on : r.perms.includes(x))) })
  const page = (r: RoleDef, p: Page, on: boolean) => editRole(r.id, { pages: PAGES.filter((x) => (x === p ? on : r.pages.includes(x))) })
  const changed = (r: RoleDef) => JSON.stringify(r) !== JSON.stringify(team?.roles.find((x) => x.id === r.id))
  const builtIn = (id: string) => BUILT_IN.some((r) => r.id === id)

  if (error && !team) return <section className="set"><h3>{t('People')}</h3><p className="bad">{error}</p></section>
  if (!team) return <section className="set"><h3>{t('People')}</h3><p className="hint">{t('Loading…')}</p></section>
  return (
    <section className="set people">
      <h3>{t('People')}</h3>
      <div className="item-box">
        <b>{t('System code')}</b>
        <p className="hint">{t('Give this code only to the person you want in. They ask to join with it and you accept them. A new code is made automatically each time someone is accepted, so a code cannot be reused or passed on.')}</p>
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
        {confirm === 'reset' && <p className="hint">{t('The old code stops working, and the people still waiting have to ask again with the new one.')}</p>}
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
            {owner && m.role !== 'owner' ? (
              <select className="role-pick" aria-label={t('Role')} value={team.roles.some((r) => r.id === m.role) ? m.role : ''} onChange={(e) => e.target.value && run(setRole(db, m.uid, e.target.value), 'Saved')}>
                {!team.roles.some((r) => r.id === m.role) && <option value="">{t('No role')}</option>}
                {team.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            ) : (
              <Chip tone={m.role === 'owner' ? 'good' : 'neutral'}>{roleName(m.role)}</Chip>
            )}
            {canRemove(m) && (confirm === m.uid ? (
              <button className="btn btn-danger" onClick={() => run(removeMember(db, m), 'Removed')}>{t('Yes, remove')}</button>
            ) : (
              <button className="btn btn-ghost" onClick={() => setConfirm(m.uid)} aria-label={t('Remove')}><Icon name="trash" size={18} /></button>
            ))}
          </div>
        ))}
      </div>

      {owner && roles && (
        <div className="item-box">
          <b>{t('Roles')} <span className="group-count">{roles.length}</span></b>
          <p className="hint">{t('A role is a set of permissions. Tick what each role may do, then give the role to people above. The owner can always do everything.')}</p>
          {roles.map((r) => {
            const saved = team.roles.some((x) => x.id === r.id)
            const used = team.members.filter((m) => m.role === r.id).length
            return (
              <fieldset key={r.id} className="role">
                <label><span>{t('Role name')}</span><input dir="auto" maxLength={60} value={r.name} onChange={(e) => editRole(r.id, { name: e.target.value })} /></label>
                {PERMS.map((p) => (
                  <label key={p} className="check perm">
                    <input type="checkbox" checked={r.perms.includes(p)} onChange={(e) => tick(r, p, e.target.checked)} />
                    <span><b>{t(PERM_LABEL[p][0])}</b><small className="muted">{t(PERM_LABEL[p][1])}</small></span>
                  </label>
                ))}
                <span className="role-pages-title">{t('Pages this role sees')}</span>
                <div className="role-pages">
                  {PAGES.map((p) => (
                    <label key={p} className="check">
                      <input type="checkbox" checked={r.pages.includes(p)} onChange={(e) => page(r, p, e.target.checked)} />
                      <span>{t(PAGE_LABEL[p])}</span>
                    </label>
                  ))}
                </div>
                <p className="hint">{t('Home and Settings are always shown. Review, Fix and Planner also need their permission above.')}</p>
                <div className="actions">
                  <button className="btn btn-primary" disabled={!r.name.trim() || (saved && !changed(r))} onClick={() => run(saveRole(db, r), 'Saved')}>{t('Save')}</button>
                  {!builtIn(r.id) && (!saved ? (
                    <button className="btn btn-ghost" onClick={() => setRoles(roles.filter((x) => x.id !== r.id))}>{t('Cancel')}</button>
                  ) : used ? (
                    <span className="muted small">{used} {t('people have this role')}</span>
                  ) : confirm === `role:${r.id}` ? (
                    <button className="btn btn-danger" onClick={() => run(deleteRole(db, r.id), 'Deleted')}>{t('Yes, delete')}</button>
                  ) : (
                    <button className="btn btn-ghost" onClick={() => setConfirm(`role:${r.id}`)} aria-label={t('Delete')}><Icon name="trash" size={18} /></button>
                  ))}
                </div>
              </fieldset>
            )
          })}
          <button className="btn" onClick={() => setRoles([...roles, { id: newRoleId(), name: '', perms: [], pages: [...PAGES] }])}><Icon name="plus" size={18} />{t('Add a role')}</button>
        </div>
      )}
      {error && <p className="bad">{error}</p>}
    </section>
  )
}
