import { Fragment, useCallback, useEffect, useState } from 'react'
import { PlannerView } from './components/PlannerView'
import { BrainstormView } from './components/BrainstormView'
import { FixView } from './components/FixView'
import { HomeView, type Tab } from './components/HomeView'
import { JoinScreen } from './components/JoinScreen'
import { NewPostSheet } from './components/NewPostSheet'
import { OffersView } from './components/OffersView'
import { PostedView } from './components/PostedView'
import { PricesView } from './components/PricesView'
import { BuilderView } from './components/BuilderView'
import { PostSheet } from './components/PostSheet'
import { ReviewView } from './components/ReviewView'
import { agoLabel, SettingsSheet } from './components/SettingsSheet'
import { Avatar, Icon, showToast, Toast } from './components/ui'
import { myNameFor, useProfiles } from './data/profiles'
import { AppsMenu, usePins } from './components/AppsMenu'
import { useDesktop } from './components/useDesktop'
import { cairoNow, offerOf, stageOf } from './data/logic'
import { applyEditToStored, builderOpen, edits } from './data/builder'
import { DatabaseView } from './components/DatabaseView'
import { ActivityView } from './components/ActivityView'
import { MaintenanceView } from './components/MaintenanceView'
import { OrdersView } from './components/OrdersView'
import { HrView } from './components/HrView'
import { ClockPrompt } from './components/ClockPrompt'
import { allowed, isOwner, myId, ownOffer, postWork, seesPage, signIn, signOutNow, useSession } from './data/store'
import type { Perm } from './data/team'
import { locale, t, tn, useLang } from './i18n'
import { useEngineSignal } from './data/nudge'
import { APP_GROUPS, AppIcon, Launcher } from './components/Launcher'
import { useLayout } from './layout'

/** What a tab needs. A tab the person's role cannot use is not shown. */
const NEEDS: Partial<Record<Tab, Perm>> = { review: 'designs.approve', fix: 'fix', calendar: 'schedule', activity: 'activity.view', brainstorm: 'brainstorm', maintenance: 'tickets', orders: 'orders' }

const ALL_TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'prices', label: 'Prices', icon: 'prices' },
  { id: 'builder', label: 'Builder', icon: 'builder' },
  { id: 'maintenance', label: 'Maintenance', icon: 'wrench' },
  { id: 'orders', label: 'Orders', icon: 'cart' },
  { id: 'offers', label: 'Offers', icon: 'offer' },
  { id: 'review', label: 'Review', icon: 'review' },
  { id: 'fix', label: 'Fix', icon: 'fix' },
  { id: 'calendar', label: 'Planner', icon: 'calendar' },
  { id: 'brainstorm', label: 'Brainstorm', icon: 'idea' },
  { id: 'posted', label: 'Posted', icon: 'posted' },
  { id: 'database', label: 'Database', icon: 'database' },
  { id: 'hr', label: 'HR', icon: 'badge' },
  { id: 'activity', label: 'Activity', icon: 'clock' },
]

type Overlay = { kind: 'post'; id: string } | { kind: 'new' } | { kind: 'settings' } | { kind: 'apps' } | null

// A tab can carry more after its name (the planner keeps its day there: #/calendar/2026-11-16).
const tabFromHash = (): Tab => ALL_TABS.find((x) => location.hash === `#/${x.id}` || location.hash.startsWith(`#/${x.id}/`))?.id ?? 'home'

/** Sidebar headings: the shop tools, then everything about posters. */
const groupOf = (id: string) => (id === 'home' ? '' : id === 'prices' || id === 'builder' || id === 'maintenance' || id === 'orders' ? 'Shop' : id === 'activity' || id === 'hr' ? 'Team' : 'Posters')

/** The engine is "quiet" when it has not written its sign of life for this long. */
// The engine's timed run (which writes the heartbeat) is now hourly; the app's signals start everything else.
const QUIET_MS = 75 * 60 * 1000

