import { useQueries, useQuery } from '@tanstack/react-query'
import { api, unwrap } from './client'

export const lecturerKeys = {
  sections: ['lecturer', 'sections'],
  timetable: ['timetable', 'lecturer'],
  tasks: ['lecturer', 'tasks'],
  roster: (id) => ['roster', String(id)],
}

export const useMySections = ({ enabled = true } = {}) =>
  useQuery({ queryKey: lecturerKeys.sections, queryFn: () => api.get('/lecturers/me/sections').then(unwrap), enabled })

export const useLecturerTimetable = () =>
  useQuery({ queryKey: lecturerKeys.timetable, queryFn: () => api.get('/timetable/lecturer/me').then(unwrap) })

export const useLecturerTasks = () =>
  useQuery({ queryKey: lecturerKeys.tasks, queryFn: () => api.get('/lecturers/me/tasks').then(unwrap) })

export const useRoster = (sectionId) =>
  useQuery({
    queryKey: lecturerKeys.roster(sectionId),
    queryFn: () => api.get(`/lecturers/sections/${sectionId}/roster`).then(unwrap),
    enabled: Boolean(sectionId),
  })

export const useRosters = (sectionIds) =>
  useQueries({
    queries: sectionIds.map((id) => ({
      queryKey: lecturerKeys.roster(id),
      queryFn: () => api.get(`/lecturers/sections/${id}/roster`).then(unwrap),
    })),
  })

export const currentSections = (sections = []) => {
  const current = sections.filter((s) => s.semester?.isCurrent)
  if (current.length) return current
  const latest = Math.max(...sections.map((s) => s.semester?.id ?? 0))
  return sections.filter((s) => (s.semester?.id ?? 0) === latest)
}
