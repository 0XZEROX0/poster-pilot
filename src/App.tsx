import { useCallback, useEffect, useState } from 'react'
import { CalendarView } from './components/CalendarView'
import { FixView } from './components/FixView'
import { HomeView, type Tab } from './components/HomeView'
import { NewPostSheet } from './components/NewPostSheet'
import { PostedView } from './components/PostedView'
import { PostSheet } from './components/PostSheet'
import { ReviewView } from './components/ReviewView'
import { agoLabel, SettingsSheet } from './components/SettingsSheet'
import { Icon, Toast } from './components/ui'
import { useDesktop } from './components/useDesktop'
import { cairoNow, stageOf } from './data/logic'
import { signIn, signOutNow, useSession } from './data/store'
import { locale, t, useLang } from './i18n'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'review', label: 'Review', icon: 'review' },
  { id: 'fix', label: 'Fix', icon: 'fix' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'posted', label: 'Posted', icon: 'posted' },
]

type Overlay = { kind: 'post'; id: string } | { kind: 'new' } | { kind: 'settings' } | null

const tabFromHash = (): Tab => TABS.find((x) => `#/${x.id}` === location.hash)?.id ?? 'home'

/** The engine is "quiet" when it has not written its sign of life for this long. */
const QUIET_MS = 20 * 60 * 1000

