import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import {
  AlertCircle, AlertTriangle, CheckCircle2, CircleDashed, Clock, Inbox, Info, Loader2, MinusCircle, Search, X, XCircle,
} from 'lucide-react'

const cx = (...c) => c.filter(Boolean).join(' ')

const BUTTON = {
  primary: 'bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700 hover:shadow-md active:bg-brand-800 focus-visible:outline-brand-600 disabled:bg-brand-600/50 disabled:shadow-none',
  secondary: 'bg-white text-slate-700 shadow-xs ring-1 ring-slate-300 hover:bg-slate-50 hover:ring-slate-400 active:bg-slate-100 focus-visible:outline-brand-600 disabled:text-slate-400',
  danger: 'bg-red-600 text-white shadow-sm shadow-red-600/20 hover:bg-red-700 active:bg-red-800 focus-visible:outline-red-600 disabled:bg-red-600/50 disabled:shadow-none',
  ghost: 'text-slate-600 hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-brand-600 disabled:text-slate-400',
}

export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, ...props }) {
  return (
    <button
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-none',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-5 py-2.5 text-base' : 'px-4 py-2 text-sm',
        BUTTON[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Card({ className, children, ...props }) {
  return <div className={cx('min-w-0 rounded-xl bg-white shadow-sm ring-1 ring-slate-200', className)} {...props}>{children}</div>
}

export function CardHeader({ title, action, subtitle, icon: Icon }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-slate-100 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icon className="size-4" aria-hidden /></span>}
        <div className="min-w-0">
        <h2 className="font-semibold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

const TONES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/10',
  green: 'bg-green-50 text-green-700 ring-green-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-brand-50 text-brand-700 ring-brand-600/20',
}

export function Badge({ tone = 'slate', children, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', TONES[tone], className)}>
      {children}
    </span>
  )
}

const STATUS_ICON = { green: CheckCircle2, amber: Clock, red: XCircle, slate: CircleDashed, blue: Info }

/** Every status the UI shows, as tone + label. The icon keeps status readable without colour. */
const STATUS = {
  // registrations
  draft: ['slate', 'Draft'],
  submitted: ['amber', 'Awaiting approval'],
  pending: ['amber', 'Pending'],
  approved: ['green', 'Approved'],
  registered: ['blue', 'Registered'],
  rejected: ['red', 'Needs changes'],
  cancelled: ['slate', 'Cancelled'],
  not_started: ['slate', 'Not started'],
  // sections / course availability
  eligible: ['green', 'Available'],
  full: ['amber', 'Full'],
  blocked: ['red', 'Not eligible'],
  open: ['green', 'Open'],
  closed: ['amber', 'Closed'],
  // accounts
  active: ['green', 'Active'],
  inactive: ['slate', 'Inactive'],
  suspended: ['red', 'Suspended'],
  completed: ['green', 'Completed'],
  // teaching
  published: ['green', 'Published'],
  present: ['green', 'Present'],
  absent: ['red', 'Absent'],
  late: ['amber', 'Late'],
  excused: ['blue', 'Excused'],
  passed: ['green', 'Passed'],
  failed: ['red', 'Failed'],
}

/** A status pill with an icon, so the state never depends on colour alone. `label` overrides the default wording. */
export function StatusBadge({ status, label, tone, className }) {
  const [defaultTone, defaultLabel] = STATUS[status] ?? ['slate', status ?? 'Unknown']
  const t = tone ?? defaultTone
  const Icon = status === 'blocked' ? AlertTriangle : status === 'cancelled' || status === 'inactive' ? MinusCircle : STATUS_ICON[t]
  return (
    <Badge tone={t} className={className}>
      <Icon className="size-3" aria-hidden />
      {label ?? defaultLabel}
    </Badge>
  )
}

export const Input = forwardRef(function Input({ label, error, hint, className, ...props }, ref) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <input
        ref={ref}
        className={cx(
          'block w-full rounded-lg border-0 px-3 py-2 text-sm shadow-sm ring-1 ring-inset transition-shadow placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:outline-none',
          error ? 'ring-red-500 focus:ring-red-600' : 'ring-slate-300 hover:ring-slate-400 focus:ring-brand-500',
        )}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span>
        : hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
})

export const Select = forwardRef(function Select({ label, error, children, className, ...props }, ref) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <select
        ref={ref}
        className={cx(
          'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-inset transition-shadow focus:ring-2 focus:ring-inset focus:outline-none',
          error ? 'ring-red-500 focus:ring-red-600' : 'ring-slate-300 hover:ring-slate-400 focus:ring-brand-500',
        )}
        {...props}
      >
        {children}
      </select>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
})

