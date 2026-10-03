import * as Sentry from '@sentry/react'
import { scrubUrl } from './scrub'

/*
 * Browser error tracking (Sentry). Off unless VITE_SENTRY_DSN is set at build time, so development and tests never
 * report anything. Errors only: no performance tracing and no session replay. No personal data: Sentry's default PII
 * is off, secret link tokens are redacted from every URL, and the user is identified by id and role only.
 */

const scrubBreadcrumb = (crumb) => {
  if (!crumb) return crumb
  const data = crumb.data && Object.fromEntries(Object.entries(crumb.data).map(([k, v]) => [k, scrubUrl(v)]))
  return { ...crumb, message: scrubUrl(crumb.message), data }
}

export const scrubBrowserEvent = (event) => {
  if (!event) return event
  const out = { ...event, message: scrubUrl(event.message) }
  if (out.request) out.request = { ...out.request, url: scrubUrl(out.request.url), headers: undefined, cookies: undefined }
  if (out.exception?.values) out.exception = { ...out.exception, values: out.exception.values.map((v) => ({ ...v, value: scrubUrl(v.value) })) }
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb)
  return out
}

let enabled = false

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE || undefined,
    sendDefaultPii: false,
    beforeSend: scrubBrowserEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    // Harmless browser noise that would otherwise fill the inbox.
    ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications'],
  })
  enabled = true
}

/** Tags reports with who hit the error, by id and role only (never name or email). `null` on sign-out. */
export function setMonitoringUser(user) {
  if (!enabled) return
  Sentry.setUser(user ? { id: String(user.id), segment: user.role?.name } : null)
}
