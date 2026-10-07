import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from './client'

export const applicationsApi = {
  signUp: (body) => api.post('/applications/account', body).then(unwrap),
  activate: (body) => api.post('/applications/activate', body).then(unwrap),
  options: () => api.get('/applications/options').then(unwrap),
  mine: () => api.get('/applications/me').then(unwrap),
  save: (body) => api.put('/applications/me', body).then(unwrap),
  submit: () => api.post('/applications/me/submit').then(unwrap),
  setPhoto: (blob) => api.put('/applications/me/photo', blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } }).then(unwrap),
  removePhoto: () => api.delete('/applications/me/photo').then(unwrap),
  myPhoto: () => api.get('/applications/me/photo', { responseType: 'blob' }).then((res) => res.data),
  reviewPhoto: (id, size = 'full') => api.get(`/applications/${id}/photo`, { params: { size }, responseType: 'blob' }).then((res) => res.data),
  forStudent: (studentId) => api.get(`/students/${studentId}/application`).then(unwrap),
  studentPhoto: (studentId, size = 'full') =>
    api.get(`/students/${studentId}/application/photo`, { params: { size }, responseType: 'blob' }).then((res) => res.data),
}

export const useApplicationOptions = () => useQuery({ queryKey: ['applications', 'options'], queryFn: applicationsApi.options, staleTime: 5 * 60_000 })
export const useMyApplication = () => useQuery({ queryKey: ['applications', 'me'], queryFn: applicationsApi.mine })

const useApplicationWrite = (mutationFn) => {
  const qc = useQueryClient()
  return useMutation({ mutationFn, onSuccess: (data) => qc.setQueryData(['applications', 'me'], data) })
}
export const useSaveApplication = () => useApplicationWrite(applicationsApi.save)
export const useSubmitApplication = () => useApplicationWrite(applicationsApi.submit)

const PHOTO_SOURCES = {
  me: () => applicationsApi.myPhoto(),
  review: (id, size) => applicationsApi.reviewPhoto(id, size),
  student: (id, size) => applicationsApi.studentPhoto(id, size),
}

export const useOfficialPhotoUrl = ({ present, version, source = 'me', size = 'full' }) => {
  const [kind, id] = source.split(':')
  const query = useQuery({
    queryKey: ['official-photo', source, size, version ?? null],
    queryFn: () => PHOTO_SOURCES[kind](id, size),
    enabled: Boolean(present),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  })
  const url = useMemo(() => (query.data ? URL.createObjectURL(query.data) : undefined), [query.data])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return { url, isLoading: query.isPending && Boolean(present), isError: query.isError, retry: () => query.refetch() }
}

export const useStudentApplication = (studentId) => {
  const query = useQuery({
    queryKey: ['students', String(studentId), 'application'],
    queryFn: () => applicationsApi.forStudent(studentId),
    retry: false,
  })
  const none = query.error?.status === 404
  return { ...query, none, isError: query.isError && !none }
}

export const useSetOfficialPhoto = () => useMutation({ mutationFn: applicationsApi.setPhoto })
export const useRemoveOfficialPhoto = () => useMutation({ mutationFn: applicationsApi.removePhoto })
