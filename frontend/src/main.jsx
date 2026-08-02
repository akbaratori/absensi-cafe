import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import ErrorBoundary from './components/shared/ErrorBoundary'
import { registerServiceWorker } from './services/pushService'

// Register service worker for push notifications (non-blocking)
registerServiceWorker().catch(() => { });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