export function Spinner({ className }) {
  return <Loader2 className={cx('size-5 animate-spin text-brand-600', className)} />
}

export function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-8" />
    </div>
  )
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Spinner /> {label}
    </div>
  )
}

/**
 * Client errors (4xx) carry messages written for users; anything else (5xx, network) could be
 * a raw server detail, so it gets a generic line instead.
 */
export const userMessage = (error) => {
  if (!error) return 'Something went wrong.'
  if (error.status >= 400 && error.status < 500 && error.message) return error.message
  if (!error.status) return 'We couldn’t reach the server. Check your connection and try again.'
  return 'Something went wrong on our side. Please try again in a moment.'
}

export function ErrorState({ error, onRetry, title = 'Unable to load this information' }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex size-14 animate-shake items-center justify-center rounded-full bg-red-50">
        <AlertCircle className="size-6 text-red-500" aria-hidden />
      </div>
      <div>
        <p className="font-medium text-slate-800">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{userMessage(error)}</p>
      </div>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function EmptyState({ title, children, icon: Icon = Inbox, action, compact }) {
  return (
    <div className={cx('flex flex-col items-center gap-2 px-6 text-center', compact ? 'py-8' : 'py-12')}>
      <div className={cx('flex items-center justify-center rounded-full bg-slate-100', compact ? 'size-11' : 'size-14')}>
        <Icon className={cx('text-slate-400', compact ? 'size-5' : 'size-6')} aria-hidden />
      </div>
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="max-w-sm text-sm text-slate-500">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Renders loading / error / content for a TanStack query. Pass `fallback` (e.g. a skeleton) to replace the spinner. */
export function QueryState({ query, children, loadingLabel, fallback, errorTitle }) {
  if (query.isPending) return fallback ?? <Loading label={loadingLabel} />
  if (query.isError) return <ErrorState error={query.error} title={errorTitle} onRetry={() => query.refetch()} />
  return children(query.data)
}


const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Keeps Tab inside `ref` while active, focuses its first control, and restores focus to the opener on close. */
export function useFocusTrap(ref, active, onEscape) {
  const escape = useRef(onEscape)
  useEffect(() => { escape.current = onEscape }, [onEscape])
  useEffect(() => {
    if (!active || !ref.current) return undefined
    const opener = document.activeElement
    const node = ref.current
    const first = node.querySelector('[data-autofocus]') ?? node.querySelector(FOCUSABLE)
    ;(first ?? node).focus({ preventScroll: true })
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); escape.current?.() }
      if (e.key !== 'Tab') return
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const [head, tail] = [items[0], items[items.length - 1]]
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus() }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus() }
    }
    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('keydown', onKey)
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [active, ref])
}

