import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrapPage } from './client'

export const useNotifications = ({ page = 1, limit = 20, unread } = {}) =>
  useQuery({
    queryKey: ['notifications', { page, limit, unread: Boolean(unread) }],
    queryFn: () => api.get('/notifications', { params: { page, limit, ...(unread ? { unread: true } : {}) } }).then(unwrapPage),
    placeholderData: (prev) => prev,
  })

/** Cheap query used only for the header badge; the server returns unreadCount in `meta`. */
export const useUnreadCount = () => {
  const { data } = useNotifications({ page: 1, limit: 5 })
  return data?.meta?.unreadCount ?? 0
}

const useNotificationMutation = (mutationFn) => {
  const qc = useQueryClient()
  return useMutation({ mutationFn, onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) })
}

export const useMarkRead = () => useNotificationMutation((id) => api.patch(`/notifications/${id}/read`))
export const useMarkAllRead = () => useNotificationMutation(() => api.patch('/notifications/read-all'))
