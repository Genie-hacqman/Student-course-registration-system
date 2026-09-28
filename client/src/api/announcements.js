import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrapPage } from './client'

export const AUDIENCES = {
  section: 'A course section',
  program: 'A programme',
  all_students: 'All students',
  all_lecturers: 'All lecturers',
  all_staff: 'All staff',
  everyone: 'Everyone',
}

export const useAnnouncements = ({ page = 1, limit = 10 } = {}) =>
  useQuery({
    queryKey: ['announcements', 'feed', { page, limit }],
    queryFn: () => api.get('/announcements', { params: { page, limit } }).then(unwrapPage),
    placeholderData: (prev) => prev,
  })

export const useMyAnnouncements = ({ page = 1, limit = 10, enabled = true } = {}) =>
  useQuery({
    enabled,
    queryKey: ['announcements', 'mine', { page, limit }],
    queryFn: () => api.get('/announcements/mine', { params: { page, limit } }).then(unwrapPage),
    placeholderData: (prev) => prev,
  })

const useAnnouncementMutation = (fn) => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ['announcements'] }) })
}

export const useCreateAnnouncement = () => useAnnouncementMutation((body) => api.post('/announcements', body).then((r) => r.data.data))
export const useUpdateAnnouncement = () =>
  useAnnouncementMutation(({ id, ...body }) => api.patch(`/announcements/${id}`, body).then((r) => r.data.data))
export const useDeleteAnnouncement = () => useAnnouncementMutation((id) => api.delete(`/announcements/${id}`))
