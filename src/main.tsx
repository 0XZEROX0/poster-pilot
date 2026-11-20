import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme'
import App from './App.tsx'
import { catchAppErrors } from './data/health'

// Crashes anywhere in the app go to System health (App errors), so they are seen even when nobody reports them.
catchAppErrors()

import('virtual:pwa-register').then(({ registerSW }) =>
  registerSW({
    immediate: true,
    // An open tab otherwise keeps the old version: look for a new one hourly and when the tab comes back.
    onRegisteredSW(_url, reg) {
      if (!reg) return
      setInterval(() => reg.update(), 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update())
    },
  }),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
