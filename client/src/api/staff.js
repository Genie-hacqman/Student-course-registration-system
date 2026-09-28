import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap, unwrapPage } from './client'

// Everything under ['admin'] is refreshed by staff socket events (see src/lib/socket.js).
export const staffKeys = {
  all: ['admin'],
  registrations: (params) => ['admin', 'registrations', params],
  registration: (id) => ['admin', 'registration', String(id)],
  report: (name, semesterId) => ['admin', 'reports', name, semesterId ?? 'current'],
}

export const useSemesters = () =>
  useQuery({
    queryKey: ['semesters'],
    queryFn: () => api.get('/semesters', { params: { limit: 100 } }).then(unwrap),
    staleTime: 5 * 60_000,
  })

export const useRegistrations = ({ status, semesterId, studentId, page = 1, limit = 20 }) =>
  useQuery({
    queryKey: staffKeys.registrations({ status, semesterId, studentId, page, limit }),
    queryFn: () => api.get('/admin/registrations', {
      params: {
        page, limit, ...(status ? { status } : {}), ...(semesterId ? { semesterId } : {}), ...(studentId ? { studentId } : {}),
        sort: status === 'submitted' ? 'submittedAt' : '-submittedAt',
      },
    }).then(unwrapPage),
    enabled: Boolean(semesterId || studentId),
    placeholderData: (prev) => prev,
  })

export const useRegistration = (id) =>
  useQuery({ queryKey: staffKeys.registration(id), queryFn: () => api.get(`/admin/registrations/${id}`).then(unwrap) })

/** The oldest submitted registration in the semester other than `exceptId`, for "review next". */
export const fetchNextPending = async (semesterId, exceptId) => {
  const { items } = await api.get('/admin/registrations', {
    params: { status: 'submitted', semesterId, sort: 'submittedAt', limit: 2 },
  }).then(unwrapPage)
  return items.find((r) => String(r.id) !== String(exceptId)) ?? null
}

export const useReview = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision, remarks }) =>
      api.patch(`/admin/registrations/${id}/${decision}`, remarks ? { remarks } : {}).then(unwrap),
    onSettled: () => qc.invalidateQueries({ queryKey: staffKeys.all }),
  })
}

export const useRegistrationSummary = (semesterId, { enabled = true } = {}) =>
  useQuery({
    queryKey: staffKeys.report('registration-summary', semesterId),
    queryFn: () => api.get('/admin/reports/registration-summary', { params: semesterId ? { semesterId } : {} }).then(unwrap),
    enabled,
  })

export const useCoursePopularity = (semesterId, { enabled = true } = {}) =>
  useQuery({
    queryKey: staffKeys.report('course-popularity', semesterId),
    queryFn: () => api.get('/admin/reports/course-popularity', { params: semesterId ? { semesterId } : {} }).then(unwrap),
    enabled,
  })

export const downloadStaffSlip = async (id, referenceNumber) => {
  const res = await api.get(`/admin/registrations/${id}/slip`, { params: { format: 'pdf' }, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `${referenceNumber ?? `registration-${id}`}.pdf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** People, structure and registration progress in one call, for the admin and registrar dashboards. */
export const useOverview = (semesterId, { enabled = true } = {}) =>
  useQuery({
    queryKey: staffKeys.report('overview', semesterId),
    queryFn: () => api.get('/admin/reports/overview', { params: semesterId ? { semesterId } : {} }).then(unwrap),
    enabled,
  })
