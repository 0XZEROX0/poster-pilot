import { useState } from 'react'
import { resetDemo } from '../data/localBackend'
import { backend, restartDemo, signOutNow, type Session } from '../data/store'
import type { CaptionTemplate } from '../data/types'
import { setLang, t, useLang } from '../i18n'
import { MembersSection } from './MembersSection'
import { Sheet } from './Sheet'
import { Icon, showToast } from './ui'

/** "5 min ago" for the engine's last sign of life. */
export function agoLabel(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60000)
  if (min < 1) return t('just now')
  if (min < 60) return `${min} ${t('min ago')}`
  return `${Math.round(min / 60)} ${t('h ago')}`
}

const ROLE: Partial<Record<Session['access'], string>> = { owner: 'Owner', admin: 'Admin', member: 'Member' }

export function SettingsSheet({ session, onClose }: { session: Session; onClose: () => void }) {
  const lang = useLang()
  const [templates, setTemplates] = useState<CaptionTemplate[]>(session.data.templates)
  const dirty = JSON.stringify(templates) !== JSON.stringify(session.data.templates)
  const edit = (i: number, patch: Partial<CaptionTemplate>) => setTemplates(templates.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const save = () => backend.saveTemplates(templates.filter((x) => x.name.trim())).then(() => showToast(t('Saved')))
  const health = session.data.health

  return (
    <Sheet title={t('Settings')} onClose={onClose} footer={dirty && <button className="btn btn-primary" onClick={save}>{t('Save')}</button>}>
      <div className="form narrow">
        <section className="set">
          <h3>{t('Language')}</h3>
          <div className="seg">
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
            <button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>العربية</button>
          </div>
        </section>
        <section className="set">
          <h3>{t('Account')}</h3>
          {session.mode === 'demo' ? (
            <>
              <p className="hint"><b>{t('Demo mode')}.</b> {t('Sample data in this browser. Nothing is posted.')}</p>
              <button className="btn" onClick={() => { resetDemo(); restartDemo(); onClose() }}>{t('Reset the demo')}</button>
            </>
          ) : (
            <>
              <p className="hint" dir="ltr">{session.user?.email}{ROLE[session.access] && <> · {t(ROLE[session.access]!)}</>}</p>
              <button className="btn" onClick={() => signOutNow()}>{t('Sign out')}</button>
            </>
          )}
        </section>
        {session.mode === 'cloud' && (session.access === 'owner' || session.access === 'admin') && <MembersSection session={session} />}
        {session.mode === 'cloud' && (
          <section className="set">
            <h3>{t('Engine')}</h3>
            <p className="hint">{health ? `${t('Last sync')}: ${agoLabel(health.lastSync)}` : t('No signal from the engine yet.')}</p>
          </section>
        )}
        <section className="set">
          <h3>{t('Posting rules')}</h3>
          <p className="hint">{t('Automatic slots start at 17:00 Cairo time, one every 15 minutes, 5 a day. A post with its own date and time ignores them.')}</p>
        </section>
        <section className="set">
          <h3>{t('Caption templates')}</h3>
          <p className="hint">{t('Placeholders: {name} {price} {before} {category} {company} {details}. A line whose value is empty is left out.')}</p>
          {templates.map((x, i) => (
            <fieldset key={i} className="item-box">
              <label><span>{t('Template name')}</span><input value={x.name} readOnly={x.name.toLowerCase() === 'default' && session.data.templates.some((s) => s.name === x.name)} onChange={(e) => edit(i, { name: e.target.value })} /></label>
              <label><span>{t('Caption')}</span><textarea dir="auto" rows={7} value={x.text} onChange={(e) => edit(i, { text: e.target.value })} /></label>
              {x.name.toLowerCase() !== 'default' && <button className="link link-danger" onClick={() => setTemplates(templates.filter((_, k) => k !== i))}><Icon name="trash" size={16} />{t('Delete')}</button>}
            </fieldset>
          ))}
          <button className="btn" onClick={() => setTemplates([...templates, { name: '', text: '🔵 {name}\n🟠 {price} EGP' }])}><Icon name="plus" size={18} />{t('Add a template')}</button>
        </section>
      </div>
    </Sheet>
  )
}
