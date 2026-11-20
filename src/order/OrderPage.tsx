import { useEffect, useState } from 'react'
import { initializeApp } from 'firebase/app'
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, updateDoc } from 'firebase/firestore/lite'
import { AREAS, cleanForm, formProblem, toLink, tokenOk, type LinkForm, type OrderLink } from '../data/orderLinkCore'

// The customer's page for one order link. Reads the link by its token (the rules let anyone with the exact token read
// it while it works), shows the items and the total, and sends the form once. Arabic first, English on a tap.

type Lang = 'ar' | 'en'
const KEY = 'static.order.lang'
const startLang = (): Lang => { try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'ar') return v } catch { /* no storage */ } return 'ar' }

const AR: Record<string, string> = {
  'Your order': 'طلبك', 'Loading your order…': 'جاري تحميل طلبك…', Items: 'المنتجات', Discount: 'خصم', Delivery: 'التوصيل', Total: 'الإجمالي', EGP: 'جنيه',
  'Store pickup': 'استلام من المحل', 'Home delivery': 'توصيل للمنزل', 'Pickup day': 'يوم الاستلام', 'Delivery day': 'يوم التوصيل',
  'Your details': 'بياناتك', 'Full name': 'الاسم بالكامل', 'Phone (WhatsApp)': 'رقم الموبايل (واتساب)', 'Email (optional)': 'البريد الإلكتروني (اختياري)',
  Governorate: 'المحافظة', 'Pick your governorate': 'اختار المحافظة', 'City or area': 'المدينة أو المنطقة', 'Full address (street, building, floor, apartment)': 'العنوان بالتفصيل (الشارع، العمارة، الدور، الشقة)',
  'Note (optional)': 'ملاحظة (اختياري)', 'Send my order': 'تأكيد الطلب', 'Sending…': 'جاري الإرسال…',
  'This link works for %n more minutes.': 'اللينك شغال لمدة %n دقيقة كمان.', 'This link works for 1 more minute.': 'اللينك شغال لمدة دقيقة كمان.',
  'The price is fixed in this link. We will call you to confirm the order and how you pay.': 'السعر ثابت في اللينك ده. هنكلمك نأكد الطلب وطريقة الدفع.',
  'Thank you, we received your order': 'شكراً، وصلنا طلبك',
  'We will call you soon to confirm it.': 'هنكلمك قريب نأكد الطلب.',
  'Order number': 'رقم الطلب',
  'This link is no longer valid': 'اللينك ده مبقاش شغال',
  'It may have expired or been used already. Please message us on WhatsApp for a new one.': 'ممكن يكون انتهى وقته أو اتستخدم قبل كده. ابعتلنا على واتساب ونبعتلك لينك جديد.',
  'Could not send. Check your connection and try again.': 'مقدرناش نبعت الطلب. اتأكد من الإنترنت وجرب تاني.',
  'Please write your name.': 'من فضلك اكتب اسمك.', 'Please write a phone number we can call.': 'من فضلك اكتب رقم موبايل نقدر نكلمك عليه.',
  'The email address does not look right.': 'البريد الإلكتروني مش مكتوب صح.', 'Please pick your governorate.': 'من فضلك اختار المحافظة.',
  'Please write your city or area.': 'من فضلك اكتب المدينة أو المنطقة.', 'Please write the full address.': 'من فضلك اكتب العنوان بالتفصيل.',
  'From the shop': 'من المحل', English: 'English', 'العربية': 'العربية',
}

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
const db = config.apiKey && config.projectId ? getFirestore(initializeApp(config)) : null
// Local testing only (npm run dev with VITE_EMULATOR=1); never in the built page.
if (import.meta.env.DEV && import.meta.env.VITE_EMULATOR && db) connectFirestoreEmulator(db, '127.0.0.1', 8085)

type View = { kind: 'loading' } | { kind: 'gone' } | { kind: 'open'; link: OrderLink } | { kind: 'sent'; link: OrderLink }

const EMPTY: LinkForm = { name: '', phone: '', email: '', address: '', city: '', area: '', note: '' }