export default function App() {
  useLang()
  const session = useSession()
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const desktop = useDesktop()

  // The tab lives in the address, so the phone's back button moves between screens.
  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (next: Tab) => {
    location.hash = `#/${next}`
    window.scrollTo(0, 0)
    document.querySelector('.desk-main')?.scrollTo(0, 0)
  }
  const close = useCallback(() => setOverlay(null), [])
  const open = (id: string) => setOverlay({ kind: 'post', id })

  if (session.mode === 'cloud' && session.user === undefined) return <div className="splash">{t('Loading…')}</div>
  if (session.mode === 'cloud' && !session.user) {
    return (
      <div className="splash">
        <Logo size={72} />
        <h1>{t('PosterPilot')}</h1>
        <p>{t('Review, fix and schedule your posters.')}</p>
        <button className="btn btn-primary" onClick={signIn}>{t('Sign in with Google')}</button>
        {session.error && <p className="bad">{session.error}</p>}
      </div>
    )
  }
  if (session.mode === 'cloud' && /permission|insufficient/i.test(session.error)) {
    return (
      <div className="splash">
        <Logo size={72} />
        <p className="bad">{t('This account is not allowed to open the app.')}</p>
        <p dir="ltr">{session.user?.email}</p>
        <button className="btn" onClick={() => signOutNow()}>{t('Sign out')}</button>
      </div>
    )
  }

  const { data } = session
  const counts: Partial<Record<Tab, number>> = {
    review: data.posts.filter((p) => stageOf(p) === 'review').length,
    fix: data.posts.filter((p) => stageOf(p) === 'fix').length,
  }
  const openPost = overlay?.kind === 'post' ? data.posts.find((p) => p.id === overlay.id) : undefined
  const health = data.health
  const quiet = session.mode === 'cloud' && data.loaded && (!health || Date.now() - health.lastSync > QUIET_MS)

  const title = t(tab === 'home' ? (desktop ? 'Dashboard' : 'PosterPilot') : TABS.find((x) => x.id === tab)!.label)
  const banners = (
    <>
      {session.mode === 'demo' && <p className="banner"><b>{t('Demo mode')}.</b> {t('Sample data in this browser. Nothing is posted.')}</p>}
      {quiet && <p className="banner banner-bad">{t('The engine has been quiet for a while. Check that n8n is running.')}</p>}
      {session.error && <p className="banner banner-bad" dir="ltr">{session.error}</p>}
    </>
  )
  const page = !data.loaded ? (
    <div className="splash">{t('Loading…')}</div>
  ) : tab === 'home' ? (
    <HomeView data={data} go={go} onOpen={open} desktop={desktop} />
  ) : tab === 'review' ? (
    <ReviewView data={data} onOpen={open} />
  ) : tab === 'fix' ? (
    <FixView data={data} onOpen={open} />
  ) : tab === 'calendar' ? (
    <CalendarView data={data} onOpen={open} />
  ) : (
    <PostedView data={data} onOpen={open} />
  )
  const overlays = (
    <>
      {openPost && <PostSheet key={openPost.id} post={openPost} data={data} onClose={close} />}
      {overlay?.kind === 'new' && <NewPostSheet data={data} onClose={close} />}
      {overlay?.kind === 'settings' && <SettingsSheet session={session} onClose={close} />}
      <Toast />
    </>
  )

  // Desktop website: a sidebar and a dashboard that fills the window.
  if (desktop) {
    const name = session.user?.displayName || session.user?.email || t('Demo mode')
    return (
      <div className="desk">
        <aside className="sidebar">
          <div className="brand"><Logo size={34} />{t('PosterPilot')}</div>
          <button className="btn btn-primary side-add" onClick={() => setOverlay({ kind: 'new' })}><Icon name="plus" size={20} />{t('New post')}</button>
          <nav className="side-nav">
            {TABS.map((x) => (
              <button key={x.id} className={x.id === tab ? 'on' : ''} onClick={() => go(x.id)} aria-current={x.id === tab ? 'page' : undefined}>
                <Icon name={x.icon} size={20} />
                <span>{t(x.id === 'home' ? 'Dashboard' : x.label)}</span>
                {counts[x.id] ? <i className={x.id === 'fix' ? 'count count-bad' : 'count'}>{counts[x.id]}</i> : null}
              </button>
            ))}
            <button onClick={() => setOverlay({ kind: 'settings' })}><Icon name="settings" size={20} /><span>{t('Settings')}</span></button>
          </nav>
          <div className="side-foot">
            {session.mode === 'cloud' && (
              <p className="side-engine"><span className={`health${quiet ? ' health-bad' : ''}`} />{t('Engine')}: {health ? agoLabel(health.lastSync) : '—'}</p>
            )}
            <div className="side-user">
              <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
              <strong dir="auto">{name}</strong>
            </div>
          </div>
        </aside>
        <div className="desk-main">
          <header className="desk-top">
            <h1>{title}</h1>
            <span className="muted">{new Date(`${cairoNow().date}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</span>
          </header>
          {banners}
          <div className={`desk-content page-${tab}`}>{page}</div>
        </div>
        {overlays}
      </div>
    )
  }

  return (
    <div className="app">
      <header className="top">
        <Logo size={30} />
        <h1>{title}</h1>
        {session.mode === 'cloud' && <span className={`health${quiet ? ' health-bad' : ''}`} title={health ? agoLabel(health.lastSync) : ''} />}
        <button className="icon-btn" onClick={() => setOverlay({ kind: 'settings' })} aria-label={t('Settings')}><Icon name="settings" /></button>
      </header>
      {banners}
      <main>{page}</main>
      <button className="fab" onClick={() => setOverlay({ kind: 'new' })} aria-label={t('New post')}><Icon name="plus" size={26} /></button>
      <nav className="tabs">
        {TABS.map((x) => (
          <button key={x.id} className={x.id === tab ? 'on' : ''} onClick={() => go(x.id)} aria-current={x.id === tab ? 'page' : undefined}>
            <span className="tab-icon">
              <Icon name={x.icon} />
              {counts[x.id] ? <i className={x.id === 'fix' ? 'badge badge-bad' : 'badge'}>{counts[x.id]}</i> : null}
            </span>
            <span>{t(x.label)}</span>
          </button>
        ))}
      </nav>
      {overlays}
    </div>
  )
}

function Logo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#0f1b33" />
      <rect x="15" y="12" width="34" height="40" rx="5" fill="none" stroke="#3b82f6" strokeWidth="4" />
      <path d="M22 41l8-10 6 7 4-5 4 8z" fill="#3b82f6" />
      <circle cx="40" cy="23" r="4.5" fill="#f97316" />
    </svg>
  )
}
