import * as Sentry from '@sentry/react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './ui'

/** What people see instead of a blank page when something in the app crashes. */
function CrashFallback({ eventId }) {
  return (
    <div role="alert" className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-50">
          <AlertTriangle className="size-7 text-amber-500" aria-hidden />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">
          This page hit an unexpected problem. Reloading usually fixes it. If it keeps happening, contact the registry.
        </p>
        {eventId && <p className="mt-3 text-xs text-slate-500">Reference: <span className="font-mono">{eventId}</span></p>}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Button variant="secondary" onClick={() => window.location.assign('/')}>Go home</Button>
        </div>
      </div>
    </div>
  )
}

/** Catches render crashes anywhere in the app; reports them when Sentry is on, and works the same when it is off. */
export default function AppErrorBoundary({ children }) {
  return <Sentry.ErrorBoundary fallback={({ eventId }) => <CrashFallback eventId={eventId} />}>{children}</Sentry.ErrorBoundary>
}
