import { useCallback, useEffect, useState } from 'react'
import { firestore } from '../data/firebase'
import type { Session } from '../data/store'
import { accept, BUILT_IN, decline, deleteRole, loadTeam, newRoleId, PAGE_LABEL, PAGES, PERM_LABEL, PERMS, removeMember, resetCode, saveRole, setRole, type Member, type Page, type Perm, type RoleDef, type Team } from '../data/team'
import { t, tn } from '../i18n'
import { Avatar, Chip, Icon, showToast } from './ui'

/** The people, requests, code and roles, read once when Settings opens and again after each change. */
export function useTeam(enabled = true) {
  const [team, setTeam] = useState<Team | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    if (!firestore || !enabled) return
    loadTeam(firestore).then((x) => { setTeam(x); setError('') }, (e: Error) => setError(e.message))
  }, [enabled])
  useEffect(load, [load])
  /** Runs one change, says so, and reads the lists again. */
  const run = (work: Promise<unknown>, message: string) =>
    work.then(() => { showToast(t(message)); load() }, (e: Error) => setError(e.message))
  return { team, error, run }
}
export type TeamState = ReturnType<typeof useTeam>

const roleNameOf = (team: Team, role: string) => (role === 'owner' ? t('Owner') : (team.roles.find((r) => r.id === role)?.name ?? t('No role')))

