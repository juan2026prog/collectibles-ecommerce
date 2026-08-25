// Microsoft Clarity fail-safe global guard for third-party scripts
const clarityErrorHandler = (event: any) => {
  const error = event.reason || event.error;
  const message = event.message || (error && error.message) || '';
  const stack = (error && error.stack) || '';
  const filename = event.filename || '';

  if (
    message.includes('clarity') ||
    message.includes("reading 'sequence'") ||
    stack.includes('clarity') ||
    filename.includes('clarity')
  ) {
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }
};

window.addEventListener('error', clarityErrorHandler, true);
window.addEventListener('unhandledrejection', clarityErrorHandler, true);
(window as any).__BUILD_SHA__ = 'v2.4-clean-888af33';

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
