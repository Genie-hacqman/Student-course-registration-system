import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Bell, CheckCircle2, CheckCheck, Info, Megaphone, Star } from 'lucide-react'
import { useMarkAllRead, useMarkRead, useNotifications } from '../../api/notifications'
import { Badge, SkeletonList, cx, useFocusTrap } from '../ui'
import { timeAgo } from '../../lib/format'

/** Categories for the student dashboard and the notification center, derived from the notification type. */
export const CATEGORIES = {
  action: { label: 'Action required', tone: 'red', icon: AlertCircle, dot: 'bg-red-50 text-red-600' },
  important: { label: 'Important', tone: 'amber', icon: Star, dot: 'bg-amber-50 text-amber-600' },
  success: { label: 'Success', tone: 'green', icon: CheckCircle2, dot: 'bg-green-50 text-green-600' },
  info: { label: 'Information', tone: 'blue', icon: Info, dot: 'bg-brand-50 text-brand-600' },
}

export const categoryOf = (type = '') => {
  if (/REJECTED|WAITLIST_SEAT|REQUEST_CREATED|ACTION/.test(type)) return 'action'
  if (/APPROVED|REGISTERED|ADDED|OVERRIDE|CONFIRMED/.test(type)) return 'success'
  if (/GRADE|DROPPED|ASSESSMENT|AMENDED|TIME/.test(type)) return 'important'
  return 'info'
}

export function NotificationItem({ n, onRead, compact }) {
  const cat = CATEGORIES[categoryOf(n.type)]
  const Icon = n.type === 'ANNOUNCEMENT' ? Megaphone : cat.icon
  return (
    <div className={cx('flex gap-3', compact ? 'px-4 py-3' : 'px-5 py-3.5', !n.readAt && 'bg-brand-50/40')}>
      <span className={cx('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', cat.dot)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cx('text-sm text-slate-800', !n.readAt && 'font-semibold')}>{n.title}</p>
          {!compact && <Badge tone={cat.tone}>{cat.label}</Badge>}
        </div>
        <p className={cx('text-sm text-slate-600', compact && 'line-clamp-2')}>{n.message}</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
          <time dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
          {!n.readAt && onRead && (
            <button type="button" onClick={() => onRead(n.id)} className="font-medium text-brand-600 hover:text-brand-700">Mark as read</button>
          )}
        </p>
      </div>
      {!n.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
    </div>
  )
}

/** Header bell: unread badge (pops once when the count changes) and a popover with the latest items. */
export function NotificationCenter({ allPath }) {
  const [open, setOpen] = useState(false)
  const list = useNotifications({ page: 1, limit: 5 })
  const unread = list.data?.meta?.unreadCount ?? 0
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const panel = useRef(null)
  const wrapper = useRef(null)
  useFocusTrap(panel, open, () => setOpen(false))

  useEffect(() => {
    if (!open) return undefined
    const onClick = (e) => { if (!wrapper.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span key={unread} className="absolute -top-0.5 -right-0.5 flex min-w-5 animate-badge-pop items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-2 top-16 z-50 animate-pop-in overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => markAll.mutate()} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                <CheckCheck className="size-3.5" aria-hidden /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {list.isPending ? <SkeletonList rows={3} /> : list.data?.items.length ? (
              <ul className="divide-y divide-slate-100">
                {list.data.items.map((n) => <li key={n.id}><NotificationItem n={n} compact onRead={(id) => markRead.mutate(id)} /></li>)}
              </ul>
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <Bell className="size-6 text-slate-300" aria-hidden />
                <p className="text-sm text-slate-500">You're all caught up.</p>
              </div>
            )}
          </div>
          <Link to={allPath} onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-slate-50">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  )
}
