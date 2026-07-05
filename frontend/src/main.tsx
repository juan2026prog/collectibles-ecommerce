// Microsoft Clarity fail-safe global guard for production
if (import.meta.env.PROD) {
  const clarityErrorHandler = (event: any) => {
    const error = event.reason || event.error;
    const message = event.message || (error && error.message) || '';
    const stack = (error && error.stack) || '';
    const filename = event.filename || '';

    if (
      message.includes('clarity') ||
      stack.includes('clarity') ||
      filename.includes('clarity')
    ) {
      // Prevent Clarity errors from crashing or spamming console/analytics in production
      event.preventDefault();
      return true;
    }
  };

  window.addEventListener('error', clarityErrorHandler, true);
  window.addEventListener('unhandledrejection', clarityErrorHandler, true);
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </ErrorBoundary>
  </StrictMode>,
)