export function OrderPage() {
  const [lang, setLangState] = useState<Lang>(startLang)
  const t = (s: string) => (lang === 'ar' ? AR[s] ?? s : s)
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem(KEY, l) } catch { /* fine */ } }
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr' }, [lang])

  const token = decodeURIComponent(location.hash.replace(/^#\/?/, '')).trim()
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [form, setForm] = useState<LinkForm>(EMPTY)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)

  useEffect(() => {
    if (!db || !tokenOk(token)) { setView({ kind: 'gone' }); return }
    getDoc(doc(db, 'orderLinks', token)).then((snap) => {
      if (!snap.exists()) { setView({ kind: 'gone' }); return }
      const link = toLink(snap.id, snap.data())
      if (link.state === 'open' && link.expiresAt > Date.now()) setView({ kind: 'open', link })
      else if (['filled', 'sending', 'done', 'error'].includes(link.state)) setView({ kind: 'sent', link })
      else setView({ kind: 'gone' })
    }, () => setView({ kind: 'gone' }))
  }, [token])
  useEffect(() => {
    if (view.kind !== 'open') return
    const id = setInterval(() => {
      tick((n) => n + 1)
      if (view.link.expiresAt <= Date.now()) setView({ kind: 'gone' })
    }, 15_000)
    return () => clearInterval(id)
  }, [view])

  const money = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${t('EGP')}`
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const hour = (h: string) => { const [a, b] = h.split(':').map(Number); return new Date(Date.UTC(2000, 0, 1, a, b)).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) }
  const set = (k: keyof LinkForm) => (e: { target: { value: string } }) => { setForm((f) => ({ ...f, [k]: e.target.value })); setProblem('') }

  async function send(link: OrderLink) {
    const p = formProblem(form, link.delivery)
    if (p) { setProblem(t(p)); return }
    if (!db) return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'orderLinks', link.id), { state: 'filled', form: cleanForm(form, link.delivery), filledAt: serverTimestamp() })
      setView({ kind: 'sent', link: { ...link, state: 'filled' } })
    } catch (e) {
      // Refused: the link expired or was used meanwhile. Anything else: the connection.
      if (/permission/i.test(String(e))) setView({ kind: 'gone' })
      else setProblem(t('Could not send. Check your connection and try again.'))
    }
    setBusy(false)
  }

  const head = (
    <header className="op-head">
      <img src="./static-logo.png" alt="Static" className="op-logo" />
      <button className="op-lang" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'English' : 'العربية'}</button>
    </header>
  )

  if (view.kind === 'loading') return <main className="op">{head}<p className="op-muted op-center">{t('Loading your order…')}</p></main>
  if (view.kind === 'gone') {
    return (
      <main className="op">{head}
        <section className="op-card op-center">
          <h1>{t('This link is no longer valid')}</h1>
          <p className="op-muted">{t('It may have expired or been used already. Please message us on WhatsApp for a new one.')}</p>
        </section>
      </main>
    )
  }

  const link = view.link
  const summary = (
    <section className="op-card">
      <h2>{t('Items')}</h2>
      <ul className="op-items">
        {link.items.map((x, i) => (
          <li key={i}><span dir="auto">{x.qty > 1 && <b dir="ltr">{x.qty}× </b>}{x.name}</span><span className="op-num" dir="ltr">{money(x.total)}</span></li>
        ))}
        {link.discount > 0 && <li className="op-good"><span>{t('Discount')}</span><span className="op-num" dir="ltr">−{money(link.discount)}</span></li>}
        {link.delivery === 'delivery' && <li><span>{t('Delivery')}</span><span className="op-num" dir="ltr">{money(link.shipping)}</span></li>}
        <li className="op-total"><span>{t('Total')}</span><span className="op-num" dir="ltr">{money(link.total)}</span></li>
      </ul>
      <p className="op-tag">{t(link.delivery === 'pickup' ? 'Store pickup' : 'Home delivery')}
        {link.date && <> · {t(link.delivery === 'pickup' ? 'Pickup day' : 'Delivery day')}: {day(link.date)}{link.time ? ` ${hour(link.time)}` : ''}</>}
      </p>
      {link.note && <p className="op-note"><b>{t('From the shop')}:</b> <span dir="auto">{link.note}</span></p>}
    </section>
  )

  if (view.kind === 'sent') {
    return (
      <main className="op">{head}
        <section className="op-card op-center op-done">
          <div className="op-check" aria-hidden="true">✓</div>
          <h1>{t('Thank you, we received your order')}</h1>
          <p className="op-muted">{t('We will call you soon to confirm it.')}</p>
          {link.number && <p>{t('Order number')}: <b dir="ltr">#{link.number}</b></p>}
        </section>
        {summary}
      </main>
    )
  }

  const left = Math.max(1, Math.ceil((link.expiresAt - Date.now()) / 60000))
  const d = link.delivery === 'delivery'
  return (
    <main className="op">{head}
      <h1 className="op-title">{t('Your order')}</h1>
      {summary}
      <form className="op-card op-form" onSubmit={(e) => { e.preventDefault(); void send(link) }} noValidate>
        <h2>{t('Your details')}</h2>
        <label><span>{t('Full name')}</span><input value={form.name} onChange={set('name')} autoComplete="name" dir="auto" maxLength={120} required /></label>
        <label><span>{t('Phone (WhatsApp)')}</span><input value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" dir="ltr" maxLength={20} placeholder="01xxxxxxxxx" required /></label>
        <label><span>{t('Email (optional)')}</span><input value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" type="email" dir="ltr" maxLength={120} /></label>
        {d && (
          <>
            <label><span>{t('Governorate')}</span>
              <select value={form.area} onChange={set('area')} required>
                <option value="">{t('Pick your governorate')}</option>
                {AREAS.map((a) => <option key={a.code} value={a.en}>{lang === 'ar' ? a.ar : a.en}</option>)}
              </select>
            </label>
            <label><span>{t('City or area')}</span><input value={form.city} onChange={set('city')} autoComplete="address-level2" dir="auto" maxLength={80} required /></label>
            <label><span>{t('Full address (street, building, floor, apartment)')}</span><textarea rows={3} value={form.address} onChange={set('address')} autoComplete="street-address" dir="auto" maxLength={300} required /></label>
          </>
        )}
        <label><span>{t('Note (optional)')}</span><textarea rows={2} value={form.note} onChange={set('note')} dir="auto" maxLength={500} /></label>
        {problem && <p className="op-bad" role="alert">{problem}</p>}
        <button className="op-send" type="submit" disabled={busy}>{busy ? t('Sending…') : t('Send my order')}</button>
        <p className="op-muted op-small">{t('The price is fixed in this link. We will call you to confirm the order and how you pay.')}</p>
        <p className="op-muted op-small">{left === 1 ? t('This link works for 1 more minute.') : t('This link works for %n more minutes.').replace('%n', String(left))}</p>
      </form>
    </main>
  )
}
