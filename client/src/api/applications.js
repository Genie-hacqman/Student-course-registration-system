import { useEffect, useMemo } from 'react'
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
  // Official application photo. The upload is the raw JPEG as the body; the server decides if it is still editable.
  setPhoto: (blob) => api.put('/applications/me/photo', blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } }).then(unwrap),
  removePhoto: () => api.delete('/applications/me/photo').then(unwrap),
  // Photos are private: they are fetched with the signed-in session and shown from a blob: URL, never a public link.
  myPhoto: () => api.get('/applications/me/photo', { responseType: 'blob' }).then((res) => res.data),
  reviewPhoto: (id) => api.get(`/applications/${id}/photo`, { responseType: 'blob' }).then((res) => res.data),
}

export const useApplicationOptions = () => useQuery({ queryKey: ['applications', 'options'], queryFn: applicationsApi.options, staleTime: 5 * 60_000 })
export const useMyApplication = () => useQuery({ queryKey: ['applications', 'me'], queryFn: applicationsApi.mine })

const useApplicationWrite = (mutationFn) => {
  const qc = useQueryClient()
  return useMutation({ mutationFn, onSuccess: (data) => qc.setQueryData(['applications', 'me'], data) })
}
export const useSaveApplication = () => useApplicationWrite(applicationsApi.save)
export const useSubmitApplication = () => useApplicationWrite(applicationsApi.submit)

/**
 * The official photo as a blob: URL (or undefined while loading / when there is none). `version` should change
 * whenever the stored photo does (its upload time), so a replaced photo is fetched again. `forReview` is the
 * reviewer's application id; omit it for the applicant's own photo.
 */
export const useOfficialPhotoUrl = ({ present, version, reviewId }) => {
  const query = useQuery({
    queryKey: ['applications', reviewId ? `review-${reviewId}` : 'me', 'photo', version ?? null],
    queryFn: () => (reviewId ? applicationsApi.reviewPhoto(reviewId) : applicationsApi.myPhoto()),
    enabled: Boolean(present),
    staleTime: Infinity, // the bytes for a given version never change
    gcTime: 0,
    retry: false,
  })
  const url = useMemo(() => (query.data ? URL.createObjectURL(query.data) : undefined), [query.data])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return { url, isLoading: query.isPending && Boolean(present), isError: query.isError }
}

/** Upload, replace or remove the official photo. The response is not written into the application cache: the form
 * keeps its own state, and swapping the application object would reset what the applicant has typed. */
export const useSetOfficialPhoto = () => useMutation({ mutationFn: applicationsApi.setPhoto })
export const useRemoveOfficialPhoto = () => useMutation({ mutationFn: applicationsApi.removePhoto })
