import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted so the demo works without venue wifi; only the weights the ledger uses.
import '@fontsource/libre-franklin/latin-400.css'
import '@fontsource/libre-franklin/latin-600.css'
import '@fontsource/libre-franklin/latin-800.css'
import '@fontsource/courier-prime/latin-400.css'
import '@fontsource/courier-prime/latin-700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
