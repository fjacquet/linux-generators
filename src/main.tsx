// MUST be the first import — installs runtime privacy/transport guards before
// any other module captures a reference to fetch/XHR/WebSocket/sendBeacon.
import './privacy/fetchGuard'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
// i18n must initialize before App renders so `useTranslation()` resolves keys
// synchronously on first paint.
import './i18n'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('linux-generators: missing #root element in index.html')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
