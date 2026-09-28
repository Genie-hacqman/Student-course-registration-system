import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useMarkAllRead, useMarkRead, useNotifications } from '../../api/notifications'
import { Button, Card, EmptyState, PageHeader, QueryState, SkeletonList, Tabs } from '../../components/ui'
import { NotificationItem } from '../../components/dashboard/NotificationItems'

export default function Notifications() {
  const [page, setPage] = useState(1)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const list = useNotifications({ page, limit: 20, unread: unreadOnly })
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const unread = list.data?.meta?.unreadCount ?? 0

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : 'You are all caught up'}
        action={<Button variant="secondary" size="sm" disabled={!unread} loading={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</Button>}
      />
      <Tabs
        className="mb-4"
        label="Show"
        items={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: unread }]}
        value={unreadOnly ? 'unread' : 'all'}
        onChange={(v) => { setUnreadOnly(v === 'unread'); setPage(1) }}
      />
      <Card>
        <QueryState query={list} fallback={<SkeletonList rows={5} />} errorTitle="Unable to load notifications">
          {({ items, meta }) => (items.length ? (
            <>
              <ul className="divide-y divide-slate-100">
                {items.map((n, i) => (
                  <li key={n.id} className="stagger animate-fade-up" style={{ '--i': i }}>
                    <NotificationItem n={n} onRead={(id) => markRead.mutate(id)} />
                  </li>
                ))}
              </ul>
              {meta.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <span className="text-slate-500">Page {meta.page} of {meta.totalPages}</span>
                  <Button variant="secondary" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              )}
            </>
          ) : <EmptyState title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} icon={Bell} />)}
        </QueryState>
      </Card>
    </div>
  )
}
