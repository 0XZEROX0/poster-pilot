import { useRef, useState } from 'react'
import { resetDemo } from '../data/localBackend'
import { setTheme, useTheme, type Theme } from '../theme'
import { setLayout, useLayout } from '../layout'
import { allowed, backend, editsTemplates, postWork, restartDemo, signOutNow, type Session } from '../data/store'
import { useEngineSignal, type EngineJob } from '../data/nudge'
import type { CaptionTemplate } from '../data/types'
import { setLang, t, useLang } from '../i18n'
import { PeoplePanel, RolesPanel, useTeam } from './MembersSection'
import { Sheet } from './Sheet'
import { Avatar, Chip, Icon, showToast } from './ui'
import { backToGoogleName, backToGooglePhoto, myNameFor, removeMyPhoto, setMyName, setMyPhoto, useProfiles } from '../data/profiles'
import type { User } from 'firebase/auth'

/** "5 min ago" for the engine's last sign of life. */
export function agoLabel(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60000)
  if (min < 1) return t('just now')
  if (min < 60) return `${min} ${t('min ago')}`
  return `${Math.round(min / 60)} ${t('h ago')}`
}

type Tab = 'general' | 'people' | 'roles' | 'posters'
const TAB_KEY = 'posterpilot.settings.tab'
const THEME_LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark', auto: 'Auto' }

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
  const theme = useTheme()
  const layout = useLayout()
  const health = session.data.health
  useProfiles()
  const name = myNameFor(session.user) || t('Demo mode')
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
          <>
            <div className="person me">
              <Avatar uid={session.user?.uid} name={name} photo={session.user?.photoURL ?? ''} />
              <span className="person-main"><b dir="auto">{name}</b><span className="muted small" dir="ltr">{session.user?.email}</span></span>
              <span className="person-acts">
                {session.roleName && <Chip tone={session.role === 'owner' ? 'good' : 'neutral'}>{t(session.roleName)}</Chip>}
                <button className="btn" onClick={() => signOutNow()}>{t('Sign out')}</button>
              </span>
            </div>
            {session.user && <PhotoControls user={session.user} />}
          </>
        )}
      </section>
      <section className="set-card">
        <header className="set-card-head"><h3>{t('Language')}</h3></header>
        <div className="seg">
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
          <button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>العربية</button>
        </div>
      </section>
      <section className="set-card">
        <header className="set-card-head"><h3>{t('Theme')}</h3></header>
        <div className="seg">
          {(['light', 'dark', 'auto'] as Theme[]).map((x) => (
            <button key={x} className={theme === x ? 'on' : ''} onClick={() => setTheme(x)}>{t(THEME_LABEL[x])}</button>
          ))}
        </div>
        <p className="hint">{t('Auto follows your device. Saved on this device.')}</p>
      </section>
      <section className="set-card">
        <header className="set-card-head"><h3>{t('Layout')}</h3></header>
        <div className="seg">
          <button className={layout === 'grid' ? 'on' : ''} onClick={() => setLayout('grid')}>{t('App grid')}</button>
          <button className={layout === 'classic' ? 'on' : ''} onClick={() => setLayout('classic')}>{t('Sidebar (old)')}</button>
        </div>
        <p className="hint">{t('App grid: a home screen with every app as an icon, and each app opens on its own screen. Sidebar: the old layout with every page in one menu. Saved on this device.')}</p>
      </section>
      {session.mode === 'cloud' && postWork() && (
        <section className="set-card">
          <header className="set-card-head"><h3>{t('Engine')}</h3>{health && <Chip tone={Date.now() - health.lastSync < 75 * 60_000 ? 'good' : 'bad'}>{agoLabel(health.lastSync)}</Chip>}</header>
          <p className="hint">{health ? `${t('Last sync')}: ${agoLabel(health.lastSync)}. ${t('The engine (n8n) builds the posters, keeps prices up to date and posts to Facebook and Instagram.')}` : t('No signal from the engine yet.')}</p>
          <SignalLine />
          {backend.runNow && <RunNow />}
        </section>
      )}
    </div>
  )
}

// How the app's last signal to the engine went: changes in the app start the engine's work at once only when it arrives.
function SignalLine() {
  const signal = useEngineSignal()
  if (!signal) return null
  const text = signal.state === 'heard' ? t('Received')
    : signal.state === 'sent' ? t('Sent')
    : signal.state === 'trying' ? t('Not received yet, trying again')
    : t('Not received. The change waits for the engine\'s next check.')
  return <p className="hint"><b>{t('Last signal from this app')}:</b> {text} ({agoLabel(signal.at)})</p>
}