export default function App() {
  useLang()
  const session = useSession()
  useProfiles()
  const signal = useEngineSignal()
  const [wanted, setTab] = useState<Tab>(tabFromHash)
  // The app grid (default) or the older sidebar layout, chosen in Settings.
  const solo = useLayout() === 'grid'
  const TABS = ALL_TABS.filter((x) => (x.id === 'dashboard' ? solo : true)).filter((x) => x.id === 'home' || x.id === 'dashboard' || x.id === 'activity' || x.id === 'brainstorm' || x.id === 'maintenance' || x.id === 'orders' || x.id === 'hr' || seesPage(x.id)).filter((x) => (x.id === 'hr' ? allowed('hr.clock') || allowed('hr.fix') || allowed('hr') : x.id === 'maintenance' ? allowed('tickets') || allowed('tickets.edit') : x.id === 'orders' ? allowed('orders') || allowed('orders.edit') || allowed('orders.change') || allowed('orders.delete') : x.id === 'offers' ? allowed('offers.view') || allowed('offers.approve') || allowed('offers.create') : !NEEDS[x.id] || allowed(NEEDS[x.id]!)))
  const tab = TABS.some((x) => x.id === wanted) ? wanted : 'home'
  const canAdd = allowed('offers.create')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const desktop = useDesktop()
  const { pins, toggle: togglePin } = usePins(TABS.map((x) => x.id))

  // Someone changed this person's quote (Live quotes) while their Builder was closed: keep the change for when they open it.
  const builderUser = session.mode === 'cloud' && session.access === 'in' && seesPage('builder') ? session.user?.uid : undefined
  useEffect(() => {
    if (!builderUser) return
    return edits.watchMine((e) => {
      if (builderOpen.current) return
      void edits.clearMine()
      if (applyEditToStored(e)) showToast(tn('%name changed your quote. Open the Builder to see it.', { name: e.byName || t('Someone') }))
    })
  }, [builderUser])

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
  // Keep the open app visible in its group's menu (on a phone the menu scrolls sideways).
  useEffect(() => { document.querySelector('.appbar-menu .on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [wanted])
  // A minute tick, so things that depend on the time (a retry that ran out, a quiet engine) update on their own.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  // An open post is a step in the browser's history too: Back closes it, Forward opens it again.
  useEffect(() => {
    const onPop = () => {
      const id = (history.state as { post?: string } | null)?.post
      setOverlay((cur) => (id ? { kind: 'post', id } : cur?.kind === 'post' ? null : cur))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const close = useCallback(() => {
    if ((history.state as { post?: string } | null)?.post) history.back()
    else setOverlay(null)
  }, [])
  const open = (id: string) => {
    history.pushState({ post: id }, '')
    setOverlay({ kind: 'post', id })
  }

  if (session.mode === 'cloud' && session.user === undefined) return <div className="splash">{t('Loading…')}</div>
  if (session.mode === 'cloud' && !session.user) {
    return (
      <div className="splash">
        <img className="splash-logo" src={`${import.meta.env.BASE_URL}static-logo.png`} alt="Static" />
        <h1>{t('Static OS')}</h1>
        <p>{t('Prices, PC builds and quotations, offers and posters, in one place.')}</p>
        <button className="btn btn-primary" onClick={signIn}>{t('Sign in with Google')}</button>
        {session.error && <p className="bad">{session.error}</p>}
      </div>
    )
  }
  if (session.mode === 'cloud' && session.access === 'checking') return <div className="splash">{session.error ? <p className="bad">{session.error}</p> : t('Loading…')}</div>
  if (session.mode === 'cloud' && (session.access === 'outside' || session.access === 'waiting')) return <JoinScreen session={session} />
  if (session.mode === 'cloud' && /permission|insufficient/i.test(session.error)) {
    return (
      <div className="splash">
        <Logo size={72} />
        <p className="bad">{t('This account is not allowed to open the app.')}</p>
        <p dir="ltr">{session.user?.email}</p>
        <p className="hint">{t('If you were given a system code, refresh to get the screen where you can enter it.')}</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>{t('Refresh')}</button>
        <button className="btn" onClick={() => signOutNow()}>{t('Sign out')}</button>
      </div>
    )
  }

  const { data } = session
  const counts: Partial<Record<Tab, number>> = {
    // Offers waiting for this person: ones to approve, or their own that were sent back.
    offers: data.posts.filter((p) => stageOf(p) === 'offer' && (offerOf(p) === 'waiting' ? allowed('offers.approve') && !ownOffer(p) : p.createdBy === myId() || isOwner())).length,
    review: data.posts.filter((p) => stageOf(p) === 'review').length,
    fix: data.posts.filter((p) => stageOf(p) === 'fix').length,
  }
  const openPost = overlay?.kind === 'post' ? data.posts.find((p) => p.id === overlay.id) : undefined
  const health = data.health
  const quiet = session.mode === 'cloud' && data.loaded && postWork() && (!health || Date.now() - health.lastSync > QUIET_MS)
  // The last knock to the engine did not arrive after a few tries (shown for 30 minutes, or until a knock arrives).
  const unheard = session.mode === 'cloud' && postWork() && signal?.state === 'failed' && Date.now() - signal.at < 30 * 60_000
  const dotBad = quiet || unheard
  const dotTitle = signal && signal.state !== 'failed' ? `${t('Engine received the last change')}: ${agoLabel(signal.at)}` : unheard ? t('The engine did not answer the app') : (health ? agoLabel(health.lastSync) : '')

  const title = t(tab === 'home' ? (desktop ? 'Dashboard' : 'Static OS') : TABS.find((x) => x.id === tab)!.label)
  const banners = (
    <>
      {session.mode === 'demo' && <p className="banner"><b>{t('Demo mode')}.</b> {t('Sample data in this browser. Nothing is posted.')}</p>}
      {quiet && <p className="banner banner-bad">{t('The engine has been quiet for a while. Check that n8n is running.')}</p>}
      {unheard && !quiet && <p className="banner banner-bad">{t('The engine did not answer the app. Your change is saved and will be done at the engine\'s next check. Check that n8n is running.')}</p>}
      {session.error && <p className="banner banner-bad" dir="ltr">{session.error}</p>}
    </>
  )
  const page = !data.loaded ? (
    <div className="splash">{t('Loading…')}</div>
  ) : tab === 'home' && solo ? (
    <Launcher items={TABS.filter((x) => x.id !== 'home')} counts={counts} name={myNameFor(session.user)} uid={session.user?.uid} photo={session.user?.photoURL ?? ''} onGo={(id) => go(id as Tab)} onSettings={() => setOverlay({ kind: 'settings' })} />
  ) : tab === 'home' || tab === 'dashboard' ? (
    <HomeView data={data} go={go} onOpen={open} desktop={desktop} />
  ) : tab === 'prices' ? (
    <PricesView />
  ) : tab === 'builder' ? (
    <BuilderView />
  ) : tab === 'offers' ? (
    <OffersView data={data} onOpen={open} />
  ) : tab === 'review' ? (
    <ReviewView data={data} onOpen={open} />
  ) : tab === 'fix' ? (
    <FixView data={data} onOpen={open} />
  ) : tab === 'calendar' ? (
    <PlannerView data={data} onOpen={open} />
  ) : tab === 'maintenance' ? (
    <MaintenanceView />
  ) : tab === 'orders' ? (
    <OrdersView />
  ) : tab === 'hr' ? (
    <HrView />
  ) : tab === 'brainstorm' ? (
    <BrainstormView data={data} onOpen={open} />
  ) : tab === 'database' ? (
    <DatabaseView data={data} onOpen={open} />
  ) : tab === 'activity' ? (
    <ActivityView data={data} onOpen={open} />
  ) : (
    <PostedView data={data} onOpen={open} />
  )
  const overlays = (
    <>
      {openPost && <PostSheet key={openPost.id} post={openPost} data={data} onClose={close} />}
      {overlay?.kind === 'new' && <NewPostSheet data={data} onClose={close} />}
      {overlay?.kind === 'settings' && <SettingsSheet session={session} onClose={close} />}
      {(session.mode === 'demo' || session.access === 'in') && (allowed('hr.clock') || allowed('hr')) && <ClockPrompt />}
      <Toast />
    </>
  )

  // App grid: the home screen is every app as an icon; an open app shows only its own top bar,
  // with the other apps of its group (the poster stages) as a small menu.
  if (solo) {
    const current = TABS.find((x) => x.id === tab)!
    const group = APP_GROUPS.find((g) => g.ids.includes(tab))
    const siblings = group ? TABS.filter((x) => group.ids.includes(x.id)) : []
    const subnav = siblings.length > 1 && (
      <nav className="appbar-menu" aria-label={t(group!.title)}>
        {siblings.map((x) => (
          <button key={x.id} className={x.id === tab ? 'on' : ''} onClick={() => go(x.id)} aria-current={x.id === tab ? 'page' : undefined}>
            {t(x.label)}
            {counts[x.id] ? <i className={x.id === 'fix' ? 'count count-bad' : 'count'}>{counts[x.id]}</i> : null}
          </button>
        ))}
      </nav>
    )
    const home = tab === 'home'
    const name = myNameFor(session.user) || t('Demo mode')
    const addHere = canAdd && postWork() && (tab === 'offers' || tab === 'dashboard')
    const bar = (
      <header className="appbar">
        {home ? (
          <span className="appbar-brand"><Logo size={desktop ? 34 : 30} /><span>Static <b>OS</b></span></span>
        ) : (
          <>
            <button className="icon-btn appbar-home" onClick={() => go('home')} aria-label={t('All apps')} title={t('All apps')}><Icon name="apps" size={20} /></button>
            <span className="appbar-app"><AppIcon id={tab} icon={current.icon} size={desktop ? 34 : 30} /><h1>{t(current.label)}</h1></span>
            {desktop && subnav}
          </>
        )}
        <span className="appbar-end">
          {desktop && addHere && <button className="btn btn-primary" onClick={() => setOverlay({ kind: 'new' })}><Icon name="plus" size={20} />{t('New offer')}</button>}
          {session.mode === 'cloud' && postWork() && <span className={`health${dotBad ? ' health-bad' : ''}`} title={dotTitle} />}
          <button className="icon-btn" onClick={() => setOverlay({ kind: 'settings' })} aria-label={t('Settings')} title={t('Settings')}><Icon name="settings" /></button>
          {desktop && <button className="avatar-btn" onClick={() => setOverlay({ kind: 'settings' })} aria-label={t('Settings')}><Avatar uid={session.user?.uid} name={name} photo={session.user?.photoURL ?? ''} title={name} /></button>}
        </span>
      </header>
    )
    if (desktop) {
      return (
        <div className="desk desk-solo">
          <div className="desk-main">
            {bar}
            {banners}
            <div className={`desk-content page-${tab}`}>{page}</div>
          </div>
          {overlays}
        </div>
      )
    }
    return (
      <div className="app app-solo">
        {bar}
        {!home && subnav}
        {banners}
        <main>{page}</main>
        {addHere && <button className="fab" onClick={() => setOverlay({ kind: 'new' })} aria-label={t('New offer')}><Icon name="plus" size={26} /></button>}
        {overlays}
      </div>
    )
  }

  // Desktop website: a sidebar and a dashboard that fills the window.
  if (desktop) {
    const name = myNameFor(session.user) || t('Demo mode')
    return (
      <div className="desk">
        <aside className="sidebar">
          <div className="brand"><Logo size={34} /><span>Static <b>OS</b></span></div>
          {canAdd && postWork() && <button className="btn btn-primary side-add" onClick={() => setOverlay({ kind: 'new' })}><Icon name="plus" size={20} />{t('New offer')}</button>}
          <nav className="side-nav">
            {TABS.map((x, i) => (
              <Fragment key={x.id}>
              {groupOf(x.id) && groupOf(x.id) !== groupOf(TABS[i - 1]?.id ?? 'home') && <p className="side-section">{t(groupOf(x.id))}</p>}
              <button className={x.id === tab ? 'on' : ''} onClick={() => go(x.id)} aria-current={x.id === tab ? 'page' : undefined}>
                <Icon name={x.icon} size={20} />
                <span>{t(x.id === 'home' ? 'Dashboard' : x.label)}</span>
                {counts[x.id] ? <i className={x.id === 'fix' ? 'count count-bad' : 'count'}>{counts[x.id]}</i> : null}
              </button>
              </Fragment>
            ))}
            <button onClick={() => setOverlay({ kind: 'settings' })}><Icon name="settings" size={20} /><span>{t('Settings')}</span></button>
          </nav>
          <div className="side-foot">
            {session.mode === 'cloud' && postWork() && (
              <p className="side-engine" title={dotTitle}><span className={`health${dotBad ? ' health-bad' : ''}`} />{t('Engine')}: {health ? agoLabel(health.lastSync) : '—'}</p>
            )}
            <div className="side-user">
              <Avatar uid={session.user?.uid} name={name} photo={session.user?.photoURL ?? ''} />
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

  // Phone bar: Home, the pinned apps, then Apps for everything else. On an app that is not in the bar,
  // the Apps button shows that app, so the person always sees where they are.
  const bar = TABS.filter((x) => x.id === 'home' || pins.includes(x.id))
  const current = TABS.find((x) => x.id === tab)!
  const inBar = bar.some((x) => x.id === tab)
  const appsOpen = overlay?.kind === 'apps'
  const hiddenCount = TABS.filter((x) => !bar.includes(x)).reduce((n, x) => n + (counts[x.id] ?? 0), 0)

  return (
    <div className="app">
      <header className="top">
        <Logo size={30} />
        <h1>{title}</h1>
        {session.mode === 'cloud' && postWork() && <span className={`health${dotBad ? ' health-bad' : ''}`} title={dotTitle} />}
        <button className="icon-btn" onClick={() => setOverlay({ kind: 'settings' })} aria-label={t('Settings')}><Icon name="settings" /></button>
      </header>
      {banners}
      <main>{page}</main>
      {canAdd && !appsOpen && (tab === 'home' || tab === 'offers') && <button className="fab" onClick={() => setOverlay({ kind: 'new' })} aria-label={t('New offer')}><Icon name="plus" size={26} /></button>}
      <nav className="tabs">
        {bar.map((x) => (
          <button key={x.id} className={x.id === tab ? 'on' : ''} onClick={() => go(x.id)} aria-current={x.id === tab ? 'page' : undefined}>
            <span className="tab-icon">
              <Icon name={x.icon} />
              {counts[x.id] ? <i className={x.id === 'fix' ? 'badge badge-bad' : 'badge'}>{counts[x.id]}</i> : null}
            </span>
            <span className="tab-label">{t(x.label)}</span>
          </button>
        ))}
        <button className={appsOpen || !inBar ? 'on' : ''} onClick={() => setOverlay(appsOpen ? null : { kind: 'apps' })} aria-expanded={appsOpen} aria-haspopup="dialog">
          <span className="tab-icon">
            <Icon name={inBar || appsOpen ? 'cards' : current.icon} />
            {hiddenCount ? <i className="badge">{hiddenCount}</i> : null}
          </span>
          <span className="tab-label">{t(inBar || appsOpen ? 'Apps' : current.label)}</span>
        </button>
      </nav>
      {appsOpen && (
        <AppsMenu
          items={TABS.filter((x) => x.id !== 'home')}
          current={tab}
          counts={counts}
          pins={pins}
          onToggle={togglePin}
          onGo={(id) => { setOverlay(null); go(id as Tab) }}
          onSettings={() => setOverlay({ kind: 'settings' })}
          onClose={close}
        />
      )}
      {overlays}
    </div>
  )
}

function Logo({ size }: { size: number }) {
  return <img className="logo-mark" src={`${import.meta.env.BASE_URL}static-mark.png`} width={Math.round(size * 0.84)} height={size} alt="" aria-hidden="true" />
}