export function Modal({ open, onClose, title, children, footer, wide, description }) {
  const ref = useRef(null)
  const titleId = useId()
  useFocusTrap(ref, open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx('relative flex max-h-[92vh] w-full animate-modal-in flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:max-h-[90vh] sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 id={titleId} className="font-semibold tracking-tight">{title}</h3>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, action, eyebrow }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold tracking-wide text-brand-700 uppercase">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}

const BAR_TONE = { amber: 'bg-amber-500', red: 'bg-red-500', green: 'bg-green-600', brand: 'bg-brand-600' }

/** Fills from 0 on mount, then follows `value`. `label` names it for screen readers. */
export function ProgressBar({ value, max, tone = 'brand', label, size = 'md' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(pct))
    return () => cancelAnimationFrame(frame)
  }, [pct])
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max || 100}
      aria-valuenow={value}
      className={cx('w-full overflow-hidden rounded-full bg-slate-100 shadow-inner', size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2.5')}
    >
      <div className={cx('h-full rounded-full transition-[width] duration-700 ease-out', BAR_TONE[tone] ?? BAR_TONE.brand)} style={{ width: `${shown}%` }} />
    </div>
  )
}

/** A loading placeholder for text/values that haven't arrived yet. Size it via className (e.g. "h-8 w-16"). */
export function Skeleton({ className, style }) {
  return <div aria-hidden style={style} className={cx('animate-pulse rounded-md bg-slate-200/70', className)} />
}

/** Placeholder grid of stat cards. */
export function SkeletonCards({ count = 4, className }) {
  return (
    <div role="status" aria-label="Loading" className={cx('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="space-y-3 p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-32" />
        </Card>
      ))}
    </div>
  )
}

export function SkeletonList({ rows = 4 }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-slate-100">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/5" /><Skeleton className="h-3 w-3/5" /></div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3 p-5">
      <div className="flex gap-4">{Array.from({ length: cols }, (_, i) => <Skeleton key={i} className="h-3 flex-1" />)}</div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4">{Array.from({ length: cols }, (_, i) => <Skeleton key={i} className="h-5 flex-1" />)}</div>
      ))}
    </div>
  )
}

export function SkeletonChart({ height = 220 }) {
  return (
    <div role="status" aria-label="Loading chart" className="flex items-end gap-3 p-5" style={{ height }}>
      {[55, 80, 35, 65, 90, 45].map((h, i) => <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />)}
    </div>
  )
}

/**
 * A search box that fires `onSearch` on blur or Enter, not on every keystroke —
 * keeps list pages from refetching mid-typing.
 */
export function SearchInput({ defaultValue = '', onSearch, placeholder, className, ...props }) {
  const [value, setValue] = useState(defaultValue)
  const commit = () => onSearch(value.trim())
  return (
    <form
      className={cx('relative', className)}
      onSubmit={(e) => { e.preventDefault(); commit() }}
    >
      <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        className="block w-full rounded-lg border-0 py-2 pr-8 pl-9 text-sm shadow-sm ring-1 ring-slate-300 ring-inset transition-shadow placeholder:text-slate-400 hover:ring-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none"
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => { setValue(''); onSearch('') }}
          className="absolute top-2.5 right-2.5 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="size-3.5" />
        </button>
      )}
    </form>
  )
}

const TAB_VARIANTS = {
  pills: {
    list: 'inline-flex gap-1 rounded-full bg-slate-100 p-1',
    tab: 'rounded-full px-4 py-1.5 text-sm font-medium transition',
    active: 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200',
    inactive: 'text-slate-600 hover:text-slate-900',
  },
  underline: {
    list: 'flex gap-6 border-b border-slate-200',
    tab: 'border-b-2 px-1 py-2.5 text-sm font-medium transition',
    active: 'border-brand-600 text-brand-700',
    inactive: 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
  },
}

/** A controlled tab bar. `items` is `[{ value, label }]`; panel rendering stays with the caller. */
export function Tabs({ items, value, onChange, variant = 'pills', className, label }) {
  const v = TAB_VARIANTS[variant]
  // Arrow keys move between tabs, per the WAI-ARIA tabs pattern.
  const onKeyDown = (e) => {
    const i = items.findIndex((item) => item.value === value)
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null
    if (next === null) return
    e.preventDefault()
    const item = items[(next + items.length) % items.length]
    onChange(item.value)
    e.currentTarget.querySelector(`[data-value="${item.value}"]`)?.focus()
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cx('max-w-full overflow-x-auto', v.list, className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          data-value={item.value}
          tabIndex={value === item.value ? 0 : -1}
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cx(v.tab, 'shrink-0 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600', value === item.value ? v.active : v.inactive)}
        >
          {item.label}
          {item.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600 tabular-nums">{item.count}</span>}
        </button>
      ))}
    </div>
  )
}

export { cx }
