import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from './client'

/** Online admission (SCRS-backend /api/applications). Reviewer screens use the generic hooks in api/admin.js. */
export const applicationsApi = {
  signUp: (body) => api.post('/applications/account', body).then(unwrap),
  activate: (body) => api.post('/applications/activate', body).then(unwrap),
  options: () => api.get('/applications/options').then(unwrap),
  mine: () => api.get('/applications/me').then(unwrap),
  save: (body) => api.put('/applications/me', body).then(unwrap),
  submit: () => api.post('/applications/me/submit').then(unwrap),
}

export const useApplicationOptions = () => useQuery({ queryKey: ['applications', 'options'], queryFn: applicationsApi.options, staleTime: 5 * 60_000 })
export const useMyApplication = () => useQuery({ queryKey: ['applications', 'me'], queryFn: applicationsApi.mine })

const useApplicationWrite = (mutationFn) => {
  const qc = useQueryClient()
  return useMutation({ mutationFn, onSuccess: (data) => qc.setQueryData(['applications', 'me'], data) })
}
export const useSaveApplication = () => useApplicationWrite(applicationsApi.save)
export const useSubmitApplication = () => useApplicationWrite(applicationsApi.submit)
