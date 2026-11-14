import { useState } from 'react'
import { resetDemo } from '../data/localBackend'
import { allowed, backend, editsTemplates, postWork, restartDemo, signOutNow, type Session } from '../data/store'
import type { CaptionTemplate } from '../data/types'
import { setLang, t, useLang } from '../i18n'
import { PeoplePanel, RolesPanel, useTeam } from './MembersSection'
import { Sheet } from './Sheet'
import { Chip, Icon, showToast } from './ui'

/** "5 min ago" for the engine's last sign of life. */
export function agoLabel(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60000)
  if (min < 1) return t('just now')
  if (min < 60) return `${min} ${t('min ago')}`
  return `${Math.round(min / 60)} ${t('h ago')}`
}

type Tab = 'general' | 'people' | 'roles' | 'posters'
const TAB_KEY = 'posterpilot.settings.tab'

export function SettingsSheet({ session, onClose }: { session: Session; onClose: () => void }) {
  const cloudIn = session.mode === 'cloud' && session.access === 'in'
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'general', label: 'General', icon: 'user' },
    ...(cloudIn && allowed('people') ? [{ id: 'people' as Tab, label: 'People', icon: 'users' }] : []),
    ...(cloudIn && session.role === 'owner' ? [{ id: 'roles' as Tab, label: 'Roles', icon: 'shield' }] : []),
    ...(postWork() || editsTemplates() ? [{ id: 'posters' as Tab, label: 'Posters', icon: 'review' }] : []),
  ]
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY) as Tab | null
      return saved && tabs.some((x) => x.id === saved) ? saved : 'general'
    } catch {
      return 'general'
    }
  })
  const choose = (id: Tab) => {
    setTab(id)
    try { localStorage.setItem(TAB_KEY, id) } catch { /* the tab is only remembered when storage works */ }
  }
  const team = useTeamWhen(tabs.some((x) => x.id === 'people' || x.id === 'roles'))
  const waiting = team?.team?.requests.length ?? 0

  return (
    <Sheet title={t('Settings')} onClose={onClose}>
      <div className="settings">
        <nav className="set-tabs" role="tablist" aria-label={t('Settings')}>
          {tabs.map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'on' : ''} onClick={() => choose(x.id)}>
              <Icon name={x.icon} size={18} /><span>{t(x.label)}</span>
              {x.id === 'people' && waiting > 0 && <i className="count">{waiting}</i>}
            </button>
          ))}
        </nav>
        <div className="set-content">
          {tab === 'general' && <General session={session} onClose={onClose} />}
          {tab === 'people' && team && <PeoplePanel session={session} state={team} />}
          {tab === 'roles' && team && <RolesPanel state={team} />}
          {tab === 'posters' && <PosterSettings session={session} />}
        </div>
      </div>
    </Sheet>
  )
}

/** The team is read only for people who manage it. */
function useTeamWhen(needed: boolean) {
  const state = useTeam(needed)
  return needed ? state : null
}

function General({ session, onClose }: { session: Session; onClose: () => void }) {
  const lang = useLang()
  const health = session.data.health
  const name = session.user?.displayName || session.user?.email || t('Demo mode')
  return (
    <div className="set-panel">
      <section className="set-card">
        <header className="set-card-head"><h3>{t('Account')}</h3></header>
        {session.mode === 'demo' ? (
          <>
            <p className="hint"><b>{t('Demo mode')}.</b> {t('Sample data in this browser. Nothing is posted.')}</p>
            <div className="actions"><button className="btn" onClick={() => { resetDemo(); restartDemo(); onClose() }}><Icon name="redo" size={18} />{t('Reset the demo')}</button></div>
          </>
        ) : (
          <div className="person me">
            <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
            <span className="person-main"><b dir="auto">{name}</b><span className="muted small" dir="ltr">{session.user?.email}</span></span>
            <span className="person-acts">
              {session.roleName && <Chip tone={session.role === 'owner' ? 'good' : 'neutral'}>{t(session.roleName)}</Chip>}
              <button className="btn" onClick={() => signOutNow()}>{t('Sign out')}</button>
            </span>
          </div>
        )}
      </section>
      <section className="set-card">
        <header className="set-card-head"><h3>{t('Language')}</h3></header>
        <div className="seg">
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
          <button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>العربية</button>
        </div>
      </section>
      {session.mode === 'cloud' && postWork() && (
        <section className="set-card">
          <header className="set-card-head"><h3>{t('Engine')}</h3>{health && <Chip tone={Date.now() - health.lastSync < 30 * 60_000 ? 'good' : 'bad'}>{agoLabel(health.lastSync)}</Chip>}</header>
          <p className="hint">{health ? `${t('Last sync')}: ${agoLabel(health.lastSync)}. ${t('The engine (n8n) builds the posters, keeps prices up to date and posts to Facebook and Instagram.')}` : t('No signal from the engine yet.')}</p>
        </section>
      )}
    </div>
  )
}

function PosterSettings({ session }: { session: Session }) {
  const [templates, setTemplates] = useState<CaptionTemplate[]>(session.data.templates)
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(templates) !== JSON.stringify(session.data.templates)
  const edit = (i: number, patch: Partial<CaptionTemplate>) => setTemplates(templates.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const save = () => {
    setBusy(true)
    backend.saveTemplates(templates.filter((x) => x.name.trim())).then(
      () => showToast(t('Saved')),
      (e: { code?: string }) => showToast(e.code === 'permission-denied' ? t('Your role does not allow this.') : t('Could not save. Check the connection.')),
    ).finally(() => setBusy(false))
  }
  return (
    <div className="set-panel form">
      {postWork() && (
        <section className="set-card">
          <header className="set-card-head"><h3>{t('Posting rules')}</h3></header>
          <p className="hint">{t('An approved post is scheduled only once it has a date and a time. Set them in the post or drag it onto a time in the Planner. Nothing is scheduled automatically.')}</p>
        </section>
      )}
      {editsTemplates() && (
        <section className="set-card">
          <header className="set-card-head"><h3>{t('Caption templates')}</h3><span className="group-count">{templates.length}</span></header>
          <p className="hint">{t('Placeholders: {name} {price} {before} {category} {company} {details}. A line whose value is empty is left out.')}</p>
          {templates.map((x, i) => (
            <fieldset key={i} className="item-box">
              <label><span>{t('Template name')}</span><input value={x.name} readOnly={x.name.toLowerCase() === 'default' && session.data.templates.some((s) => s.name === x.name)} onChange={(e) => edit(i, { name: e.target.value })} /></label>
              <label><span>{t('Caption')}</span><textarea dir="auto" rows={6} value={x.text} onChange={(e) => edit(i, { text: e.target.value })} /></label>
              {x.name.toLowerCase() !== 'default' && <button className="link link-danger" onClick={() => setTemplates(templates.filter((_, k) => k !== i))}><Icon name="trash" size={16} />{t('Delete')}</button>}
            </fieldset>
          ))}
          <div className="actions">
            <button className="btn" onClick={() => setTemplates([...templates, { name: '', text: '🔵 {name}\n🟠 {price} EGP' }])}><Icon name="plus" size={18} />{t('Add a template')}</button>
            <button className="btn btn-primary" disabled={!dirty || busy} onClick={save}>{t('Save templates')}</button>
            {dirty && <button className="btn btn-ghost" onClick={() => setTemplates(session.data.templates)}>{t('Undo changes')}</button>}
          </div>
        </section>
      )}
    </div>
  )
}
