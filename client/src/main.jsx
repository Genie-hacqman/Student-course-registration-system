import './zodConfig'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from './auth/AuthProvider'
import App from './App.jsx'
import AppErrorBoundary from './components/AppErrorBoundary'
import { initMonitoring } from './lib/monitoring'
import { MotionProvider } from './lib/motionPresets'
import './index.css'

// Error tracking first, so a crash during start-up is reported too (a no-op without VITE_SENTRY_DSN).
initMonitoring()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry client errors (403/404/422…) — they won't change on their own.
      retry: (count, err) => (err?.status === 0 || err?.status >= 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MotionProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <AppErrorBoundary>
              <App />
            </AppErrorBoundary>
            <Toaster richColors position="top-right" closeButton />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </MotionProvider>
  </StrictMode>,
)
