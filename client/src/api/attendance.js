import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from './client'

const keys = {
  section: (id) => ['attendance', 'section', String(id)],
  session: (id) => ['attendance', 'session', String(id)],
  mine: ['attendance', 'me'],
}

export const useSectionAttendance = (sectionId) =>
  useQuery({ queryKey: keys.section(sectionId), queryFn: () => api.get(`/sections/${sectionId}/attendance`).then(unwrap), enabled: Boolean(sectionId) })

export const useAttendanceSession = (sessionId) =>
  useQuery({ queryKey: keys.session(sessionId), queryFn: () => api.get(`/attendance/${sessionId}`).then(unwrap), enabled: Boolean(sessionId) })

export const useMyAttendance = () =>
  useQuery({ queryKey: keys.mine, queryFn: () => api.get('/students/me/attendance').then(unwrap) })

const useAttendanceMutation = (fn) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['attendance'] }),
      qc.invalidateQueries({ queryKey: ['lecturer', 'tasks'] }),
    ]),
  })
}

export const useCreateAttendance = () =>
  useAttendanceMutation(({ sectionId, ...body }) => api.post(`/sections/${sectionId}/attendance`, body).then(unwrap))
export const useUpdateAttendance = () =>
  useAttendanceMutation(({ sessionId, ...body }) => api.put(`/attendance/${sessionId}`, body).then(unwrap))
export const useDeleteAttendance = () =>
  useAttendanceMutation((sessionId) => api.delete(`/attendance/${sessionId}`))
