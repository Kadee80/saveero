import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { analytics } from './analytics/mixpanel'
import './index.css'

// Initialize product analytics before first render. No-ops if
// VITE_MIXPANEL_TOKEN is unset (local dev / preview), so this is always
// safe to call unconditionally.
analytics.init()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