// The engine's timed workflows, so someone can start one now instead of waiting for its next check.
// Changes made in the app already start the right one by themselves; this is for "do it now anyway".
const JOBS: { label: string; hint: string; jobs: EngineJob[] }[] = [
  { label: 'Posters', hint: 'Carry out post changes and build the posters that are waiting.', jobs: ['app', 'poster'] },
  { label: 'Facebook and Instagram', hint: 'Schedule posts that have a date and time, carry out changes and cancels, write captions, check what was published.', jobs: ['queue', 'changes', 'captions', 'status', 'instagram'] },
  { label: 'Published posters', hint: 'Move the posters of published posts to the Published folder.', jobs: ['move'] },
  { label: 'Product list', hint: 'Update the product list and the prices of open posts from the price list.', jobs: ['lists'] },
  { label: 'Competitor prices', hint: 'Check competitor prices of offers that are waiting.', jobs: ['market'] },
  { label: 'Website', hint: 'Send price list changes to the website and read changes made on the website.', jobs: ['website', 'pull'] },
]
const ALL_JOBS = [...new Set(JOBS.flatMap((j) => j.jobs))]

function RunNow() {
  const [sent, setSent] = useState<Record<string, number>>({})
  const run = (key: string, jobs: EngineJob[]) => {
    setSent((x) => ({ ...x, [key]: Date.now() }))
    // Pressing again is possible after a short pause, so a second press does not start a second run at once.
    setTimeout(() => setSent((x) => { const { [key]: _gone, ...rest } = x; return rest }), 20_000)
    backend.runNow?.(jobs).then(
      (ok) => showToast(ok ? t('Started. It runs on the engine computer.') : t('Could not reach the engine. It still runs on its schedule.')),
      () => showToast(t('Could not reach the engine. It still runs on its schedule.')),
    )
  }
  return (
    <>
      <p className="hint">{t('Changes in the app start the right job by themselves. Run one now if you do not want to wait for its next check.')}</p>
      {JOBS.map((j) => (
        <div key={j.label} className="person">
          <span className="person-main"><b>{t(j.label)}</b><span className="muted small run-hint">{t(j.hint)}</span></span>
          <span className="person-acts"><button className="btn" disabled={!!sent[j.label]} onClick={() => run(j.label, j.jobs)}><Icon name="redo" size={16} />{sent[j.label] ? t('Started') : t('Run now')}</button></span>
        </div>
      ))}
      <div className="actions"><button className="btn btn-primary" disabled={!!sent.all} onClick={() => run('all', ALL_JOBS)}>{sent.all ? t('Started') : t('Run everything now')}</button></div>
    </>
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

/**
 * Change your own picture and the name the app shows for you. Both stay as chosen whatever happens:
 * signing out and in, another phone, or a new name or picture on the Google account.
 */
function PhotoControls({ user }: { user: User }) {
  const mine = useProfiles().get(user.uid)
  const [busy, setBusy] = useState(false)
  const [naming, setNaming] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const run = async (job: () => Promise<void>, after?: () => void) => {
    setBusy(true)
    try {
      await job()
      after?.()
      showToast(t('Saved'))
    } catch (e) {
      const m = (e as Error).message
      showToast(m === 'not-image' ? t('Pick a picture file.') : m === 'empty-name' ? t('Type a name.') : t('Could not save. Try again.'))
    } finally {
      setBusy(false)
    }
  }
  const custom = mine?.custom ?? false
  const google = user.displayName || user.email || ''
  if (naming !== null) {
    return (
      <form className="form name-edit" onSubmit={(e) => { e.preventDefault(); void run(() => setMyName(user, naming), () => setNaming(null)) }}>
        <label>
          <span>{t('Your name in the app')}</span>
          <input autoFocus dir="auto" maxLength={60} value={naming} onChange={(e) => setNaming(e.target.value)} />
        </label>
        <p className="hint">{t('Everyone sees this name next to what you do. It stays even if you sign out or change your Google name.')}</p>
        <div className="photo-acts">
          <button className="btn btn-primary" type="submit" disabled={busy || !naming.trim()}>{t('Save name')}</button>
          {mine?.nameCustom && google && <button className="btn" type="button" disabled={busy} onClick={() => run(() => backToGoogleName(user), () => setNaming(null))}>{t('Use my Google name')}</button>}
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setNaming(null)}>{t('Cancel')}</button>
        </div>
      </form>
    )
  }
  return (
    <div className="photo-acts">
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(() => setMyPhoto(user, f)) }} />
      <button className="btn" disabled={busy} onClick={() => input.current?.click()}><Icon name="edit" size={18} />{t('Change photo')}</button>
      <button className="btn" disabled={busy} onClick={() => setNaming(myNameFor(user))}><Icon name="edit" size={18} />{t('Change name')}</button>
      {custom && user.photoURL && <button className="btn" disabled={busy} onClick={() => run(() => backToGooglePhoto(user))}>{t('Use my Google photo')}</button>}
      {(mine ? mine.photo : user.photoURL) && <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => removeMyPhoto(user))}>{t('Remove photo')}</button>}
    </div>
  )
}
