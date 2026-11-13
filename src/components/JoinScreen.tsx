import { useState } from 'react'
import { joinWithCode, signOutNow, withdrawRequest, type Session } from '../data/store'
import { REQUEST_DAYS } from '../data/team'
import { t } from '../i18n'

/** For a signed-in person who is not in the system yet: type the code, then wait to be accepted. */
export function JoinScreen({ session }: { session: Session }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function ask() {
    if (!code.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      if (!(await joinWithCode(code))) setError(t('That code is not right. Check it and try again.'))
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <div className="splash join">
      <h1>{t(session.access === 'waiting' ? 'Waiting to be accepted' : 'Join the system')}</h1>
      <p dir="ltr" className="muted">{session.user?.email}</p>
      {session.access === 'waiting' ? (
        <>
          <p>{t('Your request was sent. You will get in as soon as the owner or an admin accepts it.')}</p>
          <p className="hint">{t('A request that is not answered stops counting after')} {REQUEST_DAYS} {t('days')}.</p>
          <button className="btn" onClick={() => withdrawRequest()}>{t('Cancel my request')}</button>
        </>
      ) : (
        <form className="form join-form" onSubmit={(e) => { e.preventDefault(); void ask() }}>
          <p>{t('Ask the owner for the system code and paste it here.')}</p>
          <input dir="ltr" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="STATIC-XXXX-XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} aria-label={t('System code')} />
          {error && <p className="bad">{error}</p>}
          <button className="btn btn-primary" disabled={busy || !code.trim()}>{t('Ask to join')}</button>
        </form>
      )}
      <button className="btn btn-ghost" onClick={() => signOutNow()}>{t('Sign out')}</button>
    </div>
  )
}