/** The system code, the people asking to join and the people inside. Owner and people managers only. */
export function PeoplePanel({ session, state }: { session: Session; state: TeamState }) {
  const { team, error, run } = state
  const [confirm, setConfirm] = useState('')
  const owner = session.role === 'owner'
  const me = session.user?.uid
  const db = firestore!
  if (!team) return error ? <p className="bad">{error}</p> : <p className="hint">{t('Loading…')}</p>
  const act = (work: Promise<unknown>, message: string) => run(work, message).then(() => setConfirm(''))
  const copy = () => navigator.clipboard.writeText(team.code).then(() => showToast(t('Code copied')), () => showToast(t('Could not copy. Select the code and copy it by hand.')))
  const permsOf = (role: string) => team.roles.find((r) => r.id === role)?.perms ?? []
  const canRemove = (m: Member) => m.uid !== me && m.role !== 'owner' && (owner || !permsOf(m.role).includes('people'))

  return (
    <div className="set-panel">
      <section className="set-card">
        <header className="set-card-head"><h3>{t('System code')}</h3></header>
        <p className="hint">{t('Give this code only to the person you want in. They ask to join with it and you accept them. A new code is made automatically each time someone is accepted, so a code cannot be reused or passed on.')}</p>
        <code className="code" dir="ltr">{team.code || '—'}</code>
        <div className="actions">
          <button className="btn btn-primary" onClick={copy} disabled={!team.code}><Icon name="link" size={18} />{t('Copy')}</button>
          {owner && (confirm === 'reset' ? (
            <>
              <button className="btn btn-danger" onClick={() => act(resetCode(db), 'New code made')}>{t('Yes, make a new code')}</button>
              <button className="btn btn-ghost" onClick={() => setConfirm('')}>{t('Cancel')}</button>
            </>
          ) : (
            <button className="btn" onClick={() => setConfirm('reset')}><Icon name="redo" size={18} />{t('New code')}</button>
          ))}
        </div>
        {confirm === 'reset' && <p className="hint">{t('The old code stops working, and the people still waiting have to ask again with the new one.')}</p>}
      </section>

      <section className="set-card">
        <header className="set-card-head"><h3>{t('Asking to join')}</h3><span className="group-count">{team.requests.length}</span></header>
        {!team.requests.length && <p className="hint">{t('Nobody is waiting.')}</p>}
        {team.requests.map((r) => (
          <div key={r.uid} className="person">
            <Avatar uid={r.uid} name={r.name || r.email} />
            <span className="person-main"><b dir="auto">{r.name || r.email}</b><span className="muted small" dir="ltr">{r.email}</span></span>
            <span className="person-acts">
              <button className="btn btn-primary" onClick={() => act(accept(db, r), 'Accepted')}>{t('Accept')}</button>
              <button className="btn" onClick={() => act(decline(db, r), 'Declined')}>{t('Decline')}</button>
            </span>
          </div>
        ))}
      </section>

      <section className="set-card">
        <header className="set-card-head"><h3>{t('Members')}</h3><span className="group-count">{team.members.length}</span></header>
        {team.members.map((m) => (
          <div key={m.uid} className="person">
            <Avatar uid={m.uid} name={m.name || m.email} />
            <span className="person-main"><b dir="auto">{m.name || m.email}{m.uid === me && ` (${t('you')})`}</b><span className="muted small" dir="ltr">{m.email}</span></span>
            <span className="person-acts">
              {owner && m.role !== 'owner' ? (
                <select className="role-pick" aria-label={t('Role')} value={team.roles.some((r) => r.id === m.role) ? m.role : ''} onChange={(e) => e.target.value && act(setRole(db, m, e.target.value, { from: roleNameOf(team, m.role), to: roleNameOf(team, e.target.value) }), 'Saved')}>
                  {!team.roles.some((r) => r.id === m.role) && <option value="">{t('No role')}</option>}
                  {team.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              ) : (
                <Chip tone={m.role === 'owner' ? 'good' : 'neutral'}>{roleNameOf(team, m.role)}</Chip>
              )}
              {canRemove(m) && (confirm === m.uid ? (
                <>
                  <button className="btn btn-danger" onClick={() => act(removeMember(db, m), 'Removed')}>{t('Yes, remove')}</button>
                  <button className="btn btn-ghost" onClick={() => setConfirm('')}>{t('Cancel')}</button>
                </>
              ) : (
                <button className="icon-btn" onClick={() => setConfirm(m.uid)} aria-label={t('Remove')} title={t('Remove')}><Icon name="trash" size={18} /></button>
              ))}
            </span>
          </div>
        ))}
      </section>
      {error && <p className="bad">{error}</p>}
    </div>
  )
}

/** Permissions and pages grouped by the part of the app they belong to. */
/** permPages: pages that are switched on by a permission alone; they show among the page pills and tick that permission. */
const GROUPS: { title: string; hint: string; pages: Page[]; perms: Perm[]; permPages?: { perm: Perm; label: string }[] }[] = [
  { title: 'Shop', hint: 'Prices, the PC builder and maintenance tickets.', pages: ['prices', 'builder'], perms: ['prices.edit', 'prices.web', 'cost', 'quotes.all', 'quotes.discount', 'quotes.edit', 'tickets', 'tickets.edit'], permPages: [{ perm: 'tickets', label: 'Maintenance' }] },
  { title: 'Posters', hint: 'Offers, posters, the schedule and Facebook.', pages: ['offers', 'review', 'fix', 'calendar', 'posted', 'database'], perms: ['offers.view', 'offers.create', 'offers.approve', 'designs.approve', 'fix', 'schedule', 'brainstorm', 'delete', 'templates.edit'], permPages: [{ perm: 'brainstorm', label: 'Brainstorm' }] },
  { title: 'People', hint: 'Who is in the system, and what everyone did.', pages: [], perms: ['people', 'activity.view'] },
]

/** The roles the owner makes: what each may do and which pages it sees. Owner only. */
export function RolesPanel({ state }: { state: TeamState }) {
  const { team, error, run } = state
  const [roles, setRoles] = useState<RoleDef[] | null>(null)
  const [open, setOpen] = useState('')
  const [confirm, setConfirm] = useState('')
  // Start from the saved roles, and again after each save (keeping a new role that is not saved yet).
  const [seen, setSeen] = useState<Team | null>(null)
  if (team && team !== seen) {
    setSeen(team)
    setRoles((list) => {
      const mine = (id: string) => list?.find((r) => r.id === id)
      const was = (id: string) => seen?.roles.find((r) => r.id === id)
      // A role someone is still editing keeps their edits; a new role that is not saved yet stays.
      const kept = team.roles.map((r) => { const m = mine(r.id); const w = was(r.id); return m && w && JSON.stringify(m) !== JSON.stringify(w) ? m : r })
      return [...kept, ...(list ?? []).filter((r) => !team.roles.some((x) => x.id === r.id) && !was(r.id))]
    })
  }
  if (!team || !roles) return error ? <p className="bad">{error}</p> : <p className="hint">{t('Loading…')}</p>
  const db = firestore!
  const editRole = (id: string, patch: Partial<RoleDef>) => setRoles(roles.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const tick = (r: RoleDef, p: Perm, on: boolean) => editRole(r.id, { perms: PERMS.filter((x) => (x === p ? on : r.perms.includes(x))) })
  const page = (r: RoleDef, p: Page, on: boolean) => editRole(r.id, { pages: PAGES.filter((x) => (x === p ? on : r.pages.includes(x))) })
  const changed = (r: RoleDef) => JSON.stringify(r) !== JSON.stringify(team.roles.find((x) => x.id === r.id))
  const builtIn = (id: string) => BUILT_IN.some((r) => r.id === id)
  const add = () => {
    const r: RoleDef = { id: newRoleId(), name: '', perms: [], pages: [...PAGES] }
    setRoles([...roles, r])
    setOpen(r.id)
  }

  return (
    <div className="set-panel form">
      <p className="hint">{t('A role is a set of permissions. Tick what each role may do, then give the role to people in People. The owner can always do everything.')}</p>
      {roles.map((r) => {
        const saved = team.roles.some((x) => x.id === r.id)
        const used = team.members.filter((m) => m.role === r.id).length
        const isOpen = open === r.id
        return (
          <section key={r.id} className={`set-card role-card${isOpen ? ' open' : ''}`}>
            <button className="role-sum" onClick={() => setOpen(isOpen ? '' : r.id)} aria-expanded={isOpen}>
              <Icon name="shield" size={20} />
              <span className="role-sum-main">
                <b dir="auto">{r.name || t('New role')}</b>
                <span className="muted small">{[tn(r.perms.length === 1 ? '1 permission' : '%n permissions', { n: r.perms.length }), tn(r.pages.length === 1 ? '1 page' : '%n pages', { n: r.pages.length }), tn(used === 1 ? '1 person' : '%n people', { n: used })].join(' · ')}</span>
              </span>
              {saved && changed(r) && <Chip tone="warn">{t('Not saved')}</Chip>}
              <Icon name={isOpen ? 'minus' : 'plus'} size={18} />
            </button>
            {isOpen && (
              <div className="role-body">
                <label><span>{t('Role name')}</span><input dir="auto" maxLength={60} value={r.name} onChange={(e) => editRole(r.id, { name: e.target.value })} /></label>
                {GROUPS.map((g) => (
                  <div key={g.title} className="perm-group">
                    <div className="perm-group-head"><b>{t(g.title)}</b><span className="muted small">{t(g.hint)}</span></div>
                    {g.pages.length > 0 && (
                      <div className="page-pills" role="group" aria-label={t('Pages this role sees')}>
                        <span className="muted small">{t('Pages')}</span>
                        {g.pages.map((p) => (
                          <label key={p} className={`page-pill${r.pages.includes(p) ? ' on' : ''}`}>
                            <input type="checkbox" checked={r.pages.includes(p)} onChange={(e) => page(r, p, e.target.checked)} />
                            {r.pages.includes(p) && <Icon name="check" size={14} />}{t(PAGE_LABEL[p])}
                          </label>
                        ))}
                        {g.permPages?.map((x) => (
                          <label key={x.perm} className={`page-pill${r.perms.includes(x.perm) ? ' on' : ''}`}>
                            <input type="checkbox" checked={r.perms.includes(x.perm)} onChange={(e) => tick(r, x.perm, e.target.checked)} />
                            {r.perms.includes(x.perm) && <Icon name="check" size={14} />}{t(x.label)}
                          </label>
                        ))}
                      </div>
                    )}
                    {g.perms.map((p) => (
                      <label key={p} className="check perm">
                        <input type="checkbox" checked={r.perms.includes(p)} onChange={(e) => tick(r, p, e.target.checked)} />
                        <span><b>{t(PERM_LABEL[p][0])}</b><small className="muted">{t(PERM_LABEL[p][1])}</small></span>
                      </label>
                    ))}
                  </div>
                ))}
                <p className="hint">{t('Home and Settings are always shown. A page also needs its permission to do anything there.')}</p>
                <div className="actions">
                  <button className="btn btn-primary" disabled={!r.name.trim() || (saved && !changed(r))} onClick={() => run(saveRole(db, r), 'Saved')}>{t('Save')}</button>
                  {saved && changed(r) && <button className="btn btn-ghost" onClick={() => editRole(r.id, team.roles.find((x) => x.id === r.id)!)}>{t('Undo changes')}</button>}
                  {!builtIn(r.id) && (!saved ? (
                    <button className="btn btn-ghost" onClick={() => setRoles(roles.filter((x) => x.id !== r.id))}>{t('Cancel')}</button>
                  ) : used ? (
                    <span className="muted small">{tn(used === 1 ? '1 person has this role, so it cannot be deleted.' : '%n people have this role, so it cannot be deleted.', { n: used })}</span>
                  ) : confirm === r.id ? (
                    <button className="btn btn-danger" onClick={() => run(deleteRole(db, r), 'Deleted').then(() => setConfirm(''))}>{t('Yes, delete')}</button>
                  ) : (
                    <button className="btn btn-ghost" onClick={() => setConfirm(r.id)}><Icon name="trash" size={18} />{t('Delete role')}</button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )
      })}
      <button className="btn" onClick={add}><Icon name="plus" size={18} />{t('Add a role')}</button>
      {error && <p className="bad">{error}</p>}
    </div>
  )
}
