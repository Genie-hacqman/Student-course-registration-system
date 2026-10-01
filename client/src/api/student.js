import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from './client'

export const keys = {
  current: ['registration', 'current'],
  history: ['registration', 'history'],
  available: ['available-courses'],
  departments: ['departments'],
  course: (id) => ['course', String(id)],
  prereqCheck: (id) => ['prereq-check', String(id)],
  timetable: (semesterId) => ['timetable', semesterId ?? 'current'],
  results: ['results'],
  waitlists: ['waitlists', 'me'],
}

export const useCurrentRegistration = () =>
  useQuery({ queryKey: keys.current, queryFn: () => api.get('/registrations/current').then(unwrap) })

export const useRegistrationHistory = () =>
  useQuery({ queryKey: keys.history, queryFn: () => api.get('/registrations/history').then(unwrap) })

// The whole curriculum for one semester is small, so it's fetched once and searched/filtered on the client.
export const useAvailableCourses = () =>
  useQuery({ queryKey: keys.available, queryFn: () => api.get('/registrations/available-courses').then(unwrap) })

export const useDepartments = () =>
  useQuery({ queryKey: keys.departments, queryFn: () => api.get('/departments').then(unwrap), staleTime: 10 * 60_000 })

export const useCourse = (id) =>
  useQuery({ queryKey: keys.course(id), queryFn: () => api.get(`/courses/${id}`).then(unwrap) })

export const usePrerequisiteCheck = (id) =>
  useQuery({ queryKey: keys.prereqCheck(id), queryFn: () => api.get(`/courses/${id}/prerequisites/check`).then(unwrap) })

export const useTimetable = (semesterId) =>
  useQuery({
    queryKey: keys.timetable(semesterId),
    queryFn: () => api.get('/timetable/me', { params: semesterId ? { semesterId } : {} }).then(unwrap),
  })

export const useResults = () =>
  useQuery({ queryKey: keys.results, queryFn: () => api.get('/students/me/results').then(unwrap) })

export const useMyWaitlists = () =>
  useQuery({ queryKey: keys.waitlists, queryFn: () => api.get('/waitlists/me').then(unwrap) })

/** Everything a registration change can affect. */
export const invalidateRegistration = (qc) => Promise.all([
  qc.invalidateQueries({ queryKey: ['registration'] }),
  qc.invalidateQueries({ queryKey: keys.available }),
  qc.invalidateQueries({ queryKey: ['timetable'] }),
  qc.invalidateQueries({ queryKey: ['prereq-check'] }),
  qc.invalidateQueries({ queryKey: ['course'] }),
  qc.invalidateQueries({ queryKey: keys.waitlists }),
])

const useRegistrationMutation = (mutationFn) => {
  const qc = useQueryClient()
  return useMutation({ mutationFn, onSettled: () => invalidateRegistration(qc) })
}

export const useAddCourse = () =>
  useRegistrationMutation((courseSectionId) => api.post('/registrations/items', { courseSectionId }).then(unwrap))

export const useDropCourse = () =>
  useRegistrationMutation((itemId) => api.delete(`/registrations/items/${itemId}`).then(unwrap))

export const useSubmitRegistration = () =>
  useRegistrationMutation(() => api.post('/registrations/submit').then(unwrap))

export const useJoinWaitlist = () =>
  useRegistrationMutation((courseSectionId) => api.post('/waitlists', { courseSectionId }).then(unwrap))

export const useLeaveWaitlist = () =>
  useRegistrationMutation((id) => api.delete(`/waitlists/${id}`))

export const useSemesterList = () =>
  useQuery({ queryKey: ['semesters'], queryFn: () => api.get('/semesters', { params: { limit: 100 } }).then(unwrap), staleTime: 5 * 60_000 })

const fetchSlip = (registrationId) =>
  api.get(`/registrations/${registrationId}/slip`, { params: { format: 'pdf' }, responseType: 'blob' }).then((res) => res.data)

/** The slip endpoint needs the Bearer token, so it's fetched as a blob instead of linked directly. */
export const downloadSlip = async (registrationId, referenceNumber) => {
  const url = URL.createObjectURL(await fetchSlip(registrationId))
  const a = document.createElement('a')
  a.href = url
  a.download = `${referenceNumber ?? 'registration-slip'}.pdf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Loads the same PDF into a hidden frame and opens the browser's print dialog for it. */
export const printSlip = async (registrationId) => {
  const url = URL.createObjectURL(await fetchSlip(registrationId))
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  const cleanup = (delay) => setTimeout(() => { frame.remove(); URL.revokeObjectURL(url) }, delay)
  frame.src = url
  frame.onload = () => {
    try {
      frame.contentWindow.focus()
      frame.contentWindow.print()
      // Removing the frame immediately would cancel the dialog in some browsers.
      cleanup(60_000)
    } catch {
      // Printing from the frame was refused; show the PDF in a tab so it can be printed from there.
      window.open(url, '_blank')
      cleanup(60_000)
    }
  }
  frame.onerror = () => { window.open(url, '_blank'); cleanup(60_000) }
  document.body.appendChild(frame)
}
